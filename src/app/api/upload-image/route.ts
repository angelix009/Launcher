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

    // Validate file size (max 20MB for catbox)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large. Max 20MB.' },
        { status: 400 }
      );
    }

    // Upload to catbox.moe
    const catboxForm = new FormData();
    catboxForm.append('reqtype', 'fileupload');
    catboxForm.append('fileToUpload', file);

    const res = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: catboxForm,
    });

    if (!res.ok) {
      throw new Error(`Catbox upload failed: ${res.status} ${res.statusText}`);
    }

    const url = await res.text();

    if (!url.startsWith('https://')) {
      throw new Error(`Unexpected catbox response: ${url.slice(0, 100)}`);
    }

    return NextResponse.json({ success: true, data: { url: url.trim() } });
  } catch (err) {
    console.error('Image upload error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
