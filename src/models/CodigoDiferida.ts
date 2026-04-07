// ============================================================
// RT NEXT — Model: CodigoDiferida
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ICodigoDiferida extends Document {
  codigo: string;
  descripcion: string;
  area: 'Mantenimiento' | 'Ingenieria' | 'Produccion' | 'No Operativa';
  subarea: string;
  activo: boolean;
}

const CodigoDiferidaSchema = new Schema<ICodigoDiferida>({
  codigo: { type: String, required: true, unique: true },
  descripcion: { type: String },
  area: {
    type: String,
    enum: ['Mantenimiento', 'Ingenieria', 'Produccion', 'No Operativa'],
  },
  subarea: { type: String },
  activo: { type: Boolean, default: true },
});

const CodigoDiferida =
  mongoose.models.CodigoDiferida || mongoose.model<ICodigoDiferida>('CodigoDiferida', CodigoDiferidaSchema);
export default CodigoDiferida;
