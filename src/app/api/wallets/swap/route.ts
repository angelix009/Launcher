import { NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: Request) {
  try {
    const { wallet, direction, amount, slippageBps = 300 } = await request.json() as {
      wallet: { publicKey: string; privateKey: string };
      direction: 'usdc-to-sol' | 'sol-to-usdc';
      amount: number;
      slippageBps?: number;
    };

    if (!wallet || !direction || !amount) {
      return NextResponse.json({ success: false, error: 'Missing wallet, direction, or amount' }, { status: 400 });
    }

    const connection = new Connection(RPC_URL, 'confirmed');

    let kp: Keypair;
    try {
      kp = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
    } catch {
      kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(wallet.privateKey)));
    }

    let inputMint: string;
    let outputMint: string;
    let amountRaw: number;

    if (direction === 'usdc-to-sol') {
      inputMint = USDC_MINT;
      outputMint = SOL_MINT;
      amountRaw = Math.round(amount * 1_000_000);
    } else {
      inputMint = SOL_MINT;
      outputMint = USDC_MINT;
      amountRaw = Math.round(amount * LAMPORTS_PER_SOL);
    }

    const quoteRes = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`);
    if (!quoteRes.ok) throw new Error(`Quote failed: ${await quoteRes.text()}`);
    const quote = await quoteRes.json();

    const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: kp.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    if (!swapRes.ok) throw new Error(`Swap failed: ${await swapRes.text()}`);
    const swapData = await swapRes.json();

    const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([kp]);

    let sig: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
          maxRetries: 3,
        });
        await connection.confirmTransaction(sig, 'confirmed');
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!sig) throw new Error('Failed to send swap transaction');

    const outAmount = parseInt(quote.outAmount);
    const received = direction === 'usdc-to-sol'
      ? outAmount / LAMPORTS_PER_SOL
      : outAmount / 1_000_000;

    const symbol = direction === 'usdc-to-sol' ? 'SOL' : 'USDC';

    return NextResponse.json({
      success: true,
      data: { signature: sig, received, symbol, inputAmount: amount },
    });
  } catch (err) {
    console.error('Swap error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
