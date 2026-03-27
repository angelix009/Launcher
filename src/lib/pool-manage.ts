import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINTS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // mainnet
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet
];

export interface PoolInfo {
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAVault: string;
  tokenBVault: string;
  tokenAVaultBalance: number;
  tokenBVaultBalance: number;
  tokenADecimals: number;
  tokenBDecimals: number;
  tokenASymbol: string;
  tokenBSymbol: string;
  sqrtPrice: string;
  collectFeeMode: number;
  activationType: number;
  tokenAFlag: number;
}

export interface PositionInfo {
  positionAddress: string;
  positionNftAccount: string;
  liquidity: string;
  lockedLiquidity: string;
  feeAPending: string;
  feeBPending: string;
  rewardPendings: string[];
}

export interface WithdrawResult {
  signature: string;
  tokenAAmount: number;
  tokenBAmount: number;
}

export interface ClaimFeesResult {
  signature: string;
}

export interface LockResult {
  signature: string;
}

export async function getPoolInfo(
  connection: Connection,
  poolAddress: string
): Promise<PoolInfo> {
  const cpAmm = new CpAmm(connection as any);
  const pool = new PublicKey(poolAddress);
  const poolState = await cpAmm.fetchPoolState(pool);

  const tokenAMintStr = poolState.tokenAMint.toBase58();
  const tokenBMintStr = poolState.tokenBMint.toBase58();

  // Get decimals
  let tokenADecimals = 6;
  let tokenBDecimals = 9;
  let tokenASymbol = 'Token';
  let tokenBSymbol = 'SOL';

  try {
    const tokenAProgram = poolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mintA = await getMint(connection, poolState.tokenAMint, 'confirmed', tokenAProgram);
    tokenADecimals = mintA.decimals;
  } catch { /* fallback */ }

  if (USDC_MINTS.includes(tokenBMintStr)) {
    tokenBDecimals = 6;
    tokenBSymbol = 'USDC';
  } else if (tokenBMintStr === WSOL_MINT) {
    tokenBDecimals = 9;
    tokenBSymbol = 'SOL';
  } else {
    try {
      const quoteProg = (poolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const mintB = await getMint(connection, poolState.tokenBMint, 'confirmed', quoteProg);
      tokenBDecimals = mintB.decimals;
      tokenBSymbol = 'Quote';
    } catch { /* fallback */ }
  }

  // Get vault balances
  let tokenAVaultBalance = 0;
  let tokenBVaultBalance = 0;

  try {
    const tokenAProgram = poolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const vaultA = await getAccount(connection, poolState.tokenAVault, 'confirmed', tokenAProgram);
    tokenAVaultBalance = Number(vaultA.amount) / 10 ** tokenADecimals;
  } catch { /* empty vault */ }

  try {
    const tokenBProgram = (poolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const vaultB = await getAccount(connection, poolState.tokenBVault, 'confirmed', tokenBProgram);
    tokenBVaultBalance = Number(vaultB.amount) / 10 ** tokenBDecimals;
  } catch { /* empty vault */ }

  return {
    poolAddress,
    tokenAMint: tokenAMintStr,
    tokenBMint: tokenBMintStr,
    tokenAVault: poolState.tokenAVault.toBase58(),
    tokenBVault: poolState.tokenBVault.toBase58(),
    tokenAVaultBalance,
    tokenBVaultBalance,
    tokenADecimals,
    tokenBDecimals,
    tokenASymbol,
    tokenBSymbol,
    sqrtPrice: poolState.sqrtPrice.toString(),
    collectFeeMode: poolState.collectFeeMode,
    activationType: poolState.activationType,
    tokenAFlag: poolState.tokenAFlag,
  };
}

export async function getUserPositions(
  connection: Connection,
  poolAddress: string,
  userPublicKey: string
): Promise<PositionInfo[]> {
  const cpAmm = new CpAmm(connection as any);
  const pool = new PublicKey(poolAddress);
  const user = new PublicKey(userPublicKey);

  const poolState = await cpAmm.fetchPoolState(pool);
  const positions = await cpAmm.getUserPositionByPool(pool, user);

  return positions.map((p) => {
    // Calculate actual pending fees using pool's fee growth globals
    const unclaimedFees = getUnClaimLpFee(poolState, p.positionState);

    return {
      positionAddress: p.position.toBase58(),
      positionNftAccount: p.positionNftAccount.toBase58(),
      liquidity: p.positionState.unlockedLiquidity.toString(),
      lockedLiquidity: ((p.positionState as any).permanentLockedLiquidity || new BN(0)).toString(),
      feeAPending: unclaimedFees.feeTokenA.toString(),
      feeBPending: unclaimedFees.feeTokenB.toString(),
      rewardPendings: (p.positionState as any).rewardPendings
        ? (p.positionState as any).rewardPendings.map((r: any) => r.toString())
        : [],
    };
  });
}

export async function withdrawAllLiquidity(
  connection: Connection,
  ownerPrivateKey: string,
  poolAddress: string,
  positionAddress: string,
  positionNftAccount: string
): Promise<WithdrawResult> {
  const cpAmm = new CpAmm(connection as any);
  const owner = Keypair.fromSecretKey(bs58.decode(ownerPrivateKey));
  const pool = new PublicKey(poolAddress);
  const position = new PublicKey(positionAddress);
  const posNftAccount = new PublicKey(positionNftAccount);

  const poolState = await cpAmm.fetchPoolState(pool);

  // Get current point (timestamp or slot based on pool activation type)
  let currentPoint: BN;
  if (poolState.activationType === 1) {
    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot);
    currentPoint = new BN(blockTime || Math.floor(Date.now() / 1000));
  } else {
    const slot = await connection.getSlot();
    currentPoint = new BN(slot);
  }

  const positionState = await cpAmm.fetchPositionState(position);

  // Get vestings for this position
  const vestings = await cpAmm.getAllVestingsByPosition(position);
  const vestingParams = vestings.map((v) => ({
    account: v.publicKey,
    vestingState: v.account,
  }));

  const tokenAProgram = poolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const tx = await cpAmm.removeAllLiquidityAndClosePosition({
    owner: owner.publicKey,
    position,
    positionNftAccount: posNftAccount,
    poolState,
    positionState,
    tokenAAmountThreshold: new BN(0),
    tokenBAmountThreshold: new BN(0),
    vestings: vestingParams,
    currentPoint,
  });

  (tx as any).add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  (tx as any).recentBlockhash = blockhash;
  (tx as any).feePayer = owner.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx as any, [owner]);

  // Get decimals for display
  let tokenADecimals = 6;
  let tokenBDecimals = 9;
  try {
    const mintA = await getMint(connection, poolState.tokenAMint, 'confirmed', tokenAProgram);
    tokenADecimals = mintA.decimals;
  } catch { /* fallback */ }

  const tokenBMintStr = poolState.tokenBMint.toBase58();
  if (USDC_MINTS.includes(tokenBMintStr)) tokenBDecimals = 6;

  // Estimate withdrawn amounts from liquidity and withdraw quote
  const withdrawQuote = cpAmm.getWithdrawQuote({
    liquidityDelta: positionState.unlockedLiquidity,
    minSqrtPrice: (poolState as any).sqrtMinPrice,
    maxSqrtPrice: (poolState as any).sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    collectFeeMode: (poolState as any).collectFeeMode ?? 1,
    tokenAAmount: (poolState as any).tokenAAmount ?? new BN(0),
    tokenBAmount: (poolState as any).tokenBAmount ?? new BN(0),
    liquidity: (poolState as any).liquidity ?? new BN(0),
  });

  return {
    signature,
    tokenAAmount: Number(withdrawQuote.outAmountA.toString()) / 10 ** tokenADecimals,
    tokenBAmount: Number(withdrawQuote.outAmountB.toString()) / 10 ** tokenBDecimals,
  };
}

export async function claimPositionFees(
  connection: Connection,
  ownerPrivateKey: string,
  poolAddress: string,
  positionAddress: string,
  positionNftAccount: string
): Promise<ClaimFeesResult> {
  const cpAmm = new CpAmm(connection as any);
  const owner = Keypair.fromSecretKey(bs58.decode(ownerPrivateKey));
  const pool = new PublicKey(poolAddress);
  const position = new PublicKey(positionAddress);
  const posNftAccount = new PublicKey(positionNftAccount);

  const poolState = await cpAmm.fetchPoolState(pool);
  const tokenAProgram = poolState.tokenAFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const tokenBProgram = (poolState as any).tokenBFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const tx = await cpAmm.claimPositionFee({
    owner: owner.publicKey,
    position,
    pool,
    positionNftAccount: posNftAccount,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram,
    tokenBProgram,
  });

  (tx as any).add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  (tx as any).recentBlockhash = blockhash;
  (tx as any).feePayer = owner.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx as any, [owner]);

  return { signature };
}

export async function permanentLockPosition(
  connection: Connection,
  ownerPrivateKey: string,
  poolAddress: string,
  positionAddress: string,
  positionNftAccount: string
): Promise<LockResult> {
  const cpAmm = new CpAmm(connection as any);
  const owner = Keypair.fromSecretKey(bs58.decode(ownerPrivateKey));
  const pool = new PublicKey(poolAddress);
  const position = new PublicKey(positionAddress);
  const posNftAccount = new PublicKey(positionNftAccount);

  // Fetch position state to get current unlocked liquidity
  const positionState = await cpAmm.fetchPositionState(position);
  const unlockedLiquidity = positionState.unlockedLiquidity;

  if (unlockedLiquidity.isZero()) {
    throw new Error('No unlocked liquidity to lock — position is already fully locked');
  }

  // The parameter is the amount TO LOCK (not the amount to keep unlocked)
  const tx = await cpAmm.permanentLockPosition({
    owner: owner.publicKey,
    position,
    positionNftAccount: posNftAccount,
    pool,
    unlockedLiquidity,
  });

  (tx as any).add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  (tx as any).recentBlockhash = blockhash;
  (tx as any).feePayer = owner.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx as any, [owner]);

  return { signature };
}
