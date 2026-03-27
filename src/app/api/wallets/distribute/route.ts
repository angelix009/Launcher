import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { distributeTokens, mintToWallets } from '@/lib/wallets';
import type { WalletEntry } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      privateKey,
      tokenMint,
      wallets,
      amountPerWallet,
      perWalletAmounts,
      network,
      mode, // 'mint' (default) or 'transfer'
    } = body as {
      privateKey: string;
      tokenMint: string;
      wallets: WalletEntry[];
      amountPerWallet?: number;
      perWalletAmounts?: Record<string, number>;
      network: 'devnet' | 'mainnet-beta';
      mode?: 'mint' | 'transfer';
    };

    if (!privateKey || !tokenMint || !wallets || (!amountPerWallet && !perWalletAmounts)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, tokenMint, wallets, and amounts' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const authority = keypairFromPrivateKey(privateKey);
    const mint = new PublicKey(tokenMint);

    // Infer decimals — try Token 2022 first, fall back to standard SPL
    const { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
    let decimals: number;
    let tokenProgram: PublicKey;
    try {
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      decimals = mintInfo.decimals;
      tokenProgram = TOKEN_2022_PROGRAM_ID;
    } catch {
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
      decimals = mintInfo.decimals;
      tokenProgram = TOKEN_PROGRAM_ID;
    }

    const distributionMode = mode || 'mint';

    let signatures: string[];

    if (distributionMode === 'mint') {
      // Direct mint to each wallet's ATA (SCMR pattern)
      signatures = await mintToWallets(
        connection,
        authority,
        mint,
        decimals,
        wallets,
        amountPerWallet || 0,
        perWalletAmounts
      );
    } else {
      // Transfer mode: send from funder's ATA to each wallet, supporting perWalletAmounts
      const { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const { Transaction } = await import('@solana/web3.js');

      const sigList: string[] = [];
      const errors: { wallet: string; error: string }[] = [];

      // Pre-compute sender ATA once
      const senderAta = getAssociatedTokenAddressSync(mint, authority.publicKey, false, tokenProgram);

      for (const w of wallets) {
        const amt = perWalletAmounts?.[w.id] ?? (amountPerWallet || 0);
        if (amt <= 0) continue;

        try {
          const rawAmount = BigInt(Math.round(amt * 10 ** decimals));
          const dest = new PublicKey(w.publicKey);

          // Create recipient ATA if needed (funder pays rent)
          const recipientAta = await getOrCreateAssociatedTokenAccount(
            connection, authority, mint, dest, false, 'confirmed', {}, tokenProgram
          );

          const tx = new Transaction().add(
            createTransferCheckedInstruction(
              senderAta,
              mint,
              recipientAta.address,
              authority.publicKey,
              rawAmount,
              decimals,
              [],
              tokenProgram
            )
          );

          const sig = await connection.sendTransaction(tx, [authority], { skipPreflight: false });
          await connection.confirmTransaction(sig, 'confirmed');
          sigList.push(sig);

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 300));
        } catch (walletErr) {
          console.error(`Transfer failed for wallet ${w.publicKey}:`, walletErr);
          errors.push({ wallet: w.publicKey, error: (walletErr as Error).message });
          // Continue to next wallet instead of stopping
        }
      }

      signatures = sigList;

      if (errors.length > 0) {
        console.warn(`${errors.length} wallets failed during USDC distribution`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { signatures, mode: distributionMode, count: signatures.length },
    });
  } catch (err) {
    console.error('Distribute tokens error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
