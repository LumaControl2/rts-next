// ============================================================
// RT NEXT — POST /api/auth/login
// ============================================================

import { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { generateToken, comparePin } from '@/lib/auth';
import Usuario from '@/models/Usuario';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { nombre, pin } = await request.json();

    if (!nombre || !pin) {
      return Response.json(
        { error: 'Nombre y PIN son requeridos' },
        { status: 400 }
      );
    }

    const user = await Usuario.findOne({ nombre, activo: true });

    if (!user) {
      return Response.json(
        { error: 'Usuario no encontrado' },
        { status: 401 }
      );
    }

    const pinValid = await comparePin(pin, user.pin);

    if (!pinValid) {
      return Response.json(
        { error: 'PIN incorrecto' },
        { status: 401 }
      );
    }

    const token = generateToken(user._id.toString());

    return Response.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        rol: user.rol,
        baterias: user.baterias,
        turno: user.turno,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
