import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import {
  CpAmm,
  getSqrtPriceFromPrice,
  getLiquidityDeltaFromAmountA,
  getBaseFeeParams,
  getDynamicFeeParams,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
} from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  unpackMint,
} from '@solana/spl-token';
import { WSOL_MINT, USDC_MINT, USDC_DEVNET_MINT } from './constants';
import type { PoolConfig, PoolResult } from '@/types';

/**
 * Replace the SDK's ATA creation instructions with our own
 * that use the correct token program for Token 2022 mints.
 * The SDK may generate ATA instructions with TOKEN_PROGRAM_ID
 * even for Token 2022 mints, causing IncorrectProgramId errors.
 */
function replaceAtaInstructions(
  tx: any,
  payer: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  programA: PublicKey,
  programB: PublicKey
): void {
  // Remove ALL ATA instructions the SDK added
  tx.instructions = (tx.instructions || []).filter(
    (ix: any) => !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
  );

  // Create correct ATA instructions for both mints
  const ataA = getAssociatedTokenAddressSync(mintA, payer, true, programA);
  const ataB = getAssociatedTokenAddressSync(mintB, payer, true, programB);

  // Prepend our correct ATA instructions
  tx.instructions.unshift(
    createAssociatedTokenAccountIdempotentInstruction(
      payer, ataA, payer, mintA, programA
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      payer, ataB, payer, mintB, programB
    )
  );
}

function getQuoteMint(quote: 'SOL' | 'USDC', network: string): PublicKey {
  if (quote === 'SOL') return WSOL_MINT;
  return network === 'devnet' ? USDC_DEVNET_MINT : USDC_MINT;
}

export async function createDammV2Pool(
  connection: Connection,
  creator: Keypair,
  config: PoolConfig
): Promise<PoolResult> {
  const tokenMint = new PublicKey(config.tokenMint);
  const quoteMint = getQuoteMint(config.quoteMint, config.network);

  // Determine token program for base token
  const baseMintAccountInfo = await connection.getAccountInfo(tokenMint);
  if (!baseMintAccountInfo) {
    throw new Error('Token mint account not found');
  }

  const baseMint = unpackMint(tokenMint, baseMintAccountInfo, baseMintAccountInfo.owner);
  const baseDecimals = baseMint.decimals;

  let baseTokenProgram = TOKEN_PROGRAM_ID;
  if (baseMintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    baseTokenProgram = TOKEN_2022_PROGRAM_ID;
  }

  // Determine token program for quote token (auto-detect)
  const quoteMintAccountInfo = await connection.getAccountInfo(quoteMint);
  if (!quoteMintAccountInfo) {
    throw new Error('Quote token mint account not found');
  }
  let quoteTokenProgram = TOKEN_PROGRAM_ID;
  if (quoteMintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    quoteTokenProgram = TOKEN_2022_PROGRAM_ID;
  }
  let quoteDecimals: number;
  try {
    const quoteMintData = unpackMint(quoteMint, quoteMintAccountInfo, quoteMintAccountInfo.owner);
    quoteDecimals = quoteMintData.decimals;
  } catch {
    // Fallback for native mints (WSOL has special account structure)
    quoteDecimals = quoteMint.equals(WSOL_MINT) ? 9 : 6;
  }

  // Create CpAmm instance
  const cpAmm = new CpAmm(connection as any);

  // Calculate sqrt prices
  const initSqrtPrice = getSqrtPriceFromPrice(
    config.initPrice.toString(),
    baseDecimals,
    quoteDecimals
  );

  // Calculate token amounts in lamports
  const tokenAAmount = new BN(
    Math.floor(config.initialTokenAmount * 10 ** baseDecimals).toString()
  );
  const tokenBAmount = config.initialQuoteAmount
    ? new BN(Math.floor(config.initialQuoteAmount * 10 ** quoteDecimals).toString())
    : new BN(0);

  // Calculate initSqrtPrice and liquidityDelta
  const maxSqrtPrice = MAX_SQRT_PRICE;

  let minSqrtPrice: BN;
  let finalInitSqrtPrice: BN;
  let liquidityDelta: BN;

  if (config.initialQuoteAmount && config.initialQuoteAmount > 0) {
    // Two-sided pool: full price range, SDK calculates initSqrtPrice from amounts
    minSqrtPrice = MIN_SQRT_PRICE;
    const prepared = cpAmm.preparePoolCreationParams({
      tokenAAmount,
      tokenBAmount,
      minSqrtPrice,
      maxSqrtPrice,
      collectFeeMode: config.collectFeeMode,
    });
    finalInitSqrtPrice = prepared.initSqrtPrice;
    liquidityDelta = prepared.liquidityDelta;
  } else {
    // Single-sided (token A only): set minSqrtPrice = initSqrtPrice
    // This concentrates all liquidity above the init price, requiring only token A
    minSqrtPrice = initSqrtPrice;
    finalInitSqrtPrice = initSqrtPrice;
    liquidityDelta = getLiquidityDeltaFromAmountA(
      tokenAAmount,
      initSqrtPrice,
      maxSqrtPrice,
      config.collectFeeMode
    );
  }

  // Calculate activation point
  const activationType = config.activationType === 'timestamp' ? 1 : 0;
  let activationPoint: BN | null = null;
  let delay = config.activationDelay;

  // DAMM v2 on-chain program requires activationPoint far enough in the future
  // when hasAlphaVault=true. Timestamp constraint chain:
  // crank_start = activation - 3600, deposit_close = crank_start - 300,
  // depositingPoint + 1200 <= deposit_close => minimum ~5100s + buffer = 5400s
  if (config.hasAlphaVault && config.activationType === 'timestamp' && delay < 5400) {
    delay = 5400;
  }

  if (delay > 0) {
    if (config.activationType === 'timestamp') {
      // Use on-chain clock to avoid local time drift
      const clockAccount = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
      if (!clockAccount) throw new Error('Failed to fetch on-chain clock');
      const unixTimestamp = new BN(clockAccount.data.subarray(32, 40), 'le');
      activationPoint = unixTimestamp.add(new BN(delay));
      console.log(`[Pool] clock=${unixTimestamp.toString()}, delay=${delay}, activationPoint=${activationPoint.toString()}`);
    } else {
      const slot = await connection.getSlot();
      activationPoint = new BN(slot + delay);
      console.log(`[Pool] currentSlot=${slot}, delay=${delay}, activationPoint=${activationPoint.toString()}`);
    }
  }

  const debugInfo = `hasAlphaVault=${config.hasAlphaVault}, activationType=${activationType}, activationPoint=${activationPoint?.toString() ?? 'null'}, delay=${delay}, collectFeeMode=${config.collectFeeMode}`;
  console.log(`[Pool] ${debugInfo}`);

  // Build fee parameters using SDK v1.3.3 format
  const baseFee = getBaseFeeParams(
    {
      baseFeeMode: config.feeSchedulerMode ?? 0,
      feeTimeSchedulerParam: {
        startingFeeBps: config.maxBaseFeeBps ?? 400,
        endingFeeBps: config.minBaseFeeBps ?? 400,
        numberOfPeriod: config.numberOfPeriod ?? 0,
        totalDuration: config.totalDuration ?? 0,
      },
    },
    quoteDecimals,
    activationType
  );

  const dynamicFee = (config.useDynamicFee !== false)
    ? getDynamicFeeParams(config.maxBaseFeeBps ?? 400)
    : null;

  // Must match PoolFeesParams type from SDK exactly:
  // { baseFee, compoundingFeeBps, padding, dynamicFee }
  const poolFees = {
    baseFee,
    compoundingFeeBps: 0,
    padding: 0,
    dynamicFee,
  };

  const positionNft = Keypair.generate();

  // Use createCustomPool to specify fees directly
  // This avoids relying on pre-existing configs with unknown fee settings
  const { tx: initPoolTx, pool: poolPubkey } = await cpAmm.createCustomPool({
    payer: creator.publicKey,
    creator: creator.publicKey,
    positionNft: positionNft.publicKey,
    tokenAMint: tokenMint,
    tokenBMint: quoteMint,
    tokenAAmount,
    tokenBAmount,
    sqrtMinPrice: minSqrtPrice,
    sqrtMaxPrice: maxSqrtPrice,
    liquidityDelta,
    initSqrtPrice: finalInitSqrtPrice,
    poolFees,
    hasAlphaVault: config.hasAlphaVault ?? false,
    activationType,
    collectFeeMode: config.collectFeeMode,
    activationPoint,
    tokenAProgram: baseTokenProgram,
    tokenBProgram: quoteTokenProgram,
  });

  // Replace SDK's ATA instructions with our own using correct token programs
  replaceAtaInstructions(
    initPoolTx,
    creator.publicKey,
    tokenMint,
    quoteMint,
    baseTokenProgram,
    quoteTokenProgram
  );

  // Add priority fee
  initPoolTx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  initPoolTx.recentBlockhash = blockhash;
  initPoolTx.feePayer = creator.publicKey;

  const signature = await sendAndConfirmTransaction(
    connection,
    initPoolTx,
    [creator, positionNft],
    { maxRetries: 3 }
  );

  const poolAddress = poolPubkey.toBase58();

  const cluster = config.network === 'devnet' ? '?cluster=devnet' : '';

  return {
    poolAddress,
    signature,
    explorerUrl: `https://solscan.io/tx/${signature}${cluster}`,
  };
}

