import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/solana';
import { getPoolInfo, isRaydiumPool, getQuoteMint } from '@/lib/pool-utils';
import type { WalletEntry } from '@/types';
import BN from 'bn.js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      poolAddress,
      tokenMint,
      wallets,
      percentage,
      slippage,
      decimals,
      network,
    } = body as {
      poolAddress: string;
      tokenMint: string;
      wallets: WalletEntry[];
      percentage: number;
      slippage: number;
      decimals: number;
      network: 'devnet' | 'mainnet-beta';
    };

    if (!poolAddress || !tokenMint || !wallets || percentage == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const poolInfo = await getPoolInfo(connection, poolAddress);

    if (isRaydiumPool(poolInfo.type)) {
      const { Raydium, TxVersion } = await import('@raydium-io/raydium-sdk-v2');
      const { Keypair } = await import('@solana/web3.js');
      const bs58 = (await import('bs58')).default;

      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const quoteMint = getQuoteMint(poolInfo, tokenMint);
      const qDec = quoteMint === USDC_MINT ? 6 : 9;
      const qSym = qDec === 6 ? 'USDC' : 'SOL';
      const slippagePct = (slippage ?? 100) / 10000;

      const firstWallet = wallets[0];
      const keypair = Keypair.fromSecretKey(bs58.decode(firstWallet.privateKey));
      const raydium = await Raydium.load({
        owner: keypair, connection, cluster: 'mainnet',
        disableFeatureCheck: true, disableLoadToken: true, blockhashCommitment: 'finalized',
      });

      const results = [];

      if (poolInfo.type === 'raydium-amm-v4') {
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId: poolAddress });
        for (const wallet of wallets) {
          const tokenBalance = wallet.tokenBalance || 0;
          const sellAmount = tokenBalance * (percentage / 100);
          if (sellAmount <= 0) {
            results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, tokenBalance, sellAmount: 0, estimatedQuote: 0, quoteSymbol: qSym, maxSellable: null, error: 'Zero balance' });
            continue;
          }
          const rawAmount = new BN(Math.floor(sellAmount * 10 ** (decimals ?? 6)).toString());
          try {
            const out = raydium.liquidity.computeAmountOut({
              poolInfo: data.poolInfo, amountIn: rawAmount, mintIn: tokenMint, mintOut: quoteMint, slippage: slippagePct,
            });
            results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, tokenBalance, sellAmount, estimatedQuote: Number(out.amountOut.toString()) / 10 ** qDec, quoteSymbol: qSym, maxSellable: null });
          } catch (e) {
            results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, tokenBalance, sellAmount, estimatedQuote: 0, quoteSymbol: qSym, maxSellable: null, error: (e as Error).message });
          }
        }
      } else if (poolInfo.type === 'raydium-cpmm') {
        const { PublicKey } = await import('@solana/web3.js');
        const { getAccount } = await import('@solana/spl-token');
        const tokenAMint = poolInfo.tokenAMint;
        const isTokenA = tokenMint === tokenAMint;
        const inputVault = isTokenA ? poolInfo.tokenAVault : poolInfo.tokenBVault;
        const outputVault = isTokenA ? poolInfo.tokenBVault : poolInfo.tokenAVault;
        const [inputAccount, outputAccount] = await Promise.all([
          getAccount(connection, new PublicKey(inputVault), 'confirmed'),
          getAccount(connection, new PublicKey(outputVault), 'confirmed'),
        ]);
        const inputReserve = Number(inputAccount.amount);
        const outputReserve = Number(outputAccount.amount);

        for (const wallet of wallets) {
          const tokenBalance = wallet.tokenBalance || 0;
          const sellAmount = tokenBalance * (percentage / 100);
          if (sellAmount <= 0) {
            results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, tokenBalance, sellAmount: 0, estimatedQuote: 0, quoteSymbol: qSym, maxSellable: null, error: 'Zero balance' });
            continue;
          }
          const rawAmountIn = Math.floor(sellAmount * 10 ** (decimals ?? 6));
          const amountOut = (rawAmountIn * outputReserve) / (inputReserve + rawAmountIn);
          const estimatedQuote = amountOut / 10 ** qDec;
          results.push({ walletId: wallet.id, walletPublicKey: wallet.publicKey, tokenBalance, sellAmount, estimatedQuote, quoteSymbol: qSym, maxSellable: null });
        }
      }

      return NextResponse.json({ success: true, data: results });
    } else {
      const { getQuoteForWallets } = await import('@/lib/sell');
      const results = await getQuoteForWallets(connection, poolAddress, tokenMint, wallets, percentage, slippage ?? 100, decimals ?? 6);
      return NextResponse.json({ success: true, data: results });
    }
  } catch (err) {
    console.error('Quote error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
