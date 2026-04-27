import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Use PNG, JPG, WebP, SVG or GIF.' },
        { status: 400 }
      );
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large. Max 20MB.' },
        { status: 400 }
      );
    }

    // Upload to Pinata/IPFS
    const pinataForm = new FormData();
    pinataForm.append('file', file);

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: pinataForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinata upload failed: ${res.status} ${errText}`);
    }

    const { IpfsHash } = await res.json();
    const gateway = process.env.PINATA_GATEWAY || 'goal.mypinata.cloud';
    const url = `https://${gateway}/ipfs/${IpfsHash}`;

    return NextResponse.json({ success: true, data: { url } });
  } catch (err) {
    console.error('Image upload error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
