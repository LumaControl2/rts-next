// ============================================================
// RT NEXT — POST & DELETE /api/cierres/[id]/lecturas
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';
import Pozo from '@/models/Pozo';

/**
 * Recalculate cierre totals based on current lecturas.
 */
async function recalcularTotales(cierre: any) {
  const lecturas = cierre.lecturas || [];

  // Get pozoIds for all lecturas with estado PARADO
  const pozoIdsParados = lecturas
    .filter((l: any) => l.estadoPozo === 'PARADO')
    .map((l: any) => l.pozoId);

  // Look up potencial for parados
  let totalDiferida = 0;
  if (pozoIdsParados.length > 0) {
    const pozosParados = await Pozo.find({
      numero: { $in: pozoIdsParados },
    });
    totalDiferida = pozosParados.reduce(
      (sum: number, p: any) => sum + (p.potencialCrudo || 0),
      0
    );
  }

  cierre.totalCrudo = lecturas.reduce(
    (sum: number, l: any) => sum + (l.crudoBls || 0),
    0
  );
  cierre.totalAgua = lecturas.reduce(
    (sum: number, l: any) => sum + (l.aguaBls || 0),
    0
  );
  cierre.totalDiferida = totalDiferida;
  cierre.pozosRegistrados = lecturas.length;
  cierre.pozosBombeando = lecturas.filter(
    (l: any) => l.estadoPozo === 'BOMBEANDO'
  ).length;
  cierre.pozosParados = lecturas.filter(
    (l: any) => l.estadoPozo === 'PARADO'
  ).length;
  cierre.kpiProduccion =
    cierre.potencialTotal > 0
      ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 100 * 10) / 10
      : 0;
}

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

    const cierre = await Cierre.findById(id);
    if (!cierre) {
      return Response.json(
        { error: 'Cierre no encontrado' },
        { status: 404 }
      );
    }

    // Block modifications to approved/closed cierres
    if (cierre.estado === 'APROBADO' || cierre.estado === 'CERRADO') {
      return Response.json(
        { error: 'No se puede modificar un cierre aprobado' },
        { status: 403 }
      );
    }

    const { pozoId } = body;
    if (!pozoId) {
      return Response.json(
        { error: 'pozoId es requerido' },
        { status: 400 }
      );
    }

    // Check if lectura for this pozoId already exists
    const existingIndex = cierre.lecturas.findIndex(
      (l: any) => l.pozoId === pozoId
    );

    const lecturaData = {
      pozoId: body.pozoId,
      crudoBls: body.crudoBls ?? 0,
      aguaBls: body.aguaBls ?? 0,
      presionTubos: body.presionTubos ?? 0,
      presionForros: body.presionForros ?? 0,
      gpm: body.gpm ?? 0,
      carrera: body.carrera ?? 0,
      timerOn: body.timerOn ?? 0,
      timerOff: body.timerOff ?? 0,
      estadoPozo: body.estadoPozo ?? 'BOMBEANDO',
      codigoDiferida: body.codigoDiferida ?? null,
      comentarioDiferida: body.comentarioDiferida ?? '',
      comentarios: body.comentarios ?? '',
      fotos: body.fotos ?? [],
      horaRegistro: body.horaRegistro ?? new Date(),
      gpsLat: body.gpsLat ?? 0,
      gpsLng: body.gpsLng ?? 0,
    };

    if (existingIndex >= 0) {
      // Update existing lectura
      cierre.lecturas[existingIndex] = {
        ...cierre.lecturas[existingIndex],
        ...lecturaData,
      };
    } else {
      // Push new lectura
      cierre.lecturas.push(lecturaData);
    }

    // Recalculate totals
    await recalcularTotales(cierre);

    await cierre.save();

    const updated = await Cierre.findById(id)
      .populate('operadorId', 'nombre');

    return Response.json({ data: updated }, { status: existingIndex >= 0 ? 200 : 201 });
  } catch (error) {
    console.error('Lecturas POST error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const searchParams = request.nextUrl.searchParams;
    const pozoId = searchParams.get('pozoId');

    if (!pozoId) {
      return Response.json(
        { error: 'pozoId query param es requerido' },
        { status: 400 }
      );
    }

    const cierre = await Cierre.findById(id);
    if (!cierre) {
      return Response.json(
        { error: 'Cierre no encontrado' },
        { status: 404 }
      );
    }

    // Remove lectura by pozoId
    cierre.lecturas = cierre.lecturas.filter(
      (l: any) => l.pozoId !== pozoId
    );

    // Recalculate totals
    await recalcularTotales(cierre);

    await cierre.save();

    const updated = await Cierre.findById(id)
      .populate('operadorId', 'nombre');

    return Response.json({ data: updated });
  } catch (error) {
    console.error('Lecturas DELETE error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
