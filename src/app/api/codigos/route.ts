// ============================================================
// RT NEXT — GET /api/codigos
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import CodigoDiferida from '@/models/CodigoDiferida';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const area = searchParams.get('area');

    const filter: Record<string, unknown> = { activo: true };
    if (area) {
      filter.area = area;
    }

    const codigos = await CodigoDiferida.find(filter).sort({ codigo: 1 });

    return Response.json({ data: codigos });
  } catch (error) {
    console.error('Codigos GET error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
