// ============================================================
// RT NEXT — Model: Jornada
// ============================================================

import mongoose, { Schema, Document, Types } from 'mongoose';

// --- Subdocument interfaces ---

export interface IVehiculo {
  placa: string;
  kmInicio: number;
  kmFin: number;
  fotoOdometroInicio: string;
  fotoOdometroFin: string;
}

export interface IActividad {
  tipo:
    | 'CIERRE_BATERIA'
    | 'CIERRE_PARCIAL'
    | 'INSPECCION'
    | 'TOMA_PARAMETROS'
    | 'VERIFICACION_PARADO'
    | 'MANTENIMIENTO_PREVENTIVO'
    | 'NOVEDAD_INCIDENTE'
    | 'MUESTREO'
    | 'OTRO';
  ubicacionTipo: 'BATERIA' | 'POZO' | 'ESTACION' | 'OTRO';
  ubicacionId: string;
  descripcion: string;
  horaLlegada: Date;
  horaSalida: Date;
  fotos: string[];
  cierreId: Types.ObjectId;
  gpsLat: number;
  gpsLng: number;
}

export interface IResumen {
  kmRecorridos: number;
  totalActividades: number;
  pozosVisitados: number;
  bateriasCerradas: number;
  tiempoTotal: number;
  fotosTomadas: number;
}

export interface IJornada extends Document {
  fecha: Date;
  operadorId: Types.ObjectId;
  turno: 'DIA' | 'NOCHE';
  estado: 'ACTIVA' | 'CERRADA';
  vehiculo: IVehiculo;
  actividades: IActividad[];
  resumen: IResumen;
  horaSalida: Date;
  horaLlegada: Date;
  createdAt: Date;
  updatedAt: Date;
}

// --- Subdocument schemas ---

const VehiculoSchema = new Schema<IVehiculo>(
  {
    placa: { type: String },
    kmInicio: { type: Number },
    kmFin: { type: Number },
    fotoOdometroInicio: { type: String },
    fotoOdometroFin: { type: String },
  },
  { _id: false }
);

const ActividadSchema = new Schema<IActividad>(
  {
    tipo: {
      type: String,
      enum: [
        'CIERRE_BATERIA',
        'CIERRE_PARCIAL',
        'INSPECCION',
        'TOMA_PARAMETROS',
        'VERIFICACION_PARADO',
        'MANTENIMIENTO_PREVENTIVO',
        'NOVEDAD_INCIDENTE',
        'MUESTREO',
        'OTRO',
      ],
    },
    ubicacionTipo: {
      type: String,
      enum: ['BATERIA', 'POZO', 'ESTACION', 'OTRO'],
    },
    ubicacionId: { type: String },
    descripcion: { type: String },
    horaLlegada: { type: Date },
    horaSalida: { type: Date },
    fotos: [{ type: String }],
    cierreId: { type: Schema.Types.ObjectId, ref: 'Cierre' },
    gpsLat: { type: Number },
    gpsLng: { type: Number },
  },
  { _id: true }
);

const ResumenSchema = new Schema<IResumen>(
  {
    kmRecorridos: { type: Number },
    totalActividades: { type: Number },
    pozosVisitados: { type: Number },
    bateriasCerradas: { type: Number },
    tiempoTotal: { type: Number },
    fotosTomadas: { type: Number },
  },
  { _id: false }
);

// --- Main schema ---

const JornadaSchema = new Schema<IJornada>(
  {
    fecha: { type: Date },
    operadorId: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    turno: {
      type: String,
      enum: ['DIA', 'NOCHE'],
    },
    estado: {
      type: String,
      enum: ['ACTIVA', 'CERRADA'],
      default: 'ACTIVA',
    },
    vehiculo: VehiculoSchema,
    actividades: [ActividadSchema],
    resumen: ResumenSchema,
    horaSalida: { type: Date },
    horaLlegada: { type: Date },
  },
  { timestamps: true }
);

const Jornada = mongoose.models.Jornada || mongoose.model<IJornada>('Jornada', JornadaSchema);
export default Jornada;
