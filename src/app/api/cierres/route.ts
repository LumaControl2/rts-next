// ============================================================
// RT NEXT — GET & POST /api/cierres
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';
import Pozo from '@/models/Pozo';
import '@/models/Usuario'; // Required for populate('operadorId')

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const fecha = searchParams.get('fecha');
    const bateria = searchParams.get('bateria');
    const operador = searchParams.get('operador');
    const estado = searchParams.get('estado');

    const filter: Record<string, unknown> = {};

    if (fecha) {
      const start = new Date(fecha);
      const end = new Date(fecha);
      end.setDate(end.getDate() + 1);
      filter.fecha = { $gte: start, $lt: end };
    }
    if (bateria) {
      filter.bateriaId = bateria;
    }
    if (operador) {
      filter.operadorId = operador;
    }
    if (estado) {
      filter.estado = estado;
    }

    const cierres = await Cierre.find(filter)
      .populate('operadorId', 'nombre')
      .sort({ fecha: -1, createdAt: -1 });

    return Response.json({ data: cierres });
  } catch (error) {
    console.error('Cierres GET error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const auth = await getUserFromRequest(request);
    if (!auth) {
      return Response.json(
        { error: 'Token inválido o no proporcionado' },
        { status: 401 }
      );
    }

    const { bateriaId, turno } = await request.json();

    if (!bateriaId || !turno) {
      return Response.json(
        { error: 'bateriaId y turno son requeridos' },
        { status: 400 }
      );
    }

    // Look up total pozos and potencial from Pozo model
    const pozos = await Pozo.find({ bateria: bateriaId, activo: true });
    const totalPozos = pozos.length;
    const potencialTotal = pozos.reduce(
      (sum, p) => sum + (p.potencialCrudo || 0),
      0
    );

    const cierre = await Cierre.create({
      fecha: new Date(),
      turno,
      bateriaId,
      operadorId: auth.userId,
      estado: 'EN_PROGRESO',
      totalPozos,
      potencialTotal,
    });

    const populated = await Cierre.findById(cierre._id).populate(
      'operadorId',
      'nombre'
    );

    return Response.json({ data: populated }, { status: 201 });
  } catch (error) {
    console.error('Cierres POST error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
