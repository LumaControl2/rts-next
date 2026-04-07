// ============================================================
// RT NEXT — GET & PUT /api/jornadas/[id]
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Jornada from '@/models/Jornada';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;

    const jornada = await Jornada.findById(id)
      .populate('operadorId', 'nombre');

    if (!jornada) {
      return Response.json(
        { error: 'Jornada no encontrada' },
        { status: 404 }
      );
    }

    return Response.json({ data: jornada });
  } catch (error) {
    console.error('Jornada GET error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const auth = await getUserFromRequest(request);
    if (!auth) {
      return Response.json(
        { error: 'Token inválido o no proporcionado' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const jornada = await Jornada.findById(id);
    if (!jornada) {
      return Response.json(
        { error: 'Jornada no encontrada' },
        { status: 404 }
      );
    }

    // Update allowed fields
    const allowedFields = [
      'estado',
      'vehiculo',
      'actividades',
      'resumen',
      'horaSalida',
      'horaLlegada',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        (jornada as any)[field] = body[field];
      }
    }

    await jornada.save();

    const updated = await Jornada.findById(id)
      .populate('operadorId', 'nombre');

    return Response.json({ data: updated });
  } catch (error) {
    console.error('Jornada PUT error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
