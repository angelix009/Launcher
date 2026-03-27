import { NextResponse } from 'next/server';
import { generateWallets } from '@/lib/wallets';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { count } = body;

    if (!count || typeof count !== 'number' || count < 1) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid required field: count (must be a positive number)' },
        { status: 400 }
      );
    }

    const wallets = generateWallets(count);

    return NextResponse.json({ success: true, data: wallets });
  } catch (err) {
    console.error('Generate wallets error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
