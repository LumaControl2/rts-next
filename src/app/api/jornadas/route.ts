// ============================================================
// RT NEXT — GET & POST /api/jornadas
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Jornada from '@/models/Jornada';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const fecha = searchParams.get('fecha');
    const operador = searchParams.get('operador');

    const filter: Record<string, unknown> = {};

    if (fecha) {
      const start = new Date(fecha);
      const end = new Date(fecha);
      end.setDate(end.getDate() + 1);
      filter.fecha = { $gte: start, $lt: end };
    }
    if (operador) {
      filter.operadorId = operador;
    }

    const jornadas = await Jornada.find(filter)
      .populate('operadorId', 'nombre')
      .sort({ fecha: -1, createdAt: -1 });

    return Response.json({ data: jornadas });
  } catch (error) {
    console.error('Jornadas GET error:', error);
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

    const { turno, vehiculo } = await request.json();

    if (!turno) {
      return Response.json(
        { error: 'turno es requerido' },
        { status: 400 }
      );
    }

    const jornada = await Jornada.create({
      fecha: new Date(),
      operadorId: auth.userId,
      turno,
      estado: 'ACTIVA',
      vehiculo: vehiculo || {},
      actividades: [],
      resumen: {
        kmRecorridos: 0,
        totalActividades: 0,
        pozosVisitados: 0,
        bateriasCerradas: 0,
        tiempoTotal: 0,
        fotosTomadas: 0,
      },
    });

    const populated = await Jornada.findById(jornada._id).populate(
      'operadorId',
      'nombre'
    );

    return Response.json({ data: populated }, { status: 201 });
  } catch (error) {
    console.error('Jornadas POST error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
