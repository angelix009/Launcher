import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { getPoolInfo } from '@/lib/pool-utils';
import { PublicKey } from '@solana/web3.js';

export const dynamic = 'force-dynamic';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

const QUOTE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'So11111111111111111111111111111111111111112',
]);

export async function POST(request: Request) {
  try {
    const { poolAddress, tokenMint, ownWallets, network } = await request.json();
    const connection = getConnection(network || 'mainnet-beta');

    const poolInfo = await getPoolInfo(connection, poolAddress);
    const tokenAVault = poolInfo.tokenAVault;
    const tokenBVault = poolInfo.tokenBVault;

    const ownWalletSet = new Set<string>(ownWallets || []);

    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(poolAddress),
      { limit: 10 },
    );

    const sigList = signatures.map((s: any) => s.signature);

    let parsedTxs: any[] = [];
    if (sigList.length > 0) {
      const res = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: sigList }),
      });
      if (res.ok) {
        parsedTxs = await res.json();
      }
    }

    const analysis = parsedTxs.map(tx => {
      if (!tx) return null;

      const feePayer = tx.feePayer || '';
      const feePayerIsOwn = ownWalletSet.has(feePayer);

      const transfers = tx.tokenTransfers || [];
      const nativeTransfers = tx.nativeTransfers || [];

      const involvedUsers = new Set<string>();
      for (const t of transfers) {
        if (t.fromUserAccount) involvedUsers.add(t.fromUserAccount);
        if (t.toUserAccount) involvedUsers.add(t.toUserAccount);
      }
      for (const t of nativeTransfers) {
        if (t.fromUserAccount) involvedUsers.add(t.fromUserAccount);
        if (t.toUserAccount) involvedUsers.add(t.toUserAccount);
      }

      const ownUsersInvolved = [...involvedUsers].filter(u => ownWalletSet.has(u));

      let tokenFromVault = 0;
      let tokenToVault = 0;
      let quoteFromVault = 0;
      let quoteToVault = 0;

      for (const t of transfers) {
        const mint = t.mint || '';
        const amount = t.tokenAmount || 0;
        if (amount <= 0) continue;
        const fromAcct = t.fromTokenAccount || t.fromUserAccount || '';
        const toAcct = t.toTokenAccount || t.toUserAccount || '';
        if (mint === tokenMint) {
          if (fromAcct === tokenAVault) tokenFromVault += amount;
          if (toAcct === tokenAVault) tokenToVault += amount;
        }
        if (QUOTE_MINTS.has(mint)) {
          if (fromAcct === tokenBVault) quoteFromVault += amount;
          if (toAcct === tokenBVault) quoteToVault += amount;
        }
      }

      const netTokenOut = tokenFromVault - tokenToVault;
      const netQuoteOut = quoteFromVault - quoteToVault;

      let detection = 'none';
      if (netTokenOut > 0 && netQuoteOut < 0) detection = 'external-buy';
      else if (netTokenOut < 0 && netQuoteOut > 0) detection = 'external-sell';

      return {
        signature: tx.signature?.slice(0, 20),
        feePayer,
        feePayerIsOwn,
        ownUsersInvolved,
        detection,
        netTokenOut,
        netQuoteOut,
      };
    }).filter(Boolean);

    return NextResponse.json({
      success: true,
      poolType: poolInfo.type,
      tokenAVault,
      tokenBVault,
      ownWalletCount: ownWalletSet.size,
      ownWallets: [...ownWalletSet],
      txCount: parsedTxs.length,
      analysis,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
