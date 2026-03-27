import { NextResponse } from 'next/server';
import { getConnection, keypairFromPrivateKey } from '@/lib/solana';
import { PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import BN from 'bn.js';

export const dynamic = 'force-dynamic';

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      privateKey,
      poolAddress,
      maxBuyingCap,     // total USDC/SOL the vault can spend (e.g. 25000)
      vestingDuration,  // seconds (0 = instant claim)
      lockDuration,     // seconds before vesting starts after pool activation
      network,
    } = body;

    if (!privateKey || !poolAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: privateKey, poolAddress' },
        { status: 400 }
      );
    }

    const connection = getConnection(network || 'devnet');
    const creator = keypairFromPrivateKey(privateKey);
    const poolPk = new PublicKey(poolAddress);

    // Dynamic imports to avoid ESM build issues
    const AlphaVaultMod = await import('@meteora-ag/alpha-vault');
    const AlphaVault = AlphaVaultMod.default;
    const { PoolType, WhitelistMode, deriveAlphaVault, PROGRAM_ID } = AlphaVaultMod;

    const { CpAmm } = await import('@meteora-ag/cp-amm-sdk');
    const cpAmm = new CpAmm(connection as any);

    // Fetch pool state to get mints and activation point
    const poolState = await cpAmm.fetchPoolState(poolPk);

    // Detect quote decimals
    const USDC_MINTS = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    ];
    const tokenBMintStr = poolState.tokenBMint.toBase58();
    const quoteDecimals = USDC_MINTS.includes(tokenBMintStr) ? 6 : 9;

    const activationPoint = new BN(poolState.activationPoint.toString());

    // Use depositingPoint = 0 — the on-chain program calculates the actual
    // depositing window from the pool's activationPoint automatically.
    // This is how the working local SDK example does it.
    const depositingPoint = new BN(0);

    const lock = lockDuration ?? 10;
    const vesting = vestingDuration ?? 10;
    const startVestingPoint = activationPoint.add(new BN(lock));
    const endVestingPoint = startVestingPoint.add(new BN(Math.max(vesting, 1)));

    // Max buying cap in raw units
    const rawMaxBuyingCap = new BN(
      Math.floor((maxBuyingCap || 25000) * 10 ** quoteDecimals).toString()
    );

    const cluster = network === 'devnet' ? 'devnet' : 'mainnet-beta';

    console.log('Creating Alpha Vault (Pro-rata, local SDK)...');
    console.log('  Pool:', poolAddress);
    console.log('  maxBuyingCap:', maxBuyingCap, quoteDecimals === 6 ? 'USDC' : 'SOL');
    console.log('  activationPoint:', activationPoint.toString());
    console.log('  depositingPoint: 0 (auto)');
    console.log('  startVesting:', startVestingPoint.toString());
    console.log('  endVesting:', endVestingPoint.toString());

    const createVaultTx = await AlphaVault.createCustomizableProrataVault(
      connection as any,
      {
        poolAddress: poolPk,
        poolType: PoolType.DAMMV2,
        baseMint: poolState.tokenAMint,
        quoteMint: poolState.tokenBMint,
        depositingPoint,
        startVestingPoint,
        endVestingPoint,
        maxBuyingCap: rawMaxBuyingCap,
        escrowFee: new BN(0),
        whitelistMode: WhitelistMode.PermissionWithAuthority,
      },
      creator.publicKey,
      { cluster }
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      createVaultTx as any,
      [creator],
      { commitment: 'confirmed' }
    );

    // Derive vault address
    const alphaVaultProgramId = new PublicKey(PROGRAM_ID[cluster]);
    const [vaultAddress] = deriveAlphaVault(
      creator.publicKey,
      poolPk,
      alphaVaultProgramId
    );

    console.log('Alpha Vault created:', vaultAddress.toBase58(), 'sig:', sig);

    return NextResponse.json({
      success: true,
      data: {
        vaultAddress: vaultAddress.toBase58(),
        signature: sig,
        activationPoint: activationPoint.toNumber(),
        startVesting: startVestingPoint.toNumber(),
        endVesting: endVestingPoint.toNumber(),
        maxBuyingCap: maxBuyingCap,
        quoteSymbol: quoteDecimals === 6 ? 'USDC' : 'SOL',
      },
    });
  } catch (err) {
    console.error('Create Alpha Vault error:', err);
    return NextResponse.json(
      { success: false, error: extractError(err) },
      { status: 500 }
    );
  }
}
