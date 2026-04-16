const { parentPort, workerData } = require('worker_threads');
const { Keypair } = require('@solana/web3.js');

const { prefix, suffix, batchSize } = workerData;

for (let i = 0; i < batchSize; i++) {
  const candidate = Keypair.generate();
  const addr = candidate.publicKey.toBase58();

  const matchPrefix = !prefix || addr.startsWith(prefix);
  const matchSuffix = !suffix || addr.endsWith(suffix);

  if (matchPrefix && matchSuffix) {
    parentPort.postMessage({
      found: true,
      secretKey: Array.from(candidate.secretKey),
      address: addr,
      attempts: i + 1,
    });
    return;
  }

  if (i > 0 && i % 500000 === 0) {
    parentPort.postMessage({ progress: i });
  }
}

parentPort.postMessage({ found: false, attempts: batchSize });
