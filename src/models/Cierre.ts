// ============================================================
// RT NEXT — Model: Cierre (main operational document)
// ============================================================

import mongoose, { Schema, Document, Types } from 'mongoose';

// --- Subdocument interfaces ---

export interface ILectura {
  pozoId: string;
  crudoBls: number;
  aguaBls: number;
  presionTubos: number;
  presionForros: number;
  gpm: number;
  carrera: number;
  timerOn: number;
  timerOff: number;
  estadoPozo: 'BOMBEANDO' | 'PARADO';
  codigoDiferida: string | null;
  comentarioDiferida: string;
  comentarios: string;
  fotos: string[];
  horaRegistro: Date;
  gpsLat: number;
  gpsLng: number;
}

export interface ITanqueCierre {
  nombre: string;
  producto: string;
  medidaAnterior: number;
  medidaActual: number;
  aguaLibre: number;
}

export interface IBombeo {
  volumen: number;
  horaInicio: string;
  horaFin: string;
  destino: string;
  producto: 'PETROLEO' | 'AGUA';
}

export interface ICierre extends Document {
  fecha: Date;
  turno: 'DIA' | 'NOCHE';
  bateriaId: string;
  operadorId: Types.ObjectId;
  estado: 'EN_PROGRESO' | 'COMPLETO' | 'ENVIADO' | 'APROBADO' | 'RECHAZADO';

  lecturas: ILectura[];
  tanques: ITanqueCierre[];
  bombeos: IBombeo[];

  presionCierre: number;
  novedades: string;

  // Calculated totals
  totalCrudo: number;
  totalAgua: number;
  totalDiferida: number;
  pozosRegistrados: number;
  pozosBombeando: number;
  pozosParados: number;
  totalPozos: number;
  potencialTotal: number;
  kpiProduccion: number;

  // Workflow
  enviadoEn: Date;
  aprobadoPor: Types.ObjectId;
  aprobadoEn: Date;
  comentarioRechazo: string;

  createdAt: Date;
  updatedAt: Date;
}

// --- Subdocument schemas ---

const LecturaSchema = new Schema<ILectura>(
  {
    pozoId: { type: String },
    crudoBls: { type: Number },
    aguaBls: { type: Number },
    presionTubos: { type: Number },
    presionForros: { type: Number },
    gpm: { type: Number },
    carrera: { type: Number },
    timerOn: { type: Number },
    timerOff: { type: Number },
    estadoPozo: {
      type: String,
      enum: ['BOMBEANDO', 'PARADO'],
    },
    codigoDiferida: { type: String, default: null },
    comentarioDiferida: { type: String },
    comentarios: { type: String },
    fotos: [{ type: String }],
    horaRegistro: { type: Date },
    gpsLat: { type: Number },
    gpsLng: { type: Number },
  },
  { _id: true }
);

const TanqueCierreSchema = new Schema<ITanqueCierre>(
  {
    nombre: { type: String },
    producto: { type: String },
    medidaAnterior: { type: Number },
    medidaActual: { type: Number },
    aguaLibre: { type: Number },
  },
  { _id: false }
);

const BombeoSchema = new Schema<IBombeo>(
  {
    volumen: { type: Number },
    horaInicio: { type: String },
    horaFin: { type: String },
    destino: { type: String },
    producto: {
      type: String,
      enum: ['PETROLEO', 'AGUA'],
    },
  },
  { _id: false }
);

// --- Main schema ---

const CierreSchema = new Schema<ICierre>(
  {
    fecha: { type: Date, required: true },
    turno: {
      type: String,
      required: true,
      enum: ['DIA', 'NOCHE'],
    },
    bateriaId: { type: String, required: true },
    operadorId: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    estado: {
      type: String,
      enum: ['EN_PROGRESO', 'COMPLETO', 'ENVIADO', 'APROBADO', 'RECHAZADO'],
      default: 'EN_PROGRESO',
    },

    lecturas: [LecturaSchema],
    tanques: [TanqueCierreSchema],
    bombeos: [BombeoSchema],

    presionCierre: { type: Number },
    novedades: { type: String },

    // Calculated totals
    totalCrudo: { type: Number, default: 0 },
    totalAgua: { type: Number, default: 0 },
    totalDiferida: { type: Number, default: 0 },
    pozosRegistrados: { type: Number, default: 0 },
    pozosBombeando: { type: Number, default: 0 },
    pozosParados: { type: Number, default: 0 },
    totalPozos: { type: Number, default: 0 },
    potencialTotal: { type: Number, default: 0 },
    kpiProduccion: { type: Number, default: 0 },

    // Workflow
    enviadoEn: { type: Date },
    aprobadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    aprobadoEn: { type: Date },
    comentarioRechazo: { type: String },
  },
  { timestamps: true }
);

const Cierre = mongoose.models.Cierre || mongoose.model<ICierre>('Cierre', CierreSchema);
export default Cierre;
