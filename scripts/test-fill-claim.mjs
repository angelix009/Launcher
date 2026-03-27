/**
 * Wait for PURCHASING state, then fill + claim
 */
const BASE = 'http://localhost:3001';
const PRIVATE_KEY = 'HHseayi8m71ACt1VTnjRfUD9AwxmdQdBNXq2LYwxxGSMgAiSZwsvtTNDDduxwhxpEfRmEUebVx6Vd3oUWdRNv6N';
const VAULT = '7gjiRuJKAfUoCtLVDsL76yevkzMtdibvF4mHQrYEacfF';
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
  if (!data.success) throw new Error(`${path}: ${data.error}`);
  return data.data || data;
}

async function main() {
  // Poll until PURCHASING state (state >= 2)
  console.log('Waiting for vault to enter PURCHASING state...');
  while (true) {
    const status = await api('/api/alpha-vault/status', { vaultAddress: VAULT, network: NETWORK });
    const remaining = (status.lastJoinPoint || 0) - status.currentPoint;
    console.log(`  State: ${status.state}, currentPoint: ${status.currentPoint}, lastJoin: ${status.lastJoinPoint}, remaining: ${remaining}s`);

    // State: 1=depositing, 2=purchasing, 3=purchased, 4=claiming
    if (status.state >= 2) {
      console.log('  >> Vault is in PURCHASING state or beyond!');
      break;
    }

    // Wait 30s and check again
    await new Promise(r => setTimeout(r, 30000));
  }

  // Fill vault
  console.log('\n=== FILLING VAULT (crank) ===');
  try {
    const fillResult = await api('/api/alpha-vault/fill', {
      vaultAddress: VAULT,
      privateKey: PRIVATE_KEY,
      network: NETWORK,
    });
    console.log('  Bought tokens:', fillResult.boughtToken);
    console.log('  Swapped:', fillResult.swappedAmount);
    console.log('  Sig:', fillResult.signature);
  } catch (e) {
    console.log('  Fill error:', e.message);
    console.log('  Checking status...');
    const st = await api('/api/alpha-vault/status', { vaultAddress: VAULT, network: NETWORK });
    console.log('  State:', st.state, 'boughtToken:', st.boughtToken);
  }

  // Wait a bit for vesting
  console.log('\nWaiting 15s for vesting period...');
  await new Promise(r => setTimeout(r, 15000));

  // Claim for each wallet
  console.log('\n=== CLAIMING TOKENS ===');
  for (const w of WALLETS) {
    try {
      const claimResult = await api('/api/alpha-vault/claim', {
        vaultAddress: VAULT,
        walletPrivateKey: w.priv,
        network: NETWORK,
      });
      console.log(`  ${w.pub.slice(0,12)}... claimed ${claimResult.claimedNow} tokens (total: ${claimResult.totalAllocated})`);
    } catch (e) {
      console.log(`  ${w.pub.slice(0,12)}... FAILED: ${e.message}`);
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(e => console.error('Fatal:', e.message));
