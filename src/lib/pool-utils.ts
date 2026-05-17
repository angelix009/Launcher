import { Connection, PublicKey } from '@solana/web3.js';

export type PoolType = 'meteora-cpamm' | 'meteora-dlmm' | 'raydium-amm-v4' | 'raydium-clmm' | 'raydium-cpmm';

const RAYDIUM_AMM_V4_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CLMM_PROGRAM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const METEORA_DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

export interface PoolInfo {
  type: PoolType;
  tokenAVault: string;
  tokenBVault: string;
  tokenAMint: string;
  tokenBMint: string;
}

const poolInfoCache = new Map<string, PoolInfo>();

export async function getPoolInfo(connection: Connection, poolAddress: string): Promise<PoolInfo> {
  if (poolInfoCache.has(poolAddress)) return poolInfoCache.get(poolAddress)!;

  const pubkey = new PublicKey(poolAddress);
  const accountInfo = await connection.getAccountInfo(pubkey);
  if (!accountInfo) throw new Error('Pool account not found');

  const owner = accountInfo.owner.toBase58();
  let result: PoolInfo;

  if (owner === RAYDIUM_AMM_V4_PROGRAM) {
    const data = accountInfo.data;
    result = {
      type: 'raydium-amm-v4',
      tokenAVault: new PublicKey(data.subarray(336, 368)).toBase58(),
      tokenBVault: new PublicKey(data.subarray(368, 400)).toBase58(),
      tokenAMint: new PublicKey(data.subarray(400, 432)).toBase58(),
      tokenBMint: new PublicKey(data.subarray(432, 464)).toBase58(),
    };
  } else if (owner === RAYDIUM_CPMM_PROGRAM) {
    // Anchor layout: 8-byte discriminator, then fields
    const data = accountInfo.data;
    result = {
      type: 'raydium-cpmm',
      tokenAVault: new PublicKey(data.subarray(72, 104)).toBase58(),
      tokenBVault: new PublicKey(data.subarray(104, 136)).toBase58(),
      tokenAMint: new PublicKey(data.subarray(168, 200)).toBase58(),
      tokenBMint: new PublicKey(data.subarray(200, 232)).toBase58(),
    };
  } else if (owner === RAYDIUM_CLMM_PROGRAM) {
    // CLMM: use Raydium API
    const apiRes = await fetch(`https://api-v3.raydium.io/pools/info/ids?ids=${poolAddress}`);
    if (!apiRes.ok) throw new Error(`Raydium API error: ${apiRes.status}`);
    const apiData = await apiRes.json();
    const pool = apiData.data?.[0];
    if (!pool) throw new Error('CLMM pool not found in Raydium API');
    result = {
      type: 'raydium-clmm',
      tokenAVault: pool.vault?.A || '',
      tokenBVault: pool.vault?.B || '',
      tokenAMint: pool.mintA?.address || '',
      tokenBMint: pool.mintB?.address || '',
    };
    if (!result.tokenAVault || !result.tokenBVault) {
      throw new Error('Could not parse CLMM vault addresses');
    }
  } else if (owner === METEORA_DLMM_PROGRAM) {
    const DLMM = (await import('@meteora-ag/dlmm')).default;
    const dlmmPool = await DLMM.create(connection as any, pubkey);
    result = {
      type: 'meteora-dlmm',
      tokenAVault: dlmmPool.tokenX.reserve.toBase58(),
      tokenBVault: dlmmPool.tokenY.reserve.toBase58(),
      tokenAMint: dlmmPool.lbPair.tokenXMint.toBase58(),
      tokenBMint: dlmmPool.lbPair.tokenYMint.toBase58(),
    };
  } else {
    // Default: Meteora CPAMM
    const { CpAmm } = await import('@meteora-ag/cp-amm-sdk');
    const cpAmm = new CpAmm(connection);
    const poolState = await cpAmm.fetchPoolState(pubkey);
    result = {
      type: 'meteora-cpamm',
      tokenAVault: poolState.tokenAVault.toBase58(),
      tokenBVault: poolState.tokenBVault.toBase58(),
      tokenAMint: poolState.tokenAMint.toBase58(),
      tokenBMint: poolState.tokenBMint.toBase58(),
    };
  }

  poolInfoCache.set(poolAddress, result);
  console.log('[Pool]', result.type, poolAddress.slice(0, 8),
    'vaults:', result.tokenAVault.slice(0, 8), result.tokenBVault.slice(0, 8));
  return result;
}

export function isRaydiumPool(type: PoolType): boolean {
  return type.startsWith('raydium-');
}

export function isDlmmPool(type: PoolType): boolean {
  return type === 'meteora-dlmm';
}

export function getQuoteMint(poolInfo: PoolInfo, tokenMint: string): string {
  if (poolInfo.tokenAMint === tokenMint) return poolInfo.tokenBMint;
  if (poolInfo.tokenBMint === tokenMint) return poolInfo.tokenAMint;
  throw new Error(`Token mint ${tokenMint} not found in pool (A=${poolInfo.tokenAMint}, B=${poolInfo.tokenBMint})`);
}
