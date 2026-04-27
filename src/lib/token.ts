import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  ExtensionType,
  getMintLen,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
  TYPE_SIZE,
  LENGTH_SIZE,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { sendTransactionWithRetry } from './solana';
import type { TokenConfig, TokenResult } from '@/types';
import path from 'path';
import os from 'os';

export async function createToken2022(
  connection: Connection,
  payer: Keypair,
  config: TokenConfig
): Promise<TokenResult> {
  // Vanity address: use pre-ground keypair if available, otherwise grind
  let mintKeypair: Keypair = Keypair.generate();

  if (config.vanityKeypair && config.vanityKeypair.length > 0) {
    mintKeypair = Keypair.fromSecretKey(Uint8Array.from(config.vanityKeypair));
    console.log(`[vanity] Using imported keypair: ${mintKeypair.publicKey.toBase58()}`);
  } else {
  const prefix = (config.vanityPrefix || '').trim();
  const suffix = (config.vanitySuffix || '').trim();

  if (prefix || suffix) {
    const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const isValidBase58 = (s: string) => [...s].every(c => BASE58_CHARS.includes(c));

    if (prefix && !isValidBase58(prefix)) throw new Error(`Invalid prefix: "${prefix}" contains non-base58 characters`);
    if (suffix && !isValidBase58(suffix)) throw new Error(`Invalid suffix: "${suffix}" contains non-base58 characters`);

    // Multi-threaded vanity grind
    // Dynamic require to avoid Turbopack static analysis
    // eslint-disable-next-line no-eval
    const { Worker } = eval("require('worker_threads')");
    const numWorkers = Math.max(1, os.cpus().length - 1); // Leave 1 core free
    const BATCH_PER_WORKER = 5_000_000;
    const workerPath = path.join(process.cwd(), 'workers/vanity-worker.js');

    console.log(`[vanity] Starting ${numWorkers} workers for prefix="${prefix}" suffix="${suffix}"`);

    const result = await new Promise<{ secretKey: number[]; address: string; attempts: number } | null>((resolve) => {
      let totalAttempts = 0;
      let done = false;
      const workers: Worker[] = [];

      for (let w = 0; w < numWorkers; w++) {
        const worker = new Worker(workerPath, {
          workerData: { prefix, suffix, batchSize: BATCH_PER_WORKER },
        });
        workers.push(worker);

        worker.on('message', (msg: { found?: boolean; secretKey?: number[]; address?: string; attempts?: number; progress?: number }) => {
          if (done) return;

          if (msg.progress) {
            totalAttempts += 500000;
            console.log(`[vanity] ${totalAttempts.toLocaleString()} attempts so far...`);
          }

          if (msg.found && msg.secretKey && msg.address) {
            done = true;
            totalAttempts += msg.attempts || 0;
            console.log(`[vanity] Found after ~${totalAttempts.toLocaleString()} total attempts: ${msg.address}`);
            // Terminate all other workers
            for (const ow of workers) {
              try { ow.terminate(); } catch {}
            }
            resolve({ secretKey: msg.secretKey, address: msg.address, attempts: totalAttempts });
          }

          if (!msg.found && msg.attempts) {
            totalAttempts += msg.attempts;
          }
        });

        worker.on('exit', () => {
          const allDone = workers.every(w2 => {
            try { return w2.threadId === -1; } catch { return true; }
          });
          if (!done && allDone) {
            resolve(null);
          }
        });

        worker.on('error', (err) => {
          console.error(`[vanity] Worker error:`, err);
        });
      }
    });

    if (!result) {
      throw new Error(`Could not find vanity address with prefix="${prefix}" suffix="${suffix}" after ${numWorkers * BATCH_PER_WORKER} attempts across ${numWorkers} threads. Try shorter values.`);
    }

    mintKeypair = Keypair.fromSecretKey(Uint8Array.from(result.secretKey));
  } else {
    mintKeypair = Keypair.generate();
  }
  } // close vanityKeypair else
  const mint = mintKeypair.publicKey;

  // Upload off-chain metadata JSON (Metaplex standard)
  let metadataUri = config.imageUrl || '';
  if (config.imageUrl) {
    try {
      const metadataJson = JSON.stringify({
        name: config.name,
        symbol: config.symbol,
        description: config.description || '',
        image: config.imageUrl,
        attributes: [],
        properties: {
          files: [{ uri: config.imageUrl, type: 'image/png' }],
          category: 'image',
        },
      });
      const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
        body: metadataJson,
      });
      if (pinataRes.ok) {
        const { IpfsHash } = await pinataRes.json();
        metadataUri = `https://${process.env.PINATA_GATEWAY || 'goal.mypinata.cloud'}/ipfs/${IpfsHash}`;
      }
    } catch (e) {
      console.warn('Failed to upload metadata JSON, falling back to image URL:', e);
    }
  }

  // Build metadata for Token 2022 metadata extension
  const metadata: TokenMetadata = {
    mint: mint,
    name: config.name,
    symbol: config.symbol,
    uri: metadataUri,
    additionalMetadata: config.description
      ? [['description', config.description]]
      : [],
  };

  // Calculate space needed
  const metadataLen = pack(metadata).length;
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const totalLen = mintLen + TYPE_SIZE + LENGTH_SIZE + metadataLen;
  const lamports = await connection.getMinimumBalanceForRentExemption(totalLen);

  // Build transaction
  const tx = new Transaction();

  // 1. Create account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2. Initialize metadata pointer (points to the mint itself)
  tx.add(
    createInitializeMetadataPointerInstruction(
      mint,
      payer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 3. Initialize mint
  tx.add(
    createInitializeMintInstruction(
      mint,
      config.decimals,
      payer.publicKey,
      config.revokeFreeze ? null : payer.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 4. Initialize metadata
  tx.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mint,
      metadata: mint,
      name: config.name,
      symbol: config.symbol,
      uri: metadataUri,
      mintAuthority: payer.publicKey,
      updateAuthority: payer.publicKey,
    })
  );

  // 5. Add description as additional metadata field
  if (config.description) {
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer.publicKey,
        field: 'description',
        value: config.description,
      })
    );
  }

  // 6. Create ATA for payer
  const ata = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  tx.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 7. Mint pool amount to creator's ATA (NOT the full supply)
  // The rest will be minted directly to side wallets via mintTo
  const poolAmount = config.poolAmount || 0;
  if (poolAmount > 0) {
    const mintAmount = BigInt(Math.floor(poolAmount)) * BigInt(10 ** config.decimals);
    tx.add(
      createMintToInstruction(
        mint,
        ata,
        payer.publicKey,
        mintAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // NOTE: Mint authority is kept active for direct minting to side wallets.
  // Call revokeAuthorities() after all minting is complete.

  const signature = await sendTransactionWithRetry(
    connection,
    tx,
    [payer, mintKeypair]
  );

  const network = config.network;
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';

  return {
    mintAddress: mint.toBase58(),
    tokenAccount: ata.toBase58(),
    signature,
    explorerUrl: `https://solscan.io/token/${mint.toBase58()}${cluster}`,
  };
}

export async function createTokenSPL(
  connection: Connection,
  payer: Keypair,
  config: TokenConfig
): Promise<TokenResult> {
  const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

  // Vanity address: reuse same logic
  let mintKeypair: Keypair = Keypair.generate();

  if (config.vanityKeypair && config.vanityKeypair.length > 0) {
    mintKeypair = Keypair.fromSecretKey(Uint8Array.from(config.vanityKeypair));
    console.log(`[vanity] Using imported keypair: ${mintKeypair.publicKey.toBase58()}`);
  } else {
    const prefix = (config.vanityPrefix || '').trim();
    const suffix = (config.vanitySuffix || '').trim();
    if (prefix || suffix) {
      // Reuse multi-threaded grind
      const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const isValidBase58 = (s: string) => [...s].every(c => BASE58_CHARS.includes(c));
      if (prefix && !isValidBase58(prefix)) throw new Error(`Invalid prefix: "${prefix}" contains non-base58 characters`);
      if (suffix && !isValidBase58(suffix)) throw new Error(`Invalid suffix: "${suffix}" contains non-base58 characters`);

      const { Worker } = await import('worker_threads');
      const numWorkers = Math.max(1, os.cpus().length - 1);
      const BATCH_PER_WORKER = 5_000_000;
      const workerPath = path.join(process.cwd(), 'workers/vanity-worker.js');
      console.log(`[vanity] Starting ${numWorkers} workers for prefix="${prefix}" suffix="${suffix}"`);

      const result = await new Promise<{ secretKey: number[]; address: string; attempts: number } | null>((resolve) => {
        let totalAttempts = 0;
        let done = false;
        const workers: Worker[] = [];
        for (let w = 0; w < numWorkers; w++) {
          const worker = new Worker(workerPath, { workerData: { prefix, suffix, batchSize: BATCH_PER_WORKER } });
          workers.push(worker);
          worker.on('message', (msg: { found?: boolean; secretKey?: number[]; address?: string; attempts?: number; progress?: number }) => {
            if (done) return;
            if (msg.progress) { totalAttempts += 500000; console.log(`[vanity] ${totalAttempts.toLocaleString()} attempts so far...`); }
            if (msg.found && msg.secretKey && msg.address) {
              done = true;
              totalAttempts += msg.attempts || 0;
              console.log(`[vanity] Found: ${msg.address}`);
              for (const ow of workers) { try { ow.terminate(); } catch {} }
              resolve({ secretKey: msg.secretKey, address: msg.address, attempts: totalAttempts });
            }
            if (!msg.found && msg.attempts) { totalAttempts += msg.attempts; }
          });
          worker.on('exit', () => {
            if (!done && workers.every(w2 => { try { return w2.threadId === -1; } catch { return true; } })) resolve(null);
          });
          worker.on('error', (err) => console.error(`[vanity] Worker error:`, err));
        }
      });
      if (!result) throw new Error(`Could not find vanity address after ${numWorkers * BATCH_PER_WORKER} attempts.`);
      mintKeypair = Keypair.fromSecretKey(Uint8Array.from(result.secretKey));
    }
  }

  const mint = mintKeypair.publicKey;

  // Upload off-chain metadata JSON (Metaplex standard)
  let metadataUri = config.imageUrl || '';
  if (config.imageUrl) {
    try {
      const metadataJson = JSON.stringify({
        name: config.name,
        symbol: config.symbol,
        description: config.description || '',
        image: config.imageUrl,
        attributes: [],
        properties: {
          files: [{ uri: config.imageUrl, type: 'image/png' }],
          category: 'image',
        },
      });
      const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
        body: metadataJson,
      });
      if (pinataRes.ok) {
        const { IpfsHash } = await pinataRes.json();
        metadataUri = `https://${process.env.PINATA_GATEWAY || 'goal.mypinata.cloud'}/ipfs/${IpfsHash}`;
      }
    } catch (e) {
      console.warn('Failed to upload metadata JSON:', e);
    }
  }

  // TX 1: Create mint + ATA + MintTo
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const tx1 = new Transaction();

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  tx1.add(
    createInitializeMintInstruction(
      mint,
      config.decimals,
      payer.publicKey,
      config.revokeFreeze ? null : payer.publicKey,
      TOKEN_PROGRAM_ID
    )
  );

  const ata = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_PROGRAM_ID);
  tx1.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_PROGRAM_ID
    )
  );

  // Mint total supply to creator
  const totalSupplyRaw = BigInt(Math.floor(config.totalSupply)) * BigInt(10 ** config.decimals);
  tx1.add(
    createMintToInstruction(mint, ata, payer.publicKey, totalSupplyRaw, [], TOKEN_PROGRAM_ID)
  );

  const sig1 = await sendTransactionWithRetry(connection, tx1, [payer, mintKeypair]);
  console.log(`[spl] Token created: ${mint.toBase58()}, sig: ${sig1}`);

  // TX 2: Create Metaplex metadata
  const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METAPLEX_PROGRAM_ID
  );

  // Build CreateMetadataAccountV3 instruction manually
  const nameBytes = Buffer.from(config.name);
  const symbolBytes = Buffer.from(config.symbol);
  const uriBytes = Buffer.from(metadataUri);

  // Borsh serialize: CreateMetadataAccountV3 (discriminator = 33)
  const data = Buffer.concat([
    Buffer.from([33]), // CreateMetadataAccountV3 discriminator
    // Data struct:
    // name (string: 4-byte len + content)
    Buffer.from(new Uint32Array([nameBytes.length]).buffer),
    nameBytes,
    // symbol
    Buffer.from(new Uint32Array([symbolBytes.length]).buffer),
    symbolBytes,
    // uri
    Buffer.from(new Uint32Array([uriBytes.length]).buffer),
    uriBytes,
    // seller_fee_basis_points (u16)
    Buffer.from([0, 0]),
    // creators (Option<Vec<Creator>>): Some([{address, verified:true, share:100}])
    Buffer.from([1]),  // Some
    Buffer.from(new Uint32Array([1]).buffer), // Vec length = 1
    payer.publicKey.toBuffer(), // creator address (32 bytes)
    Buffer.from([1]),  // verified = true (signer)
    Buffer.from([100]), // share = 100
    // collection (Option): None
    Buffer.from([0]),
    // uses (Option): None
    Buffer.from([0]),
    // isMutable (bool)
    Buffer.from([1]),
    // collectionDetails (Option): None
    Buffer.from([0]),
  ]);

  const metadataIx = {
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // mint authority
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: payer.publicKey, isSigner: false, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: METAPLEX_PROGRAM_ID,
    data,
  };

  const tx2 = new Transaction().add(metadataIx);
  const sig2 = await sendTransactionWithRetry(connection, tx2, [payer]);
  console.log(`[spl] Metaplex metadata created, sig: ${sig2}`);

  // TX 3: Revoke mint authority + make metadata immutable
  const tx3 = new Transaction();

  // Revoke mint authority
  tx3.add(
    createSetAuthorityInstruction(
      mint,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Make metadata immutable (UpdateMetadataAccountV2: isMutable = false)
  const revokeData = Buffer.concat([
    Buffer.from([15]), // UpdateMetadataAccountV2
    Buffer.from([0]),  // data: None
    Buffer.from([0]),  // newUpdateAuthority: None
    Buffer.from([0]),  // primarySaleHappened: None
    Buffer.from([1, 0]), // isMutable: Some(false)
  ]);
  tx3.add({
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    programId: METAPLEX_PROGRAM_ID,
    data: revokeData,
  });

  const sig3 = await sendTransactionWithRetry(connection, tx3, [payer]);
  console.log(`[spl] Authorities revoked, sig: ${sig3}`);

  const network = config.network;
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';

  return {
    mintAddress: mint.toBase58(),
    tokenAccount: ata.toBase58(),
    signature: sig1,
    explorerUrl: `https://solscan.io/token/${mint.toBase58()}${cluster}`,
  };
}

export async function revokeAuthorities(
  connection: Connection,
  authority: Keypair,
  tokenMint: PublicKey,
  revokeMint: boolean,
  revokeUpdate: boolean,
  isSPL: boolean = false
): Promise<string> {
  const programId = isSPL ? (await import('@solana/spl-token')).TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const tx = new Transaction();

  if (revokeMint) {
    tx.add(
      createSetAuthorityInstruction(
        tokenMint,
        authority.publicKey,
        AuthorityType.MintTokens,
        null,
        [],
        programId
      )
    );
  }

  if (revokeUpdate) {
    if (isSPL) {
      // For SPL tokens with Metaplex metadata, revoke update authority via Metaplex
      const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
        METAPLEX_PROGRAM_ID
      );
      // UpdateMetadataAccountV2 discriminator = 15
      // Only set isMutable=false (update authority stays but can't change anything)
      const data = Buffer.concat([
        Buffer.from([15]), // UpdateMetadataAccountV2
        Buffer.from([0]),  // data: None
        Buffer.from([0]),  // newUpdateAuthority: None (don't change)
        Buffer.from([0]),  // primarySaleHappened: None
        Buffer.from([1, 0]), // isMutable: Some(false)
      ]);
      tx.add({
        keys: [
          { pubkey: metadataPDA, isSigner: false, isWritable: true },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        ],
        programId: METAPLEX_PROGRAM_ID,
        data,
      });
    } else {
      // Token 2022: revoke via spl-token-metadata
      const { createUpdateAuthorityInstruction } = await import('@solana/spl-token-metadata');
      tx.add(
        createUpdateAuthorityInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: tokenMint,
          oldAuthority: authority.publicKey,
          newAuthority: null,
        })
      );
    }
  }

  if (tx.instructions.length === 0) {
    throw new Error('No authorities selected for revocation');
  }

  return await sendTransactionWithRetry(connection, tx, [authority]);
}

export async function getTokenInfo(
  connection: Connection,
  mintAddress: string
) {
  try {
    const mint = new PublicKey(mintAddress);
    // Try Token 2022 first
    try {
      const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      return {
        address: mintAddress,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / (10 ** mintInfo.decimals),
        isToken2022: true,
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
      };
    } catch {
      // Fall back to standard Token Program
      const { TOKEN_PROGRAM_ID: STD_TOKEN } = await import('@solana/spl-token');
      const mintInfo = await getMint(connection, mint, 'confirmed', STD_TOKEN);
      return {
        address: mintAddress,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / (10 ** mintInfo.decimals),
        isToken2022: false,
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
      };
    }
  } catch (err) {
    throw new Error(`Failed to get token info: ${(err as Error).message}`);
  }
}
