// ============================================================
// RT NEXT — GET /api/baterias
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import Bateria from '@/models/Bateria';

export async function GET(_request: NextRequest) {
  try {
    await dbConnect();

    const baterias = await Bateria.find({ activa: true }).sort({ codigo: 1 });

    return Response.json({ data: baterias });
  } catch (error) {
    console.error('Baterias GET error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
