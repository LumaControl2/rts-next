// ============================================================
// RT NEXT — GET & PUT /api/cierres/[id]
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;

    const cierre = await Cierre.findById(id)
      .populate('operadorId', 'nombre')
      .populate('aprobadoPor', 'nombre');

    if (!cierre) {
      return Response.json(
        { error: 'Cierre no encontrado' },
        { status: 404 }
      );
    }

    return Response.json({ data: cierre });
  } catch (error) {
    console.error('Cierre GET error:', error);
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

    const cierre = await Cierre.findById(id);

    if (!cierre) {
      return Response.json(
        { error: 'Cierre no encontrado' },
        { status: 404 }
      );
    }

    // Handle estado transitions
    if (body.estado) {
      if (body.estado === 'ENVIADO') {
        body.enviadoEn = new Date();
      }
      if (body.estado === 'APROBADO') {
        body.aprobadoPor = auth.userId;
        body.aprobadoEn = new Date();
      }
    }

    // Update allowed fields
    const allowedFields = [
      'tanques',
      'bombeos',
      'presionCierre',
      'novedades',
      'estado',
      'enviadoEn',
      'aprobadoPor',
      'aprobadoEn',
      'comentarioRechazo',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        (cierre as any)[field] = body[field];
      }
    }

    await cierre.save();

    const updated = await Cierre.findById(id)
      .populate('operadorId', 'nombre')
      .populate('aprobadoPor', 'nombre');

    return Response.json({ data: updated });
  } catch (error) {
    console.error('Cierre PUT error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
