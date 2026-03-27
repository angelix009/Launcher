/**
 * E2E test: Token creation → Pool → Alpha Vault → Escrows → Deposit → Fill → Claim
 * Target: 1M MC at SOL=$91 → ~10989 SOL MC → initPrice ≈ 0.000011 SOL/token (1B supply)
 */

const BASE = 'http://localhost:3001';
const PRIVATE_KEY = 'HHseayi8m71ACt1VTnjRfUD9AwxmdQdBNXq2LYwxxGSMgAiSZwsvtTNDDduxwhxpEfRmEUebVx6Vd3oUWdRNv6N';
const NETWORK = 'devnet';

const WALLETS = [
  { pub: 'Ba1za2d2EPZGvgboJLN84iYtsWvsPumHYVhxx7MuT3w6', priv: '4VtBuv8XaRrAXQcM1JtpFGY8MSoLqb5mDvkLaCK8oRK85Z3ZCVdNdHE4xGCjLTPsj4wqvY6fy3hd4HcnZwa19Gbi' },
  { pub: '43erXEevYwG5nySKPmXUdZKmC4mh5E3UUxiDxNFwRdRu', priv: '2DMhijPhRj8UF5frj1PqhpWb3rr22HNzznyWEkAXn4Fy4Vz3Xi3x4ndbNMii22eo3A9SavVucx68BcLkGcMTZi1q' },
  { pub: '7YBnmCGiUqMXE9Cc3rXWcvTzXqCc6D1iEHTeuHs1EpnT', priv: '5AHSGYLLdztUY1aDr4mFXZPi5KrZ4gDiXi2RPfpPafv87HuarBL4C1uk4QZsXm5xvsGH6TG9EN1ff7MXCoUySto' },
];

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`${path} failed: ${data.error}`);
  return data.data || data;
}

function log(step, msg) {
  console.log(`\n[${'='.repeat(60)}]`);
  console.log(`[STEP ${step}] ${msg}`);
  console.log(`[${'='.repeat(60)}]`);
}

async function sleep(ms) {
  console.log(`  ⏳ Waiting ${ms/1000}s...`);
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  try {
    // ============ STEP 1: Create Token ============
    let tokenMint = process.env.TOKEN_MINT;
    if (tokenMint) {
      log(1, `Using existing token: ${tokenMint}`);
    } else {
      log(1, 'Creating Token 2022 (1B supply, 6 decimals)');
      const tokenResult = await api('/api/create-token', {
        privateKey: PRIVATE_KEY,
        name: 'VaultTest',
        symbol: 'VTEST',
        decimals: 6,
        supply: 1_000_000_000,
        network: NETWORK,
      });
      tokenMint = tokenResult.mintAddress || tokenResult.mint || tokenResult.tokenMint;
      console.log('  Token:', tokenMint);
    }

    // ============ STEP 2: Create Pool with Alpha Vault ============
    log(2, 'Creating DAMM v2 Pool (hasAlphaVault=true, delay=5400s)');
    const poolResult = await api('/api/pool/create', {
      privateKey: PRIVATE_KEY,
      tokenMint,
      quoteMint: 'SOL',
      initPrice: 0.000011,
      initialTokenAmount: 50_000_000, // 50M tokens in pool (what was minted)
      initialQuoteAmount: 0,           // single-sided
      activationType: 'timestamp',
      activationDelay: 5400,           // 1h30
      hasAlphaVault: true,
      collectFeeMode: 1,               // OnlyB (SOL)
      maxBaseFeeBps: 400,
      minBaseFeeBps: 400,
      useDynamicFee: true,
      network: NETWORK,
    });
    const poolAddress = poolResult.poolAddress;
    console.log('  Pool:', poolAddress);
    console.log('  Sig:', poolResult.signature);

    // ============ STEP 3: Create Alpha Vault ============
    log(3, 'Creating Alpha Vault (pro-rata, depositingPoint=0)');
    const vaultResult = await api('/api/alpha-vault/create', {
      privateKey: PRIVATE_KEY,
      poolAddress,
      maxBuyingCap: 5, // 5 SOL max buying
      lockDuration: 10,
      vestingDuration: 10,
      network: NETWORK,
    });
    const vaultAddress = vaultResult.vaultAddress;
    console.log('  Vault:', vaultAddress);
    console.log('  Sig:', vaultResult.signature);
    console.log('  Activation:', vaultResult.activationPoint);

    // ============ STEP 4: Create Escrows for wallets ============
    log(4, `Creating escrows for ${WALLETS.length} wallets`);
    const escrowResult = await api('/api/alpha-vault/create-escrows', {
      privateKey: PRIVATE_KEY,
      vaultAddress,
      walletPublicKeys: WALLETS.map(w => w.pub),
      maxCapPerWallet: 2, // 2 SOL max per wallet
      quoteDecimals: 9,   // SOL
      network: NETWORK,
    });
    console.log('  Created:', escrowResult.totalCreated, '/', escrowResult.totalWallets);

    // ============ STEP 5: Check vault status ============
    log(5, 'Checking vault status');
    const status1 = await api('/api/alpha-vault/status', { vaultAddress, network: NETWORK });
    console.log('  State:', status1.state);
    console.log('  Depositing point:', status1.depositingPoint);
    console.log('  First join:', status1.firstJoinPoint);
    console.log('  Last join:', status1.lastJoinPoint);
    console.log('  Current point:', status1.currentPoint);

    // ============ STEP 6: Deposit from each wallet ============
    log(6, 'Depositing 0.5 SOL from each wallet');
    for (const w of WALLETS) {
      try {
        const depResult = await api('/api/alpha-vault/deposit', {
          vaultAddress,
          walletPrivateKey: w.priv,
          amount: 0.5,
          quoteDecimals: 9,
          network: NETWORK,
        });
        console.log(`  ${w.pub.slice(0,8)}... deposited ${depResult.deposited} SOL - sig: ${depResult.signature?.slice(0,20)}...`);
      } catch (e) {
        console.log(`  ${w.pub.slice(0,8)}... FAILED: ${e.message}`);
      }
    }

    // ============ STEP 7: Wait for purchasing window then fill ============
    log(7, 'Checking if vault is in PURCHASING state');
    const status2 = await api('/api/alpha-vault/status', { vaultAddress, network: NETWORK });
    console.log('  State:', status2.state);
    console.log('  Total deposit:', status2.totalDeposit);

    if (status2.state !== 'PURCHASING') {
      const waitUntil = status2.lastJoinPoint || (status2.currentPoint + 3600);
      const remaining = waitUntil - status2.currentPoint;
      console.log(`  Vault not in PURCHASING state yet. Need to wait ~${remaining}s`);
      console.log('  >> Fill and Claim must be done manually after the depositing window closes.');
      console.log('  >> Run: curl -X POST http://localhost:3001/api/alpha-vault/fill \\');
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"vaultAddress":"${vaultAddress}","privateKey":"${PRIVATE_KEY}","network":"devnet"}'`);
    } else {
      // Fill vault
      log('7b', 'Filling vault (crank)');
      const fillResult = await api('/api/alpha-vault/fill', {
        vaultAddress,
        privateKey: PRIVATE_KEY,
        network: NETWORK,
      });
      console.log('  Bought tokens:', fillResult.boughtToken);
      console.log('  Swapped:', fillResult.swappedAmount);

      // Claim
      log(8, 'Claiming tokens for each wallet');
      for (const w of WALLETS) {
        try {
          const claimResult = await api('/api/alpha-vault/claim', {
            vaultAddress,
            walletPrivateKey: w.priv,
            network: NETWORK,
          });
          console.log(`  ${w.pub.slice(0,8)}... claimed ${claimResult.claimedNow} tokens`);
        } catch (e) {
          console.log(`  ${w.pub.slice(0,8)}... FAILED: ${e.message}`);
        }
      }
    }

    log('DONE', 'Test complete!');
    console.log('  Token:', tokenMint);
    console.log('  Pool:', poolAddress);
    console.log('  Vault:', vaultAddress);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  }
}

main();
