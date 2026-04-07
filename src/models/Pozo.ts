// ============================================================
// RT NEXT — Model: Pozo
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IPozo extends Document {
  numero: string;
  bateria: string;
  zona: 'Este' | 'Centro' | 'Oeste';
  grupo: 'Basica' | 'Swab';
  sistema: 'PUE' | 'PUG' | 'PL' | 'GL' | 'TBG' | 'CSG';
  categoria: 'A' | 'B' | 'C';
  potencialCrudo: number;
  potencialAgua: number;
  potencialGas: number;
  carrera: number;
  formacion: string;
  activo: boolean;
}

const PozoSchema = new Schema<IPozo>({
  numero: { type: String, required: true, unique: true },
  bateria: { type: String, required: true },
  zona: {
    type: String,
    enum: ['Este', 'Centro', 'Oeste'],
  },
  grupo: {
    type: String,
    enum: ['Basica', 'Swab'],
  },
  sistema: {
    type: String,
    enum: ['PUE', 'PUG', 'PL', 'GL', 'TBG', 'CSG'],
  },
  categoria: {
    type: String,
    enum: ['A', 'B', 'C'],
  },
  potencialCrudo: { type: Number },
  potencialAgua: { type: Number },
  potencialGas: { type: Number },
  carrera: { type: Number, default: 64 },
  formacion: { type: String },
  activo: { type: Boolean, default: true },
});

const Pozo = mongoose.models.Pozo || mongoose.model<IPozo>('Pozo', PozoSchema);
export default Pozo;
