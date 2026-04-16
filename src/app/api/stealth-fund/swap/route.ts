import { NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const RPC_URLS: Record<string, string> = {
  'devnet': 'https://api.devnet.solana.com',
  'mainnet-beta': process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
};

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(request: Request) {
  try {
    const { wallets, network = 'mainnet-beta', solToKeep = 0.05, slippageBps = 100 } = await request.json();

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ success: false, error: 'No wallets provided' }, { status: 400 });
    }

    const rpcUrl = RPC_URLS[network];
    if (!rpcUrl) return NextResponse.json({ success: false, error: 'Invalid network' }, { status: 400 });

    const connection = new Connection(rpcUrl, 'confirmed');
    const usdcMint = network === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT;
    const keepLamports = Math.round(solToKeep * LAMPORTS_PER_SOL);

    const results: { wallet: string; usdcReceived: number; signature?: string; error?: string }[] = [];
    let successCount = 0;
    let totalUsdc = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      try {
        let kp: Keypair;
        try {
          kp = Keypair.fromSecretKey(bs58.decode(w.privateKey));
        } catch {
          kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(w.privateKey)));
        }

        const balance = await connection.getBalance(kp.publicKey);
        const swapLamports = balance - keepLamports;

        if (swapLamports < 10000) {
          results.push({ wallet: w.publicKey, usdcReceived: 0, error: 'Not enough SOL to swap' });
          continue;
        }

        console.log(`[swap ${i + 1}/${wallets.length}] ${w.publicKey.slice(0, 8)}... swapping ${(swapLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL → USDC`);

        // Get quote
        const quoteRes = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${usdcMint}&amount=${swapLamports}&slippageBps=${slippageBps}`);
        if (!quoteRes.ok) throw new Error(`Quote failed: ${await quoteRes.text()}`);
        const quote = await quoteRes.json();

        // Get swap tx
        const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: kp.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
          }),
        });
        if (!swapRes.ok) throw new Error(`Swap failed: ${await swapRes.text()}`);
        const swapData = await swapRes.json();

        // Sign and send
        const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([kp]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        await connection.confirmTransaction(sig, 'confirmed');

        const usdcAmount = parseInt(quote.outAmount) / 1_000_000;
        totalUsdc += usdcAmount;
        successCount++;
        results.push({ wallet: w.publicKey, usdcReceived: usdcAmount, signature: sig });
        console.log(`[swap ${i + 1}/${wallets.length}] ✓ ${w.publicKey.slice(0, 8)}... received ${usdcAmount.toFixed(2)} USDC`);

      } catch (err) {
        results.push({ wallet: w.publicKey, usdcReceived: 0, error: (err as Error).message?.slice(0, 200) });
        console.error(`[swap ${i + 1}/${wallets.length}] ✗ ${w.publicKey.slice(0, 8)}...: ${(err as Error).message?.slice(0, 100)}`);
      }

      // Small delay between swaps
      if (i < wallets.length - 1) await sleep(1000);
    }

    return NextResponse.json({
      success: true,
      data: { results, success: successCount, failed: wallets.length - successCount, totalUsdc },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
