import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  ExtensionType,
  getMintLen,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
  TYPE_SIZE,
  LENGTH_SIZE,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { sendTransactionWithRetry } from './solana';
import type { TokenConfig, TokenResult } from '@/types';

export async function createToken2022(
  connection: Connection,
  payer: Keypair,
  config: TokenConfig
): Promise<TokenResult> {
  // Vanity address grinding
  let mintKeypair: Keypair = Keypair.generate();
  const prefix = (config.vanityPrefix || '').trim();
  const suffix = (config.vanitySuffix || '').trim();

  if (prefix || suffix) {
    const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const isValidBase58 = (s: string) => [...s].every(c => BASE58_CHARS.includes(c));

    if (prefix && !isValidBase58(prefix)) throw new Error(`Invalid prefix: "${prefix}" contains non-base58 characters`);
    if (suffix && !isValidBase58(suffix)) throw new Error(`Invalid suffix: "${suffix}" contains non-base58 characters`);

    const MAX_ATTEMPTS = 5_000_000;
    let found = false;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const candidate = Keypair.generate();
      const addr = candidate.publicKey.toBase58();
      const matchPrefix = !prefix || addr.startsWith(prefix);
      const matchSuffix = !suffix || addr.endsWith(suffix);
      if (matchPrefix && matchSuffix) {
        mintKeypair = candidate;
        found = true;
        console.log(`Vanity mint found after ${i + 1} attempts: ${addr}`);
        break;
      }
    }
    if (!found) throw new Error(`Could not find vanity address with prefix="${prefix}" suffix="${suffix}" after ${MAX_ATTEMPTS} attempts. Try shorter values.`);
  } else {
    mintKeypair = Keypair.generate();
  }
  const mint = mintKeypair.publicKey;

  // Build metadata for Token 2022 metadata extension
  const metadata: TokenMetadata = {
    mint: mint,
    name: config.name,
    symbol: config.symbol,
    uri: config.imageUrl || '',
    additionalMetadata: config.description
      ? [['description', config.description]]
      : [],
  };

  // Calculate space needed
  const metadataLen = pack(metadata).length;
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const totalLen = mintLen + TYPE_SIZE + LENGTH_SIZE + metadataLen;
  const lamports = await connection.getMinimumBalanceForRentExemption(totalLen);

  // Build transaction
  const tx = new Transaction();

  // 1. Create account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2. Initialize metadata pointer (points to the mint itself)
  tx.add(
    createInitializeMetadataPointerInstruction(
      mint,
      payer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 3. Initialize mint
  tx.add(
    createInitializeMintInstruction(
      mint,
      config.decimals,
      payer.publicKey,
      config.revokeFreeze ? null : payer.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 4. Initialize metadata
  tx.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mint,
      metadata: mint,
      name: config.name,
      symbol: config.symbol,
      uri: config.imageUrl || '',
      mintAuthority: payer.publicKey,
      updateAuthority: payer.publicKey,
    })
  );

  // 5. Add description as additional metadata field
  if (config.description) {
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer.publicKey,
        field: 'description',
        value: config.description,
      })
    );
  }

  // 6. Create ATA for payer
  const ata = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  tx.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 7. Mint pool amount to creator's ATA (NOT the full supply)
  // The rest will be minted directly to side wallets via mintTo
  const poolAmount = config.poolAmount || 0;
  if (poolAmount > 0) {
    const mintAmount = BigInt(Math.floor(poolAmount)) * BigInt(10 ** config.decimals);
    tx.add(
      createMintToInstruction(
        mint,
        ata,
        payer.publicKey,
        mintAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // NOTE: Mint authority is kept active for direct minting to side wallets.
  // Call revokeAuthorities() after all minting is complete.

  const signature = await sendTransactionWithRetry(
    connection,
    tx,
    [payer, mintKeypair]
  );

  const network = config.network;
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';

  return {
    mintAddress: mint.toBase58(),
    tokenAccount: ata.toBase58(),
    signature,
    explorerUrl: `https://solscan.io/token/${mint.toBase58()}${cluster}`,
  };
}

export async function revokeAuthorities(
  connection: Connection,
  authority: Keypair,
  tokenMint: PublicKey,
  revokeMint: boolean,
  revokeUpdate: boolean
): Promise<string> {
  const tx = new Transaction();

  if (revokeMint) {
    tx.add(
      createSetAuthorityInstruction(
        tokenMint,
        authority.publicKey,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (revokeUpdate) {
    // Revoke metadata update authority
    const { createUpdateAuthorityInstruction } = await import('@solana/spl-token-metadata');
    tx.add(
      createUpdateAuthorityInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: tokenMint,
        oldAuthority: authority.publicKey,
        newAuthority: null,
      })
    );
  }

  if (tx.instructions.length === 0) {
    throw new Error('No authorities selected for revocation');
  }

  return await sendTransactionWithRetry(connection, tx, [authority]);
}

export async function getTokenInfo(
  connection: Connection,
  mintAddress: string
) {
  try {
    const mint = new PublicKey(mintAddress);
    // Try Token 2022 first
    try {
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      return {
        address: mintAddress,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / (10 ** mintInfo.decimals),
        isToken2022: true,
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
      };
    } catch {
      // Fall back to standard Token Program
      const { TOKEN_PROGRAM_ID: STD_TOKEN } = await import('@solana/spl-token');
      const mintInfo = await getMint(connection, mint, 'confirmed', STD_TOKEN);
      return {
        address: mintAddress,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / (10 ** mintInfo.decimals),
        isToken2022: false,
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
      };
    }
  } catch (err) {
    throw new Error(`Failed to get token info: ${(err as Error).message}`);
  }
}
