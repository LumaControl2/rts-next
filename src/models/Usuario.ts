// ============================================================
// RT NEXT — Model: Usuario
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IUsuario extends Document {
  nombre: string;
  pin: string;
  rol: 'operador' | 'supervisor_contratista' | 'supervisor_cliente' | 'admin';
  baterias: string[];
  turno: 'DIA' | 'NOCHE';
  activo: boolean;
}

const UsuarioSchema = new Schema<IUsuario>({
  nombre: { type: String, required: true },
  pin: { type: String, required: true },
  rol: {
    type: String,
    required: true,
    enum: ['operador', 'supervisor_contratista', 'supervisor_cliente', 'admin'],
  },
  baterias: [{ type: String }],
  turno: {
    type: String,
    enum: ['DIA', 'NOCHE'],
  },
  activo: { type: Boolean, default: true },
});

const Usuario = mongoose.models.Usuario || mongoose.model<IUsuario>('Usuario', UsuarioSchema);
export default Usuario;
