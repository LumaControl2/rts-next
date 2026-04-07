// ============================================================
// RT NEXT — Lote I: Master Data (Datos Maestros)
// ============================================================

// --- Types ---

export interface Tanque {
  id: string;
  nombre: string;
  producto: 'PETROLEO' | 'AGUA' | 'GAS';
  capacidadBls: number;
}

export interface Pozo {
  id: string;
  nombre: string;
  bateriaId: string;
  sistema: 'PUE' | 'PUG' | 'PL' | 'GL';
  potencialBls: number;
  carrera: number;
  estado: 'ACTIVO' | 'INACTIVO';
}

export interface Bateria {
  id: string;
  codigo: string;
  nombre: string;
  campo: string;
  pozos: string[]; // pozo IDs
  tanques: Tanque[];
  operadorIds: string[];
  supervisorIds: string[];
}

export interface CodigoDiferida {
  id: string;
  codigo: string;
  descripcion: string;
  area: 'MANTENIMIENTO' | 'INGENIERIA' | 'PRODUCCION' | 'NO_OPERATIVA';
  requiereComentario: boolean;
}

export interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  rol: 'operador' | 'supervisor' | 'admin';
  pin: string;
  bateriasAsignadas: string[];
}

// --- Pozos ---

export const pozos: Pozo[] = [
  // BP 210 — Centro (11 pozos)
  { id: 'p-210-01', nombre: '210-01', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 45, carrera: 54, estado: 'ACTIVO' },
  { id: 'p-210-02', nombre: '210-02', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 38, carrera: 48, estado: 'ACTIVO' },
  { id: 'p-210-03', nombre: '210-03', bateriaId: 'bat-210', sistema: 'PUG', potencialBls: 52, carrera: 60, estado: 'ACTIVO' },
  { id: 'p-210-04', nombre: '210-04', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 30, carrera: 42, estado: 'ACTIVO' },
  { id: 'p-210-05', nombre: '210-05', bateriaId: 'bat-210', sistema: 'PL', potencialBls: 25, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-210-06', nombre: '210-06', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 41, carrera: 50, estado: 'ACTIVO' },
  { id: 'p-210-07', nombre: '210-07', bateriaId: 'bat-210', sistema: 'PUG', potencialBls: 55, carrera: 64, estado: 'ACTIVO' },
  { id: 'p-210-08', nombre: '210-08', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 33, carrera: 44, estado: 'ACTIVO' },
  { id: 'p-210-09', nombre: '210-09', bateriaId: 'bat-210', sistema: 'GL', potencialBls: 60, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-210-10', nombre: '210-10', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 28, carrera: 40, estado: 'ACTIVO' },
  { id: 'p-210-11', nombre: '210-11', bateriaId: 'bat-210', sistema: 'PUE', potencialBls: 36, carrera: 46, estado: 'ACTIVO' },

  // BP 310 — Norte (8 pozos)
  { id: 'p-310-01', nombre: '310-01', bateriaId: 'bat-310', sistema: 'PUE', potencialBls: 50, carrera: 56, estado: 'ACTIVO' },
  { id: 'p-310-02', nombre: '310-02', bateriaId: 'bat-310', sistema: 'PUG', potencialBls: 42, carrera: 52, estado: 'ACTIVO' },
  { id: 'p-310-03', nombre: '310-03', bateriaId: 'bat-310', sistema: 'PUE', potencialBls: 35, carrera: 44, estado: 'ACTIVO' },
  { id: 'p-310-04', nombre: '310-04', bateriaId: 'bat-310', sistema: 'PL', potencialBls: 28, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-310-05', nombre: '310-05', bateriaId: 'bat-310', sistema: 'PUE', potencialBls: 47, carrera: 54, estado: 'ACTIVO' },
  { id: 'p-310-06', nombre: '310-06', bateriaId: 'bat-310', sistema: 'GL', potencialBls: 65, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-310-07', nombre: '310-07', bateriaId: 'bat-310', sistema: 'PUE', potencialBls: 39, carrera: 48, estado: 'ACTIVO' },
  { id: 'p-310-08', nombre: '310-08', bateriaId: 'bat-310', sistema: 'PUE', potencialBls: 31, carrera: 42, estado: 'ACTIVO' },

  // BP 410 — Sur (7 pozos)
  { id: 'p-410-01', nombre: '410-01', bateriaId: 'bat-410', sistema: 'PUE', potencialBls: 55, carrera: 60, estado: 'ACTIVO' },
  { id: 'p-410-02', nombre: '410-02', bateriaId: 'bat-410', sistema: 'PUG', potencialBls: 48, carrera: 54, estado: 'ACTIVO' },
  { id: 'p-410-03', nombre: '410-03', bateriaId: 'bat-410', sistema: 'PUE', potencialBls: 37, carrera: 46, estado: 'ACTIVO' },
  { id: 'p-410-04', nombre: '410-04', bateriaId: 'bat-410', sistema: 'PL', potencialBls: 22, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-410-05', nombre: '410-05', bateriaId: 'bat-410', sistema: 'PUE', potencialBls: 43, carrera: 50, estado: 'ACTIVO' },
  { id: 'p-410-06', nombre: '410-06', bateriaId: 'bat-410', sistema: 'GL', potencialBls: 58, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-410-07', nombre: '410-07', bateriaId: 'bat-410', sistema: 'PUE', potencialBls: 34, carrera: 44, estado: 'ACTIVO' },

  // BP 510 — Este (6 pozos)
  { id: 'p-510-01', nombre: '510-01', bateriaId: 'bat-510', sistema: 'PUE', potencialBls: 62, carrera: 64, estado: 'ACTIVO' },
  { id: 'p-510-02', nombre: '510-02', bateriaId: 'bat-510', sistema: 'PUG', potencialBls: 45, carrera: 52, estado: 'ACTIVO' },
  { id: 'p-510-03', nombre: '510-03', bateriaId: 'bat-510', sistema: 'PUE', potencialBls: 38, carrera: 48, estado: 'ACTIVO' },
  { id: 'p-510-04', nombre: '510-04', bateriaId: 'bat-510', sistema: 'PUE', potencialBls: 29, carrera: 40, estado: 'ACTIVO' },
  { id: 'p-510-05', nombre: '510-05', bateriaId: 'bat-510', sistema: 'GL', potencialBls: 70, carrera: 0, estado: 'ACTIVO' },
  { id: 'p-510-06', nombre: '510-06', bateriaId: 'bat-510', sistema: 'PUE', potencialBls: 33, carrera: 44, estado: 'ACTIVO' },
];

// --- Baterias ---

export const baterias: Bateria[] = [
  {
    id: 'bat-210',
    codigo: 'BP 210',
    nombre: 'Centro',
    campo: 'Lote I',
    pozos: pozos.filter(p => p.bateriaId === 'bat-210').map(p => p.id),
    tanques: [
      { id: 'tk-210-1', nombre: 'TK-210-1', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-210-2', nombre: 'TK-210-2', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-210-3', nombre: 'TK-210-A', producto: 'AGUA', capacidadBls: 300 },
    ],
    operadorIds: ['usr-001', 'usr-002'],
    supervisorIds: ['usr-005'],
  },
  {
    id: 'bat-310',
    codigo: 'BP 310',
    nombre: 'Norte',
    campo: 'Lote I',
    pozos: pozos.filter(p => p.bateriaId === 'bat-310').map(p => p.id),
    tanques: [
      { id: 'tk-310-1', nombre: 'TK-310-1', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-310-2', nombre: 'TK-310-A', producto: 'AGUA', capacidadBls: 300 },
    ],
    operadorIds: ['usr-001', 'usr-003'],
    supervisorIds: ['usr-005'],
  },
  {
    id: 'bat-410',
    codigo: 'BP 410',
    nombre: 'Sur',
    campo: 'Lote I',
    pozos: pozos.filter(p => p.bateriaId === 'bat-410').map(p => p.id),
    tanques: [
      { id: 'tk-410-1', nombre: 'TK-410-1', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-410-2', nombre: 'TK-410-A', producto: 'AGUA', capacidadBls: 300 },
    ],
    operadorIds: ['usr-002', 'usr-003'],
    supervisorIds: ['usr-005'],
  },
  {
    id: 'bat-510',
    codigo: 'BP 510',
    nombre: 'Este',
    campo: 'Lote I',
    pozos: pozos.filter(p => p.bateriaId === 'bat-510').map(p => p.id),
    tanques: [
      { id: 'tk-510-1', nombre: 'TK-510-1', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-510-2', nombre: 'TK-510-2', producto: 'PETROLEO', capacidadBls: 500 },
      { id: 'tk-510-3', nombre: 'TK-510-A', producto: 'AGUA', capacidadBls: 300 },
    ],
    operadorIds: ['usr-004'],
    supervisorIds: ['usr-005'],
  },
];

// --- Codigos Diferida ---

export const codigosDiferida: CodigoDiferida[] = [
  // Mantenimiento
  { id: 'cd-m01', codigo: 'M-01', descripcion: 'Falla de motor', area: 'MANTENIMIENTO', requiereComentario: true },
  { id: 'cd-m02', codigo: 'M-02', descripcion: 'Rotura de varilla', area: 'MANTENIMIENTO', requiereComentario: true },
  { id: 'cd-m03', codigo: 'M-03', descripcion: 'Falla de reductor', area: 'MANTENIMIENTO', requiereComentario: true },
  { id: 'cd-m04', codigo: 'M-04', descripcion: 'Cambio de empaquetadura', area: 'MANTENIMIENTO', requiereComentario: false },
  { id: 'cd-m05', codigo: 'M-05', descripcion: 'Falla eléctrica', area: 'MANTENIMIENTO', requiereComentario: true },
  { id: 'cd-m06', codigo: 'M-06', descripcion: 'Cambio de correa', area: 'MANTENIMIENTO', requiereComentario: false },

  // Ingenieria
  { id: 'cd-i01', codigo: 'I-01', descripcion: 'Pulling programado', area: 'INGENIERIA', requiereComentario: false },
  { id: 'cd-i02', codigo: 'I-02', descripcion: 'Workover', area: 'INGENIERIA', requiereComentario: true },
  { id: 'cd-i03', codigo: 'I-03', descripcion: 'Estimulación', area: 'INGENIERIA', requiereComentario: false },
  { id: 'cd-i04', codigo: 'I-04', descripcion: 'Completación', area: 'INGENIERIA', requiereComentario: true },

  // Produccion
  { id: 'cd-p01', codigo: 'P-01', descripcion: 'Baja producción', area: 'PRODUCCION', requiereComentario: true },
  { id: 'cd-p02', codigo: 'P-02', descripcion: 'Alto corte de agua', area: 'PRODUCCION', requiereComentario: true },
  { id: 'cd-p03', codigo: 'P-03', descripcion: 'Pozo ahogado', area: 'PRODUCCION', requiereComentario: true },
  { id: 'cd-p04', codigo: 'P-04', descripcion: 'Sin fluido', area: 'PRODUCCION', requiereComentario: true },

  // No Operativa
  { id: 'cd-n01', codigo: 'N-01', descripcion: 'Corte de energía', area: 'NO_OPERATIVA', requiereComentario: false },
  { id: 'cd-n02', codigo: 'N-02', descripcion: 'Clima adverso', area: 'NO_OPERATIVA', requiereComentario: false },
  { id: 'cd-n03', codigo: 'N-03', descripcion: 'Falta de transporte', area: 'NO_OPERATIVA', requiereComentario: false },
  { id: 'cd-n04', codigo: 'N-04', descripcion: 'Conflicto social', area: 'NO_OPERATIVA', requiereComentario: false },
];

// --- Usuarios ---

export const usuarios: Usuario[] = [
  { id: 'usr-001', nombre: 'Carlos', apellido: 'Mendoza', rol: 'operador', pin: '1234', bateriasAsignadas: ['bat-210', 'bat-310'] },
  { id: 'usr-002', nombre: 'Luis', apellido: 'Paredes', rol: 'operador', pin: '2345', bateriasAsignadas: ['bat-210', 'bat-410'] },
  { id: 'usr-003', nombre: 'Jorge', apellido: 'Huamán', rol: 'operador', pin: '3456', bateriasAsignadas: ['bat-310', 'bat-410'] },
  { id: 'usr-004', nombre: 'Miguel', apellido: 'Torres', rol: 'operador', pin: '4567', bateriasAsignadas: ['bat-510'] },
  { id: 'usr-005', nombre: 'Roberto', apellido: 'Silva', rol: 'supervisor', pin: '9999', bateriasAsignadas: ['bat-210', 'bat-310', 'bat-410', 'bat-510'] },
];
