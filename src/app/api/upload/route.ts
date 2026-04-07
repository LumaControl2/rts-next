// ============================================================
// RT NEXT — POST /api/upload
// ============================================================

import { NextRequest } from 'next/server';
import cloudinary from '@/lib/cloudinary';

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image) {
      return Response.json(
        { error: 'image (base64) es requerido' },
        { status: 400 }
      );
    }

    const result = await cloudinary.uploader.upload(image, {
      folder: 'rtsnext',
      transformation: { width: 1024, quality: 'auto' },
      resource_type: 'image',
    });

    return Response.json({
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json(
      { error: 'Error al subir imagen' },
      { status: 500 }
    );
  }
}
