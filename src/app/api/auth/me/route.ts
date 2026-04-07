// ============================================================
// RT NEXT — GET /api/auth/me
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Usuario from '@/models/Usuario';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const auth = await getUserFromRequest(request);

    if (!auth) {
      return Response.json(
        { error: 'Token inválido o no proporcionado' },
        { status: 401 }
      );
    }

    const user = await Usuario.findById(auth.userId).select('-pin');

    if (!user) {
      return Response.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    return Response.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        rol: user.rol,
        baterias: user.baterias,
        turno: user.turno,
        activo: user.activo,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
