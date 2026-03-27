import { NextResponse } from 'next/server';
import { encryptData, decryptData } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { action, data } = await request.json();

    if (!action || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing action or data' },
        { status: 400 }
      );
    }

    if (action === 'encrypt') {
      const encrypted = encryptData(data);
      return NextResponse.json({ success: true, data: encrypted });
    }

    if (action === 'decrypt') {
      const decrypted = decryptData(data);
      return NextResponse.json({ success: true, data: decrypted });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "encrypt" or "decrypt".' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Crypto error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
