import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createInitializeAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=3747ba1a-72b2-43ce-8be3-206aba2f3544';
const PUMP_SWAP = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const privateKey = process.argv[2];
const poolAddress = process.argv[3] || '7mkMgZfBX7X7osh4bXYB8V5DYpSN2XLHmRXqHFyqPHVt';
const tokenMint = process.argv[4] || 'XGbMLzy8r7iJN96huatiyv3VtJ3o1VYjpVzSz7Zpump';

if (!privateKey) {
  console.log('Usage: node scripts/test-fail-tx.mjs <privateKey> [poolAddress] [tokenMint]');
  process.exit(1);
}

const connection = new Connection(RPC, 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
const tokenMintPk = new PublicKey(tokenMint);

console.log('Wallet:', keypair.publicKey.toBase58());
console.log('Pool:', poolAddress);

const balance = await connection.getBalance(keypair.publicKey);
console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

// Derive a WSOL temp account (same method as reference tx: createAccountWithSeed)
const seed = 'FailTest';
const wsolTempAccount = await PublicKey.createWithSeed(keypair.publicKey, seed, TOKEN_PROGRAM_ID);
console.log('WSOL temp:', wsolTempAccount.toBase58());

const userBaseAta = getAssociatedTokenAddressSync(tokenMintPk, keypair.publicKey, false, TOKEN_2022);

// Copy exact data from reference tx 5u3uCX8b...
const refSwapData = bs58.decode('2Nk86asu1ki94xh4vKpxWHzS88GvY1cL8CY');
const swapData = Buffer.from(refSwapData);
// Overwrite: base_amount_out = huge, max_quote_in = 100 SOL
swapData.writeBigUInt64LE(1000000000n, 8);
swapData.writeBigUInt64LE(BigInt(100 * LAMPORTS_PER_SOL), 16);

const tx = new Transaction();

// IX 0: ComputeBudget setComputeUnitPrice (same as ref)
tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }));

// IX 1: ComputeBudget setComputeUnitLimit (same as ref)
tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 120000 }));

// IX 2: Create WSOL temp account with seed (100 SOL — will fail here)
tx.add(SystemProgram.createAccountWithSeed({
  fromPubkey: keypair.publicKey,
  basePubkey: keypair.publicKey,
  seed,
  newAccountPubkey: wsolTempAccount,
  lamports: 100 * LAMPORTS_PER_SOL,
  space: 165,
  programId: TOKEN_PROGRAM_ID,
}));

// IX 3: Initialize WSOL temp account
tx.add(createInitializeAccountInstruction(
  wsolTempAccount,
  WSOL,
  keypair.publicKey,
  TOKEN_PROGRAM_ID,
));

// IX 4: PumpSwap buy (exact accounts from ref, user + ATAs replaced)
tx.add(new TransactionInstruction({
  programId: PUMP_SWAP,
  keys: [
    { pubkey: new PublicKey(poolAddress), isSigner: false, isWritable: true },
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey('ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw'), isSigner: false, isWritable: false },
    { pubkey: tokenMintPk, isSigner: false, isWritable: false },
    { pubkey: WSOL, isSigner: false, isWritable: false },
    { pubkey: userBaseAta, isSigner: false, isWritable: true },
    { pubkey: wsolTempAccount, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('2G2Arq4h7fmqDnQdk8EazcsvCYVddx1yvhtdgwcVDYRr'), isSigner: false, isWritable: true },
    { pubkey: new PublicKey('Dq3dHMk2aaScdPcXBrcyExLffE9h7sCg7eYNhLVfw3hW'), isSigner: false, isWritable: true },
    { pubkey: new PublicKey('G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP'), isSigner: false, isWritable: true },
    { pubkey: new PublicKey('BWXT6RUhit9FfJQM3pBmqeFLPYmuxgmyhMGC5sGr8RbA'), isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR'), isSigner: false, isWritable: false },
    { pubkey: PUMP_SWAP, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('3hdQpBF9VRgC1o7ZMhdSR6xRfpU4aBMfetCujrWpEGX5'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('65kT4E7w7z2GnB9Sj4Zq1BY9zWnX2dr4eRMXMNSNMbxa'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('7ReXkZkMj84gciTLJMKuEVdS4m8UdCzcJWYGy3QzHWxX'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('6WPnEwjVrUNFNfCzYMHDYXCdqD2cyiy2rMXTvPJDnzwR'), isSigner: false, isWritable: false },
  ],
  data: swapData,
}));

const { blockhash } = await connection.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;
tx.feePayer = keypair.publicKey;
tx.sign(keypair);

console.log('\nSending PumpSwap buy (100 SOL) with skipPreflight...');

const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 1,
});

console.log('Tx:', sig);
console.log('https://solscan.io/tx/' + sig);

try {
  const result = await connection.confirmTransaction(sig, 'confirmed');
  if (result.value.err) {
    console.log('✓ FAILED on-chain:', JSON.stringify(result.value.err));
  } else {
    console.log('⚠ Confirmed!');
  }
} catch (err) {
  console.log('Timeout/error:', err.message);
}
