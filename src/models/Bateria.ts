// ============================================================
// RT NEXT — Model: Bateria
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ITanqueBateria {
  nombre: string;
  producto: 'PETROLEO' | 'AGUA';
  capacidad?: number;
}

export interface IBateria extends Document {
  codigo: string;
  nombre: string;
  zona: 'Este' | 'Centro' | 'Oeste';
  tanques: ITanqueBateria[];
  activa: boolean;
}

const TanqueBateriaSchema = new Schema<ITanqueBateria>(
  {
    nombre: { type: String },
    producto: {
      type: String,
      enum: ['PETROLEO', 'AGUA'],
    },
    capacidad: { type: Number },
  },
  { _id: false }
);

const BateriaSchema = new Schema<IBateria>({
  codigo: { type: String, required: true, unique: true },
  nombre: { type: String },
  zona: {
    type: String,
    enum: ['Este', 'Centro', 'Oeste'],
  },
  tanques: [TanqueBateriaSchema],
  activa: { type: Boolean, default: true },
});

const Bateria = mongoose.models.Bateria || mongoose.model<IBateria>('Bateria', BateriaSchema);
export default Bateria;
