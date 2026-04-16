import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { v4 as uuidv4 } from 'uuid';
import type { WalletEntry } from '@/types';
import { ATA_FUNDING_AMOUNT, TX_BATCH_SIZE } from './constants';

export function generateWallets(count: number): WalletEntry[] {
  const wallets: WalletEntry[] = [];
  for (let i = 0; i < count; i++) {
    const keypair = Keypair.generate();
    wallets.push({
      id: uuidv4(),
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      solBalance: 0,
      tokenBalance: 0,
      usdcBalance: 0,
      label: `Wallet ${i + 1}`,
      createdAt: new Date().toISOString(),
    });
  }
  return wallets;
}

export function walletsToCSV(wallets: WalletEntry[]): string {
  const header = 'id,publicKey,privateKey,label,createdAt';
  const rows = wallets.map(
    (w) => `${w.id},${w.publicKey},${w.privateKey},${w.label || ''},${w.createdAt}`
  );
  return [header, ...rows].join('\n');
}

export function walletsFromCSV(csv: string): WalletEntry[] {
  const lines = csv.trim().split('\n');
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('publickey') || header.includes('privatekey');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, i) => {
    const parts = line.split(',').map((s) => s.trim());
    // Support both formats: id,pub,priv,label,date or pub,priv
    if (parts.length >= 3) {
      return {
        id: parts[0] || uuidv4(),
        publicKey: parts[1],
        privateKey: parts[2],
        solBalance: 0,
        tokenBalance: 0,
        usdcBalance: 0,
        label: parts[3] || `Imported ${i + 1}`,
        createdAt: parts[4] || new Date().toISOString(),
      };
    } else if (parts.length === 2) {
      return {
        id: uuidv4(),
        publicKey: parts[0],
        privateKey: parts[1],
        solBalance: 0,
        tokenBalance: 0,
        usdcBalance: 0,
        label: `Imported ${i + 1}`,
        createdAt: new Date().toISOString(),
      };
    }
    throw new Error(`Invalid CSV line ${i + 1}: ${line}`);
  });
}

export async function fundWalletsForATA(
  connection: Connection,
  funder: Keypair,
  wallets: WalletEntry[],
  amountPerWallet = ATA_FUNDING_AMOUNT
): Promise<string[]> {
  if (wallets.length === 0) return [];

  const lamportsEach = Math.floor(amountPerWallet * LAMPORTS_PER_SOL);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // Build one tx per batch of 10 wallets (fits in single tx size limit)
  const txBuffers: Buffer[] = [];
  for (let i = 0; i < wallets.length; i += TX_BATCH_SIZE) {
    const batch = wallets.slice(i, i + TX_BATCH_SIZE);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));

    for (const w of batch) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: funder.publicKey,
          toPubkey: new PublicKey(w.publicKey),
          lamports: lamportsEach,
        })
      );
    }

    tx.recentBlockhash = blockhash;
    tx.feePayer = funder.publicKey;
    tx.sign(funder);
    txBuffers.push(tx.serialize({ requireAllSignatures: true }) as Buffer);
  }

  // Fire all txs in parallel with minimal stagger
  const signatures: string[] = [];
  const sendPromises = txBuffers.map((rawTx, i) =>
    new Promise<void>(resolve => {
      setTimeout(async () => {
        try {
          const sig = await connection.sendRawTransaction(rawTx, {
            skipPreflight: true,
            maxRetries: 5,
          });
          signatures.push(sig);
        } catch (err) {
          console.error(`Fund batch ${i} send failed:`, err);
        }
        resolve();
      }, i * 30);
    })
  );
  await Promise.all(sendPromises);

  // Batch-confirm all signatures
  if (signatures.length > 0) {
    const confirmed = new Set<string>();
    const pollStart = Date.now();
    while (confirmed.size < signatures.length && Date.now() - pollStart < 30_000) {
      const toCheck = signatures.filter(s => !confirmed.has(s));
      for (let c = 0; c < toCheck.length; c += 256) {
        const chunk = toCheck.slice(c, c + 256);
        try {
          const statuses = await connection.getSignatureStatuses(chunk);
          for (let j = 0; j < chunk.length; j++) {
            const st = statuses.value[j];
            if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
              confirmed.add(chunk[j]);
            }
          }
        } catch { /* retry */ }
      }
      if (confirmed.size < signatures.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  return signatures;
}

export async function distributeTokens(
  connection: Connection,
  sender: Keypair,
  tokenMint: PublicKey,
  decimals: number,
  wallets: WalletEntry[],
  amountPerWallet: number
): Promise<string[]> {
  // Auto-detect token program
  const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
  const mintAccountInfo = await connection.getAccountInfo(tokenMint);
  const tokenProgram = mintAccountInfo?.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;

  const signatures: string[] = [];
  const senderATA = getAssociatedTokenAddressSync(
    tokenMint,
    sender.publicKey,
    false,
    tokenProgram
  );

  for (let i = 0; i < wallets.length; i += 5) {
    const batch = wallets.slice(i, i + 5);
    const tx = new Transaction();
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
    );

    for (const w of batch) {
      const recipientPub = new PublicKey(w.publicKey);
      const recipientATA = getAssociatedTokenAddressSync(
        tokenMint,
        recipientPub,
        false,
        tokenProgram
      );

      // Create ATA if needed
      tx.add(
        createAssociatedTokenAccountInstruction(
          sender.publicKey,
          recipientATA,
          recipientPub,
          tokenMint,
          tokenProgram
        )
      );

      // Transfer tokens
      const rawAmount = BigInt(Math.floor(amountPerWallet * 10 ** decimals));
      tx.add(
        createTransferCheckedInstruction(
          senderATA,
          tokenMint,
          recipientATA,
          sender.publicKey,
          rawAmount,
          decimals,
          [],
          tokenProgram
        )
      );
    }

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender.publicKey;

    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [sender]);
      signatures.push(sig);
    } catch (err) {
      console.error(`Distribute batch ${i} failed:`, err);
    }

    if (i + 5 < wallets.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return signatures;
}

export async function mintToWallets(
  connection: Connection,
  mintAuthority: Keypair,
  tokenMint: PublicKey,
  decimals: number,
  wallets: WalletEntry[],
  amountPerWallet: number,
  perWalletAmounts?: Record<string, number>
): Promise<string[]> {
  // Auto-detect token program
  const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
  const mintAccountInfo = await connection.getAccountInfo(tokenMint);
  const tokenProgram = mintAccountInfo?.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  // Build and sign all txs upfront — 5 wallets per tx
  const rawTxs: Buffer[] = [];
  for (let i = 0; i < wallets.length; i += 5) {
    const batch = wallets.slice(i, i + 5);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));

    let hasInstructions = false;
    for (const w of batch) {
      const amount = perWalletAmounts?.[w.id] ?? amountPerWallet;
      if (!amount || amount <= 0) continue;

      const recipientPub = new PublicKey(w.publicKey);
      const recipientATA = getAssociatedTokenAddressSync(
        tokenMint, recipientPub, false, tokenProgram
      );

      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          mintAuthority.publicKey, recipientATA, recipientPub,
          tokenMint, tokenProgram
        )
      );

      const rawAmount = BigInt(Math.floor(amount * 10 ** decimals));
      tx.add(
        createMintToInstruction(
          tokenMint, recipientATA, mintAuthority.publicKey,
          rawAmount, [], tokenProgram
        )
      );
      hasInstructions = true;
    }

    if (!hasInstructions) continue;

    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;
    tx.sign(mintAuthority);
    rawTxs.push(tx.serialize({ requireAllSignatures: true }) as Buffer);
  }

  // Fire all txs in parallel with minimal stagger
  const signatures: string[] = [];
  const sendPromises = rawTxs.map((raw, i) =>
    new Promise<void>(resolve => {
      setTimeout(async () => {
        try {
          const sig = await connection.sendRawTransaction(raw, {
            skipPreflight: true,
            maxRetries: 5,
          });
          signatures.push(sig);
        } catch (err) {
          console.error(`MintTo batch ${i} send failed:`, err);
        }
        resolve();
      }, i * 50); // 50ms stagger
    })
  );
  await Promise.all(sendPromises);

  // Batch-confirm all signatures
  if (signatures.length > 0) {
    const confirmed = new Set<string>();
    const pollStart = Date.now();
    while (confirmed.size < signatures.length && Date.now() - pollStart < 30_000) {
      const toCheck = signatures.filter(s => !confirmed.has(s));
      for (let c = 0; c < toCheck.length; c += 256) {
        const chunk = toCheck.slice(c, c + 256);
        try {
          const statuses = await connection.getSignatureStatuses(chunk);
          for (let j = 0; j < chunk.length; j++) {
            const st = statuses.value[j];
            if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
              confirmed.add(chunk[j]);
            }
          }
        } catch { /* retry */ }
      }
      if (confirmed.size < signatures.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return signatures;
}

export async function getWalletBalances(
  connection: Connection,
  wallets: WalletEntry[],
  tokenMint?: string,
  network: string = 'mainnet-beta'
): Promise<WalletEntry[]> {
  if (wallets.length === 0) return [];

  const USDC_DECIMALS = 6;
  const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const usdcMint = new PublicKey(
    network === 'devnet'
      ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  );

  // Fetch token decimals and detect program (SPL vs Token-2022)
  let tokenDecimals = 6;
  let tokenProgramId = TOKEN_2022_PROGRAM_ID;
  if (tokenMint) {
    try {
      const { getMint, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const mintPub = new PublicKey(tokenMint);
      // Auto-detect token program
      const mintAccountInfo = await connection.getAccountInfo(mintPub);
      if (mintAccountInfo) {
        tokenProgramId = mintAccountInfo.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
      }
      const mintInfo = await getMint(connection, mintPub, 'confirmed', tokenProgramId);
      tokenDecimals = mintInfo.decimals;
    } catch {
      // fallback to 6
    }
  }

  // Build all addresses to fetch in one batch:
  // For each wallet: [walletPubkey, tokenATA, usdcATA]
  const walletPubkeys = wallets.map(w => new PublicKey(w.publicKey));
  const tokenATAs = tokenMint
    ? walletPubkeys.map(pub =>
        getAssociatedTokenAddressSync(new PublicKey(tokenMint), pub, false, tokenProgramId)
      )
    : [];
  const usdcATAs = walletPubkeys.map(pub =>
    getAssociatedTokenAddressSync(usdcMint, pub, false, SPL_TOKEN_PROGRAM_ID)
  );

  // Batch fetch: SOL balances (walletPubkeys) + token ATAs + USDC ATAs
  // getMultipleAccountsInfo supports up to 100 keys per call, chunk if needed
  const allKeys: PublicKey[] = [...walletPubkeys, ...tokenATAs, ...usdcATAs];
  const BATCH_SIZE = 100;
  const allAccounts: (import('@solana/web3.js').AccountInfo<Buffer> | null)[] = [];

  for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
    const chunk = allKeys.slice(i, i + BATCH_SIZE);
    const results = await connection.getMultipleAccountsInfo(chunk, 'confirmed');
    allAccounts.push(...results);
  }

  // Split results back
  const n = wallets.length;
  const solAccounts = allAccounts.slice(0, n);
  const tokenAccounts = tokenMint ? allAccounts.slice(n, n + tokenATAs.length) : [];
  const usdcAccounts = allAccounts.slice(n + tokenATAs.length);

  // Parse token account data (SPL Token account layout: amount is at offset 64, 8 bytes LE)
  const parseTokenAmount = (data: Buffer | null | undefined): number => {
    if (!data || data.length < 72) return 0;
    // Read 8 bytes LE at offset 64 as two 32-bit values
    const lo = data.readUInt32LE(64);
    const hi = data.readUInt32LE(68);
    return hi * 4294967296 + lo;
  };

  const updated: WalletEntry[] = wallets.map((w, i) => {
    const solLamports = solAccounts[i]?.lamports ?? 0;
    const solBalance = solLamports / LAMPORTS_PER_SOL;

    let tokenBalance = 0;
    if (tokenMint && tokenAccounts[i]) {
      tokenBalance = parseTokenAmount(tokenAccounts[i]!.data as Buffer) / (10 ** tokenDecimals);
    }

    let usdcBalance = 0;
    if (usdcAccounts[i]) {
      usdcBalance = parseTokenAmount(usdcAccounts[i]!.data as Buffer) / (10 ** USDC_DECIMALS);
    }

    return { ...w, solBalance, tokenBalance, usdcBalance };
  });

  return updated;
}
