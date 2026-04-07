// ============================================================
// RT NEXT — GET /api/usuarios
// Returns all active users (nombre, rol, turno) for login dropdown.
// PIN and baterias are excluded for privacy.
// ============================================================

import { dbConnect } from '@/lib/mongodb';
import Usuario from '@/models/Usuario';

export async function GET() {
  try {
    await dbConnect();

    const users = await Usuario.find({ activo: true })
      .select('nombre rol turno')
      .lean();

    const result = users.map((u: any) => ({
      _id: u._id.toString(),
      nombre: u.nombre,
      rol: u.rol,
      turno: u.turno,
    }));

    return Response.json(result);
  } catch (error) {
    console.error('Error fetching usuarios:', error);
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
