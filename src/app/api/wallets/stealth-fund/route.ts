import { getConnection, keypairFromPrivateKey, keypairToPrivateKey } from '@/lib/solana';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { USDC_MINT, USDC_DEVNET_MINT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const TX_FEE_SOL = 0.000005;
const ATA_RENT_SOL = 0.00204;
const USDC_DECIMALS = 6;

// ─── Types ───

interface MeshNode {
  keypair: Keypair | null;
  publicKey: string;
  level: number;
  isDestination: boolean;
  receivedAmount: number;  // asset (SOL or USDC) this node will receive
  receivedSol: number;     // SOL for gas (USDC mode only)
  sends: Edge[];
}

interface Edge {
  to: MeshNode;
  amount: number; // asset amount
  sol: number;    // SOL for gas
}

// ─── Helpers ───

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/**
 * Build a mesh/lattice funding network (NOT a tree).
 *
 * Key differences from a tree:
 * - Nodes can receive from MULTIPLE parents (merge)
 * - Creates realistic payment-network-like graph
 * - Variable node count per level
 * - ~30% of nodes have 2+ parents
 */
function buildMesh(
  destinations: string[],
  amountPerWallet: number,
  hops: number,
  amountNoise: number,
  asset: 'SOL' | 'USDC',
): MeshNode[][] {
  const N = destinations.length;

  // Create destination nodes (final level)
  const destLevel: MeshNode[] = destinations
    .sort(() => Math.random() - 0.5) // shuffle
    .map(pk => ({
      keypair: null,
      publicKey: pk,
      level: hops,
      isDestination: true,
      receivedAmount: amountPerWallet * (1 + rand(-amountNoise, amountNoise)),
      receivedSol: asset === 'USDC' ? 0.003 : 0,
      sends: [],
    }));

  const levels: MeshNode[][] = new Array(hops + 1);
  levels[hops] = destLevel;

  // Build intermediate levels bottom-up
  for (let h = hops - 1; h >= 0; h--) {
    const childLevel = levels[h + 1];

    // Variable node count: between ceil(N/4) and ceil(N/1.5)
    // More nodes = more merge opportunities
    const minNodes = Math.max(2, Math.ceil(childLevel.length / 4));
    const maxNodes = Math.max(3, Math.ceil(childLevel.length / 1.5));
    const numNodes = Math.floor(rand(minNodes, maxNodes + 1));

    const nodes: MeshNode[] = Array.from({ length: numNodes }, () => {
      const kp = Keypair.generate();
      return {
        keypair: kp,
        publicKey: kp.publicKey.toBase58(),
        level: h,
        isDestination: false,
        receivedAmount: 0,
        receivedSol: 0,
        sends: [],
      };
    });

    // ── Connect parents → children with merges ──

    // 1) Ensure every child has at least 1 parent
    for (const child of childLevel) {
      const parent = nodes[Math.floor(Math.random() * nodes.length)];
      if (!parent.sends.some(s => s.to === child)) {
        parent.sends.push({ to: child, amount: 0, sol: 0 });
      }
    }

    // 2) Add extra merge connections: ~40% of children get a 2nd parent
    for (const child of childLevel) {
      if (Math.random() < 0.4 && nodes.length > 1) {
        const existingParentPks = new Set(
          nodes.filter(n => n.sends.some(s => s.to === child)).map(n => n.publicKey)
        );
        const available = nodes.filter(n => !existingParentPks.has(n.publicKey));
        if (available.length > 0) {
          const extra = available[Math.floor(Math.random() * available.length)];
          extra.sends.push({ to: child, amount: 0, sol: 0 });
        }
      }
    }

    // 3) Ensure every parent has at least 1 child
    for (const parent of nodes) {
      if (parent.sends.length === 0) {
        const child = childLevel[Math.floor(Math.random() * childLevel.length)];
        parent.sends.push({ to: child, amount: 0, sol: 0 });
      }
    }

    // ── Calculate amounts (split each child's needs among its parents) ──
    for (const child of childLevel) {
      const parentEdges: { parent: MeshNode; edge: Edge }[] = [];
      for (const parent of nodes) {
        for (const edge of parent.sends) {
          if (edge.to === child) {
            parentEdges.push({ parent, edge });
          }
        }
      }

      if (parentEdges.length === 1) {
        parentEdges[0].edge.amount = child.receivedAmount;
        parentEdges[0].edge.sol = child.receivedSol;
      } else {
        // Random split ratios with noise
        const ratios = parentEdges.map(() => 0.3 + Math.random() * 0.7);
        const total = ratios.reduce((a, b) => a + b, 0);
        parentEdges.forEach(({ edge }, i) => {
          edge.amount = child.receivedAmount * (ratios[i] / total);
          edge.sol = child.receivedSol * (ratios[i] / total);
        });
      }
    }

    // Calculate each parent's total needs (including overhead for tx fees)
    for (const parent of nodes) {
      const totalAssetSend = parent.sends.reduce((s, e) => s + e.amount, 0);
      const totalSolSend = parent.sends.reduce((s, e) => s + e.sol, 0);
      if (asset === 'SOL') {
        // Include overhead: tx fees for each outgoing send + buffer
        parent.receivedAmount = totalAssetSend
          + parent.sends.length * TX_FEE_SOL
          + 0.001; // buffer for rounding
      } else {
        parent.receivedAmount = totalAssetSend;
        // SOL needed: gas for children + ATA rent per child + tx fee per send
        // + drain tx fee + extra buffer
        // Note: parent's own ATA rent is paid by its parent (or creator),
        // and recovered when parent closes its ATA on last edge
        parent.receivedSol = totalSolSend
          + parent.sends.length * (TX_FEE_SOL + ATA_RENT_SOL)
          + TX_FEE_SOL  // drain tx fee
          + 0.002;      // buffer for rounding & rent
      }
    }

    levels[h] = nodes;
  }

  return levels;
}

// ─── Route handler ───

export async function POST(request: Request) {
  const body = await request.json();
  const {
    privateKey,
    destinations,       // string[] of wallet public keys
    amountPerWallet,    // amount per wallet (SOL or USDC)
    asset = 'SOL',      // 'SOL' | 'USDC'
    hops = 4,           // number of intermediate hops
    delayMin = 30,      // min delay between hops (seconds)
    delayMax = 120,     // max delay between hops (seconds)
    amountNoise = 0.05, // 5% noise
    network = 'devnet',
  } = body;

  if (!privateKey || !destinations?.length || !amountPerWallet) {
    return new Response(
      JSON.stringify({ type: 'error', message: 'Missing required fields' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      // Declare outside try so it's accessible in catch for recovery
      let intermediateKeys: { publicKey: string; privateKey: string; level: number }[] = [];

      try {
        const connection = getConnection(network);
        const creator = keypairFromPrivateKey(privateKey);
        const usdcMint = network === 'devnet' ? USDC_DEVNET_MINT : USDC_MINT;

        // Build the mesh
        const levels = buildMesh(destinations, amountPerWallet, hops, amountNoise, asset);
        for (const level of levels) {
          for (const node of level) {
            if (node.keypair && !node.isDestination) {
              intermediateKeys.push({
                publicKey: node.publicKey,
                privateKey: keypairToPrivateKey(node.keypair),
                level: node.level,
              });
            }
          }
        }

        // Count total edges
        let totalEdges = levels[0].length; // creator → level 0
        for (const level of levels) {
          for (const node of level) {
            totalEdges += node.sends.length;
          }
        }

        // Count merges for stats
        let mergeCount = 0;
        for (let l = 1; l <= hops; l++) {
          for (const child of levels[l]) {
            let parentCount = 0;
            for (const parent of levels[l - 1]) {
              if (parent.sends.some(s => s.to === child)) parentCount++;
            }
            if (parentCount > 1) mergeCount++;
          }
        }

        // Calculate total SOL needed from creator
        let totalSolNeeded = 0;
        let totalUsdcNeeded = 0;
        for (const node of levels[0]) {
          if (asset === 'SOL') {
            totalSolNeeded += node.receivedAmount;
          } else {
            totalSolNeeded += node.receivedSol + ATA_RENT_SOL; // + ATA rent creator pays
            totalUsdcNeeded += node.receivedAmount;
          }
          totalSolNeeded += TX_FEE_SOL; // creator tx fee per Level 0 node
        }

        // Pre-flight balance check
        const creatorBalance = await connection.getBalance(creator.publicKey);
        const creatorSol = creatorBalance / LAMPORTS_PER_SOL;
        if (creatorSol < totalSolNeeded) {
          send({
            type: 'error',
            message: `Insufficient SOL. Creator has ${creatorSol.toFixed(4)} SOL but needs ~${totalSolNeeded.toFixed(4)} SOL for gas/ATA rent across ${hops} hops. Add ${(totalSolNeeded - creatorSol + 0.01).toFixed(4)} SOL.`,
            intermediateKeys,
          });
          controller.close();
          return;
        }

        send({
          type: 'plan',
          totalHops: totalEdges,
          totalIntermediates: intermediateKeys.length,
          mergePoints: mergeCount,
          levels: levels.map((lvl, i) => ({ level: i, nodes: lvl.length })),
          estimatedMinutes: Math.round((totalEdges * (delayMin + delayMax) / 2) / 60),
          totalSolNeeded: Math.ceil(totalSolNeeded * 10000) / 10000,
          totalUsdcNeeded: asset === 'USDC' ? Math.ceil(totalUsdcNeeded * 100) / 100 : undefined,
          intermediateKeys,
        });

        let hopsDone = 0;

        // ═══ Phase 1: Creator → Level 0 ═══
        for (const node of levels[0]) {
          try {
            const tx = new Transaction();

            if (asset === 'SOL') {
              // receivedAmount already includes overhead (tx fees + buffer) from buildMesh
              tx.add(SystemProgram.transfer({
                fromPubkey: creator.publicKey,
                toPubkey: node.keypair!.publicKey,
                lamports: Math.ceil(node.receivedAmount * LAMPORTS_PER_SOL),
              }));
            } else {
              // SOL for gas — receivedSol already includes all overhead from buildMesh
              tx.add(SystemProgram.transfer({
                fromPubkey: creator.publicKey,
                toPubkey: node.keypair!.publicKey,
                lamports: Math.ceil(node.receivedSol * LAMPORTS_PER_SOL),
              }));

              // Create child's USDC ATA + transfer USDC
              const childAta = getAssociatedTokenAddressSync(usdcMint, node.keypair!.publicKey, false, TOKEN_PROGRAM_ID);
              tx.add(createAssociatedTokenAccountIdempotentInstruction(
                creator.publicKey, childAta, node.keypair!.publicKey, usdcMint, TOKEN_PROGRAM_ID
              ));

              const creatorAta = getAssociatedTokenAddressSync(usdcMint, creator.publicKey, false, TOKEN_PROGRAM_ID);
              const usdcRaw = Math.ceil(node.receivedAmount * 10 ** USDC_DECIMALS);
              tx.add(createTransferCheckedInstruction(
                creatorAta, usdcMint, childAta, creator.publicKey, usdcRaw, USDC_DECIMALS, [], TOKEN_PROGRAM_ID
              ));
            }

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            tx.recentBlockhash = blockhash;
            tx.lastValidBlockHeight = lastValidBlockHeight;
            tx.feePayer = creator.publicKey;

            const sig = await sendAndConfirmTransaction(connection, tx, [creator], { commitment: 'confirmed' });
            hopsDone++;

            send({
              type: 'hop',
              level: -1,
              hopsDone,
              totalHops: totalEdges,
              from: creator.publicKey.toBase58().slice(0, 8),
              to: node.publicKey.slice(0, 8),
              amount: node.receivedAmount,
              asset,
              signature: sig,
            });
          } catch (err) {
            send({ type: 'hop_error', level: -1, to: node.publicKey.slice(0, 8), error: extractError(err) });
          }

          // Random delay
          const delaySec = rand(delayMin, delayMax);
          send({ type: 'delay', seconds: Math.round(delaySec) });
          await sleep(delaySec * 1000);
        }

        // ═══ Phase 2: Level-by-level mesh transfers ═══
        for (let lvlIdx = 0; lvlIdx < levels.length; lvlIdx++) {
          const level = levels[lvlIdx];

          // Shuffle send order within this level for randomness
          const shuffledNodes = [...level].sort(() => Math.random() - 0.5);

          for (const parent of shuffledNodes) {
            if (!parent.keypair || parent.isDestination) continue;

            // Shuffle the edges too
            const shuffledEdges = [...parent.sends].sort(() => Math.random() - 0.5);
            let edgeIdx = 0;

            for (const edge of shuffledEdges) {
              edgeIdx++;
              const isLastEdge = edgeIdx === shuffledEdges.length;
              const child = edge.to;
              try {
                const tx = new Transaction();
                const childPk = new PublicKey(child.publicKey);

                if (asset === 'SOL') {
                  if (isLastEdge) {
                    // Last edge: drain all remaining SOL (SOL is gas, excess is fine)
                    const balance = await connection.getBalance(parent.keypair!.publicKey);
                    const amount = balance - 5000;
                    if (amount <= 0) throw new Error('Insufficient balance for last edge');
                    tx.add(SystemProgram.transfer({
                      fromPubkey: parent.keypair!.publicKey,
                      toPubkey: childPk,
                      lamports: amount,
                    }));
                  } else {
                    // edge.amount already includes child's overhead from buildMesh
                    tx.add(SystemProgram.transfer({
                      fromPubkey: parent.keypair!.publicKey,
                      toPubkey: childPk,
                      lamports: Math.ceil(edge.amount * LAMPORTS_PER_SOL),
                    }));
                  }
                } else {
                  // USDC mode
                  const childAta = getAssociatedTokenAddressSync(usdcMint, childPk, false, TOKEN_PROGRAM_ID);
                  const parentAta = getAssociatedTokenAddressSync(usdcMint, parent.keypair!.publicKey, false, TOKEN_PROGRAM_ID);

                  // Create child's ATA
                  tx.add(createAssociatedTokenAccountIdempotentInstruction(
                    parent.keypair!.publicKey, childAta, childPk, usdcMint, TOKEN_PROGRAM_ID
                  ));

                  // Always send planned amount (prevents excess cascading)
                  const ataInfo = await getAccount(connection, parentAta, 'confirmed', TOKEN_PROGRAM_ID);
                  const ataBalance = Number(ataInfo.amount);
                  const planned = Math.ceil(edge.amount * 10 ** USDC_DECIMALS);
                  // Send min(planned, actual balance) to handle rounding shortfall
                  const toSend = Math.min(planned, ataBalance);
                  if (toSend > 0) {
                    tx.add(createTransferCheckedInstruction(
                      parentAta, usdcMint, childAta, parent.keypair!.publicKey, BigInt(toSend), USDC_DECIMALS, [], TOKEN_PROGRAM_ID
                    ));
                  }

                  // SOL for gas (edge.sol includes child's overhead from buildMesh)
                  if (edge.sol > 0) {
                    tx.add(SystemProgram.transfer({
                      fromPubkey: parent.keypair!.publicKey,
                      toPubkey: childPk,
                      lamports: Math.ceil(edge.sol * LAMPORTS_PER_SOL),
                    }));
                  }
                }

                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                tx.recentBlockhash = blockhash;
                tx.lastValidBlockHeight = lastValidBlockHeight;
                tx.feePayer = parent.keypair!.publicKey;

                const sig = await sendAndConfirmTransaction(
                  connection, tx, [parent.keypair!], { commitment: 'confirmed' }
                );
                hopsDone++;

                send({
                  type: 'hop',
                  level: lvlIdx,
                  hopsDone,
                  totalHops: totalEdges,
                  from: parent.publicKey.slice(0, 8),
                  to: child.publicKey.slice(0, 8),
                  amount: edge.amount,
                  asset,
                  destination: child.isDestination,
                  merge: child.isDestination ? false : undefined,
                  signature: sig,
                });
              } catch (err) {
                send({
                  type: 'hop_error',
                  level: lvlIdx,
                  from: parent.publicKey.slice(0, 8),
                  to: child.publicKey.slice(0, 8),
                  error: extractError(err),
                });
              }

              // Random delay between each send
              const delaySec = rand(delayMin, delayMax);
              send({ type: 'delay', seconds: Math.round(delaySec) });
              await sleep(delaySec * 1000);
            }

            // After all edges done: close USDC ATA (drain dust) + drain remaining SOL
            if (asset === 'USDC' && parent.keypair && shuffledEdges.length > 0) {
              const lastChild = shuffledEdges[shuffledEdges.length - 1].to;
              const lastChildPk = new PublicKey(lastChild.publicKey);
              try {
                const parentAta = getAssociatedTokenAddressSync(usdcMint, parent.keypair!.publicKey, false, TOKEN_PROGRAM_ID);
                const closeTx = new Transaction();

                // Check if ATA has dust USDC left, send to last child's ATA
                try {
                  const ataInfo = await getAccount(connection, parentAta, 'confirmed', TOKEN_PROGRAM_ID);
                  const dust = Number(ataInfo.amount);
                  if (dust > 0) {
                    const lastChildAta = getAssociatedTokenAddressSync(usdcMint, lastChildPk, false, TOKEN_PROGRAM_ID);
                    closeTx.add(createTransferCheckedInstruction(
                      parentAta, usdcMint, lastChildAta, parent.keypair!.publicKey, BigInt(dust), USDC_DECIMALS, [], TOKEN_PROGRAM_ID
                    ));
                  }
                  // Close ATA to recover rent
                  closeTx.add(createCloseAccountInstruction(
                    parentAta, parent.keypair!.publicKey, parent.keypair!.publicKey, [], TOKEN_PROGRAM_ID
                  ));

                  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                  closeTx.recentBlockhash = blockhash;
                  closeTx.lastValidBlockHeight = lastValidBlockHeight;
                  closeTx.feePayer = parent.keypair!.publicKey;
                  await sendAndConfirmTransaction(connection, closeTx, [parent.keypair!], { commitment: 'confirmed' });
                } catch { /* ATA already closed or empty */ }

                // Drain remaining SOL to last child
                const balance = await connection.getBalance(parent.keypair!.publicKey);
                const drainAmount = balance - 5000;
                if (drainAmount > 5000) {
                  const drainTx = new Transaction();
                  drainTx.add(SystemProgram.transfer({
                    fromPubkey: parent.keypair!.publicKey,
                    toPubkey: lastChildPk,
                    lamports: drainAmount,
                  }));
                  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                  drainTx.recentBlockhash = blockhash;
                  drainTx.lastValidBlockHeight = lastValidBlockHeight;
                  drainTx.feePayer = parent.keypair!.publicKey;
                  await sendAndConfirmTransaction(connection, drainTx, [parent.keypair!], { commitment: 'confirmed' });
                }
              } catch { /* dust left, acceptable */ }
            }
          }
        }

        send({
          type: 'done',
          hopsDone,
          totalHops: totalEdges,
          intermediateKeys,
        });
      } catch (err) {
        send({ type: 'error', message: extractError(err), intermediateKeys });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
