import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getTokenMetadata,
} from '@solana/spl-token';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';

export const dynamic = 'force-dynamic';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Known tokens for quick resolution
const KNOWN_TOKENS: Record<string, { name: string; symbol: string; image: string }> = {
  'So11111111111111111111111111111111111111112': {
    name: 'Wrapped SOL',
    symbol: 'SOL',
    image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    name: 'USD Coin',
    symbol: 'USDC',
    image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': {
    name: 'USD Coin (Devnet)',
    symbol: 'USDC',
    image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    name: 'USDT',
    symbol: 'USDT',
    image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  },
};

interface TokenInfo {
  mint: string;
  balance: number;
  decimals: number;
  isToken2022: boolean;
  name: string;
  symbol: string;
  image: string;
}

function deriveMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return pda;
}

function cleanStr(s: string): string {
  return s.replace(/\0/g, '').trim();
}

async function resolveImageFromUri(uri: string): Promise<string> {
  if (!uri) return '';
  try {
    // If it's clearly an image URL by extension, return directly
    if (uri.match(/\.(png|jpg|jpeg|gif|webp|svg|avif)(\?.*)?$/i)) return uri;

    // Fetch the URI with a HEAD first to check content type
    const headRes = await fetch(uri, {
      method: 'HEAD',
      signal: AbortSignal.timeout(4000),
    });
    if (!headRes.ok) return '';

    const contentType = headRes.headers.get('content-type') || '';

    // If the URI itself is an image, return it directly
    if (contentType.startsWith('image/')) return uri;

    // If it's JSON, try parsing to extract image field
    if (contentType.includes('json') || contentType.includes('text')) {
      const res = await fetch(uri, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return '';
      const json = await res.json();
      return json.image || json.icon || '';
    }

    // Fallback: assume it might be an image URL (IPFS gateways, etc.)
    return uri;
  } catch {
    // If HEAD fails, the URI itself might still be a valid image
    // (some servers don't support HEAD). Return it and let the browser handle it.
    if (uri.startsWith('http')) return uri;
    return '';
  }
}

export async function POST(request: Request) {
  try {
    const { publicKey, network } = await request.json();

    if (!publicKey) {
      return NextResponse.json(
        { success: false, error: 'Missing publicKey' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const owner = new PublicKey(publicKey);

    // Collect raw token accounts first
    const rawAccounts: Array<{
      mint: string;
      balance: number;
      decimals: number;
      isToken2022: boolean;
    }> = [];

    // Fetch Token 2022 accounts
    try {
      const t22Accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_2022_PROGRAM_ID,
      });

      for (const { account } of t22Accounts.value) {
        const parsed = account.data.parsed;
        if (parsed?.info?.tokenAmount?.uiAmount > 0) {
          rawAccounts.push({
            mint: parsed.info.mint,
            balance: parsed.info.tokenAmount.uiAmount,
            decimals: parsed.info.tokenAmount.decimals,
            isToken2022: true,
          });
        }
      }
    } catch { /* no Token2022 accounts */ }

    // Fetch standard SPL Token accounts
    try {
      const splAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      });

      for (const { account } of splAccounts.value) {
        const parsed = account.data.parsed;
        if (parsed?.info?.tokenAmount?.uiAmount > 0) {
          rawAccounts.push({
            mint: parsed.info.mint,
            balance: parsed.info.tokenAmount.uiAmount,
            decimals: parsed.info.tokenAmount.decimals,
            isToken2022: false,
          });
        }
      }
    } catch { /* no SPL accounts */ }

    // Fetch metadata for all tokens in parallel
    const metadataPromises = rawAccounts.map(async (tok) => {
      // Check known tokens first
      const known = KNOWN_TOKENS[tok.mint];
      if (known) {
        return {
          ...tok,
          name: known.name,
          symbol: known.symbol,
          image: known.image,
        };
      }

      let name = '';
      let symbol = '';
      let image = '';
      const mintPk = new PublicKey(tok.mint);

      // 1) For Token 2022 tokens, try the embedded metadata extension first
      //    (this is how our app creates tokens - metadata stored in mint account)
      if (tok.isToken2022) {
        try {
          const tokenMeta = await getTokenMetadata(
            connection,
            mintPk,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
          if (tokenMeta) {
            name = tokenMeta.name || '';
            symbol = tokenMeta.symbol || '';
            const uri = tokenMeta.uri || '';
            if (uri) {
              image = await resolveImageFromUri(uri);
            }
          }
        } catch { /* no token metadata extension */ }
      }

      // 2) Fallback: try Metaplex metadata PDA (works for both SPL and Token2022)
      if (!name) {
        try {
          const metadataPDA = deriveMetadataPDA(mintPk);
          const accountInfo = await connection.getAccountInfo(metadataPDA);

          if (accountInfo) {
            const [metadata] = Metadata.fromAccountInfo(accountInfo);
            name = cleanStr(metadata.data.name);
            symbol = cleanStr(metadata.data.symbol);
            const uri = cleanStr(metadata.data.uri);

            if (uri && !image) {
              image = await resolveImageFromUri(uri);
            }
          }
        } catch { /* metadata PDA not found or decode error */ }
      }

      // Debug log for metadata resolution
      if (!image && (name || symbol)) {
        console.log(`[wallet-tokens] Token ${symbol || name} (${tok.mint.slice(0, 8)}...): no image found`);
      }

      return {
        ...tok,
        name: name || '',
        symbol: symbol || '',
        image,
      };
    });

    const tokens = await Promise.all(metadataPromises);

    // Sort by balance descending
    tokens.sort((a, b) => b.balance - a.balance);

    return NextResponse.json({ success: true, data: tokens });
  } catch (err) {
    console.error('Wallet tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
