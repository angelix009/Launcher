import { PublicKey } from '@solana/web3.js';

export const NETWORKS = {
  'devnet': 'https://api.devnet.solana.com',
  'mainnet-beta': `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ''}`,
} as const;

export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Meteora DAMM v2 Program
export const CP_AMM_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');

// Meteora DAMM v1 Program
export const DAMM_V1_PROGRAM_ID = new PublicKey('Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB');

// Meteora M3M3 (Stake2Earn) Program
export const M3M3_PROGRAM_ID = new PublicKey('FEESngU3neckdwib9X3KWqdL7Mjmqk9XNp3uh5JbP4KP');

// ATA funding per wallet (0.02 SOL)
export const ATA_FUNDING_AMOUNT = 0.02;

// Default pool parameters (matching reference tokens SCMR/FUEF)
export const DEFAULT_MAX_BASE_FEE_BPS = 400; // 4% max base fee
export const DEFAULT_MIN_BASE_FEE_BPS = 400; // 4% min base fee
export const DEFAULT_FEE_SCHEDULER_MODE = 0; // linear
export const DEFAULT_NUMBER_OF_PERIOD = 0;
export const DEFAULT_TOTAL_DURATION = 0;
export const DEFAULT_USE_DYNAMIC_FEE = true;
export const DEFAULT_COLLECT_FEE_MODE = 1; // OnlyB (fees in SOL only)
export const DEFAULT_TOTAL_SUPPLY = 1_000_000_000;
export const DEFAULT_DECIMALS = 6;
export const DEFAULT_INIT_PRICE = 0.00001; // initial price in SOL per token

// Sell percentages
export const SELL_PRESETS = [2.5, 5, 10, 25, 50, 100];

// Batch sizes
export const TX_BATCH_SIZE = 10;
export const WALLET_BATCH_SIZE = 20;
