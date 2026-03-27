export interface WalletEntry {
  id: string;
  publicKey: string;
  privateKey: string;
  solBalance: number;
  tokenBalance: number;
  usdcBalance: number;
  label?: string;
  createdAt: string;
}

export interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  poolAmount: number; // amount to mint to creator for pool liquidity
  description: string;
  imageUrl: string;
  revokeFreeze: boolean;
  network: 'devnet' | 'mainnet-beta';
  vanityPrefix?: string;
  vanitySuffix?: string;
}

export interface TokenResult {
  mintAddress: string;
  tokenAccount: string;
  metadataUri?: string;
  signature: string;
  explorerUrl: string;
}

export interface PoolConfig {
  tokenMint: string;
  quoteMint: 'SOL' | 'USDC';
  initialTokenAmount: number;
  initialQuoteAmount: number;
  initPrice: number;
  maxPrice: number | null;
  maxBaseFeeBps: number;
  minBaseFeeBps: number;
  feeSchedulerMode: number; // 0 = linear, 1 = exponential
  numberOfPeriod: number;
  totalDuration: number;
  useDynamicFee: boolean;
  collectFeeMode: number; // 0 = BothToken, 1 = OnlyB (SOL)
  activationType: 'timestamp' | 'slot';
  activationDelay: number; // seconds for timestamp, slots for slot
  hasAlphaVault: boolean;
  network: 'devnet' | 'mainnet-beta';
}

export interface PoolResult {
  poolAddress: string;
  signature: string;
  explorerUrl: string;
}

export interface SellConfig {
  tokenMint: string;
  poolAddress: string;
  percentage: number;
  walletIds: string[];
  slippage: number;
  network: 'devnet' | 'mainnet-beta';
}

export interface TransactionLog {
  id: string;
  type: 'mint' | 'transfer' | 'sell' | 'buy' | 'pool' | 'fund';
  signature: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface MintToWalletsConfig {
  privateKey: string; // mint authority private key
  tokenMint: string;
  wallets: WalletEntry[];
  amountPerWallet: number;
  network: 'devnet' | 'mainnet-beta';
}

export interface RevokeAuthoritiesConfig {
  privateKey: string; // current authority private key
  tokenMint: string;
  revokeMint: boolean;
  revokeUpdate: boolean;
  network: 'devnet' | 'mainnet-beta';
}

export interface BuyResult {
  walletId: string;
  walletPublicKey: string;
  signature?: string;
  error?: string;
  quoteSpent: number;
  tokensReceived: number;
  quoteSymbol: string;
}

export type AppModule = 'dashboard' | 'token' | 'wallets' | 'pool' | 'pool-v1' | 'pool-manage' | 'sell' | 'revoke' | 'market-making' | 'alpha-vault';
