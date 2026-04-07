// ============================================================
// RT NEXT — POST /api/jornadas/[id]/actividades
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Jornada from '@/models/Jornada';

export async function POST(
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

    // Build actividad
    const actividad = {
      tipo: body.tipo,
      ubicacionTipo: body.ubicacionTipo,
      ubicacionId: body.ubicacionId ?? '',
      descripcion: body.descripcion ?? '',
      horaLlegada: body.horaLlegada ?? new Date(),
      fotos: body.fotos ?? [],
      cierreId: body.cierreId ?? undefined,
      gpsLat: body.gpsLat ?? 0,
      gpsLng: body.gpsLng ?? 0,
    };

    jornada.actividades.push(actividad);

    // Recalculate resumen
    const actividades = jornada.actividades;
    const totalFotos = actividades.reduce(
      (sum: number, a: any) => sum + (a.fotos?.length || 0),
      0
    );
    const pozosVisitados = new Set(
      actividades
        .filter((a: any) => a.ubicacionTipo === 'POZO')
        .map((a: any) => a.ubicacionId)
    ).size;
    const bateriasCerradas = actividades.filter(
      (a: any) => a.tipo === 'CIERRE_BATERIA'
    ).length;

    jornada.resumen = {
      kmRecorridos: jornada.resumen?.kmRecorridos ?? 0,
      totalActividades: actividades.length,
      pozosVisitados,
      bateriasCerradas,
      tiempoTotal: jornada.resumen?.tiempoTotal ?? 0,
      fotosTomadas: totalFotos,
    };

    await jornada.save();

    const updated = await Jornada.findById(id)
      .populate('operadorId', 'nombre');

    return Response.json({ data: updated }, { status: 201 });
  } catch (error) {
    console.error('Actividades POST error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
