// ============================================================
// RT NEXT — GET /api/pozos
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import Pozo from '@/models/Pozo';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const bateria = searchParams.get('bateria');

    const filter: Record<string, unknown> = { activo: true };
    if (bateria) {
      filter.bateria = bateria;
    }

    const pozos = await Pozo.find(filter).sort({ numero: 1 });

    return Response.json({ data: pozos });
  } catch (error) {
    console.error('Pozos GET error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
