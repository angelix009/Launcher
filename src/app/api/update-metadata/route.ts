import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { createUpdateFieldInstruction } from '@solana/spl-token-metadata';
import bs58 from 'bs58';

const RPC_URLS: Record<string, string> = {
  'devnet': 'https://api.devnet.solana.com',
  'mainnet-beta': process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { privateKey, tokenMint, network, fields } = body as {
      privateKey: string;
      tokenMint: string;
      network: 'devnet' | 'mainnet-beta';
      fields: { name?: string; symbol?: string; uri?: string; description?: string };
    };

    if (!privateKey || !tokenMint || !fields) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const rpcUrl = RPC_URLS[network] || RPC_URLS['devnet'];
    const connection = new Connection(rpcUrl, 'confirmed');

    let keypair: Keypair;
    try {
      const decoded = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(decoded);
    } catch {
      try {
        const arr = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid private key format' },
          { status: 400 }
        );
      }
    }

    const mint = new PublicKey(tokenMint);
    const tx = new Transaction();
    let fieldCount = 0;

    // Update each field that was provided
    if (fields.name !== undefined && fields.name !== '') {
      tx.add(
        createUpdateFieldInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint,
          updateAuthority: keypair.publicKey,
          field: 'name',
          value: fields.name,
        })
      );
      fieldCount++;
    }

    if (fields.symbol !== undefined && fields.symbol !== '') {
      tx.add(
        createUpdateFieldInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint,
          updateAuthority: keypair.publicKey,
          field: 'symbol',
          value: fields.symbol,
        })
      );
      fieldCount++;
    }

    if (fields.uri !== undefined) {
      tx.add(
        createUpdateFieldInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint,
          updateAuthority: keypair.publicKey,
          field: 'uri',
          value: fields.uri,
        })
      );
      fieldCount++;
    }

    if (fields.description !== undefined) {
      tx.add(
        createUpdateFieldInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint,
          updateAuthority: keypair.publicKey,
          field: 'description',
          value: fields.description,
        })
      );
      fieldCount++;
    }

    if (fieldCount === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sig = await connection.sendTransaction(tx, [keypair], { skipPreflight: false });
    await connection.confirmTransaction(sig, 'confirmed');

    return NextResponse.json({
      success: true,
      data: { signature: sig, fieldsUpdated: fieldCount },
    });
  } catch (err) {
    console.error('Update metadata error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
