import { Connection, Keypair, PublicKey, ComputeBudgetProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import bs58 from 'bs58';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=3747ba1a-72b2-43ce-8be3-206aba2f3544';
const POOL = new PublicKey('33oCwVtTWkWW9uB12LDFGcdBWL9krYwAQ6gkFZM79EEs');
const TOKEN_MINT = new PublicKey('osorieXXxMQ2tLBeSB7J9huB3SdadcWVGRjjEGfwKnd');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const DAMM_PROGRAM = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
const PRIVATE_KEY = process.argv[2] || '3odqiJHWn3RfPWmRC2q329J41AhWvhQBGYMXq2BNs6t79cYqKPAKYhVQzm4bBSHmptAx1NvqindBukeqPq4yq6Tw';
const QUOTE_AMOUNT = parseFloat(process.argv[3] || '200');

const connection = new Connection(RPC, 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

// Accounts from the reference tx 5nXtoDXipKgLhZ4WymNQK4SXVaxwF5BA4q5Hm4RaQfCZQT3fcKSS2CTdr43Sjo446rDr9TnmaeRFZyzf8KywoUp5
const POOL_AUTHORITY = new PublicKey('HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC');
const TOKEN_A_VAULT = new PublicKey('C8KXEqEZhWENBDTY9mE9VF7HNFw5Vg88HnpcrzQEuE8u'); // osorie vault
const TOKEN_B_VAULT = new PublicKey('32wH2jAdNRXe7EWctvdYfkcgHvwNMA7zhG9TqCzT9drB'); // USDC vault
const REFERRAL_ACCOUNT = new PublicKey('4sLvQc2jeA6Zdk5bqBsHk4HN4fEJC99YeNMAoFHEusCD'); // fee/referral USDC ATA

console.log('Wallet:', keypair.publicKey.toBase58());
console.log('Pool:', POOL.toBase58());
console.log('Buy:', QUOTE_AMOUNT, 'USDC →', TOKEN_MINT.toBase58());

const balance = await connection.getBalance(keypair.publicKey);
console.log('SOL balance:', balance / LAMPORTS_PER_SOL);

// ATAs for payer
const payerUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, keypair.publicKey, false, TOKEN_PROGRAM_ID);
const payerTokenAta = getAssociatedTokenAddressSync(TOKEN_MINT, keypair.publicKey, false, TOKEN_PROGRAM_ID);

console.log('Payer USDC ATA:', payerUsdcAta.toBase58());
console.log('Payer Token ATA:', payerTokenAta.toBase58());

// Build swap instruction data:
// discriminator (8 bytes) + amountIn (u64 LE) + minimumAmountOut (u64 LE)
const amountIn = BigInt(Math.round(QUOTE_AMOUNT * 1e6));
const minimumAmountOut = BigInt('999999999999999999'); // impossibly high → will fail on-chain

// Swap discriminator from DAMM v2: anchor hash of "swap"
const discriminator = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
const data = Buffer.alloc(8 + 8 + 8);
discriminator.copy(data, 0);
data.writeBigUInt64LE(amountIn, 8);
data.writeBigUInt64LE(minimumAmountOut, 16);

// BtoA swap (USDC → osorie): input=USDC(B), output=osorie(A)
// Account order from the program IDL for swap instruction
const swapIx = new TransactionInstruction({
  programId: DAMM_PROGRAM,
  keys: [
    { pubkey: POOL_AUTHORITY, isSigner: false, isWritable: false },          // poolAuthority
    { pubkey: POOL, isSigner: false, isWritable: true },                      // pool
    { pubkey: payerUsdcAta, isSigner: false, isWritable: true },             // inputTokenAccount (payer's USDC)
    { pubkey: payerTokenAta, isSigner: false, isWritable: true },            // outputTokenAccount (payer's osorie)
    { pubkey: TOKEN_A_VAULT, isSigner: false, isWritable: true },            // tokenAVault
    { pubkey: TOKEN_B_VAULT, isSigner: false, isWritable: true },            // tokenBVault
    { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },              // tokenAMint
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },               // tokenBMint
    { pubkey: keypair.publicKey, isSigner: true, isWritable: false },        // payer
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },        // tokenAProgram
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },        // tokenBProgram
    { pubkey: REFERRAL_ACCOUNT, isSigner: false, isWritable: true },         // referralTokenAccount
  ],
  data,
});

const tx = new Transaction();
tx.add(
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
  ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
  createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, payerTokenAta, keypair.publicKey, TOKEN_MINT, TOKEN_PROGRAM_ID),
  createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, payerUsdcAta, keypair.publicKey, USDC_MINT, TOKEN_PROGRAM_ID),
  swapIx,
);

const blockhash = await connection.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash.blockhash;
tx.feePayer = keypair.publicKey;
tx.sign(keypair);

console.log(`\nSending swap: ${QUOTE_AMOUNT} USDC → osorie (will FAIL — minimumAmountOut impossibly high)`);

const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 2,
});

console.log('Tx:', sig);
console.log('https://solscan.io/tx/' + sig);

try {
  const result = await connection.confirmTransaction({ signature: sig, ...blockhash }, 'confirmed');
  if (result.value.err) {
    console.log('\n✓ FAILED on-chain (as expected):', JSON.stringify(result.value.err));
  } else {
    console.log('\n⚠ Transaction confirmed (unexpected)');
  }
} catch (err) {
  console.log('Timeout/error:', err.message);
}
