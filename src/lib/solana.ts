import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { NETWORKS, TX_BATCH_SIZE } from './constants';

export function getConnection(network: 'devnet' | 'mainnet-beta'): Connection {
  return new Connection(NETWORKS[network], 'confirmed');
}

export function keypairFromPrivateKey(privateKey: string): Keypair {
  const decoded = bs58.decode(privateKey);
  return Keypair.fromSecretKey(decoded);
}

export function keypairToPrivateKey(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

export async function getBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export async function sendSOL(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  amountSOL: number
): Promise<string> {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(amountSOL * LAMPORTS_PER_SOL),
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;
  tx.sign(from);
  const rawTx = tx.serialize();
  const sig = await connection.sendRawTransaction(rawTx, {
    skipPreflight: true,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed'
  );
  return sig;
}

export async function sendTransactionWithRetry(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = signers[0].publicKey;
      transaction.sign(...signers);
      const rawTx = transaction.serialize();
      const sig = await connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed'
      );
      return sig;
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw lastError;
}

export async function executeBatchTransactions(
  connection: Connection,
  instructionSets: TransactionInstruction[][],
  signers: Keypair[],
  batchSize = TX_BATCH_SIZE
): Promise<string[]> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  // Build and sign all txs upfront
  const rawTxs: Buffer[] = [];
  for (const instructions of instructionSets) {
    const tx = new Transaction();
    instructions.forEach(ix => tx.add(ix));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
    tx.recentBlockhash = blockhash;
    tx.feePayer = signers[0].publicKey;
    tx.sign(...signers);
    rawTxs.push(tx.serialize() as Buffer);
  }

  // Fire all in parallel batches
  const signatures: string[] = [];
  const sigMap = new Map<number, string>();

  for (let i = 0; i < rawTxs.length; i += batchSize) {
    const batch = rawTxs.slice(i, i + batchSize);
    const sends = batch.map(async (raw, j) => {
      try {
        const sig = await connection.sendRawTransaction(raw, {
          skipPreflight: true,
          maxRetries: 3,
        });
        sigMap.set(i + j, sig);
        return sig;
      } catch (err) {
        console.error(`Batch tx ${i + j} send failed:`, err);
        return null;
      }
    });
    await Promise.all(sends);
  }

  // Batch-confirm all signatures
  const allSigs = Array.from(sigMap.values());
  if (allSigs.length > 0) {
    const confirmed = new Set<string>();
    const pollStart = Date.now();
    while (confirmed.size < allSigs.length && Date.now() - pollStart < 30_000) {
      const toCheck = allSigs.filter(s => !confirmed.has(s));
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
      if (confirmed.size < allSigs.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return allSigs;
}

export function getExplorerUrl(
  signature: string,
  network: 'devnet' | 'mainnet-beta'
): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/tx/${signature}${cluster}`;
}

export function getMintExplorerUrl(
  mint: string,
  network: 'devnet' | 'mainnet-beta'
): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/token/${mint}${cluster}`;
}
