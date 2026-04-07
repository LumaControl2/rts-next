// ============================================================
// RT NEXT — Seed Route: Populates MongoDB with Lote I master data
// GET /api/seed
// ============================================================

import { dbConnect } from '@/lib/mongodb';
import Usuario from '@/models/Usuario';
import Pozo from '@/models/Pozo';
import Bateria from '@/models/Bateria';
import CodigoDiferida from '@/models/CodigoDiferida';
import bcrypt from 'bcryptjs';

// ---------- helpers ----------

/** Parse well string "numero/sistema/categoria/potCrudo/potAgua/potGas" */
function parseWell(raw: string, bateria: string, zona: 'Este' | 'Centro' | 'Oeste') {
  const [numero, sistema, categoria, crudo, agua, gas] = raw.split('/');
  const isPiston = sistema === 'PUE' || sistema === 'PUG';
  return {
    numero,
    bateria,
    zona,
    grupo: 'Basica' as const,
    sistema: sistema as 'PUE' | 'PUG' | 'PL' | 'GL',
    categoria: categoria as 'A' | 'B' | 'C',
    potencialCrudo: Number(crudo),
    potencialAgua: Number(agua),
    potencialGas: Number(gas),
    carrera: isPiston ? 64 : 0,
    formacion: '',
    activo: true,
  };
}

// ---------- SEED DATA ----------

const USUARIOS = [
  { nombre: 'Scoter', rol: 'operador', baterias: ['BP 210', 'BP 212'], turno: 'DIA' },
  { nombre: 'García', rol: 'operador', baterias: ['BP 016', 'BP 020', 'BP 201'], turno: 'DIA' },
  { nombre: 'Mendoza', rol: 'operador', baterias: ['BP 017', 'BP 211'], turno: 'DIA' },
  { nombre: 'Quispe', rol: 'operador', baterias: ['BP 210', 'BP 212'], turno: 'NOCHE' },
  { nombre: 'Ing. Pérez', rol: 'supervisor_contratista', baterias: [], turno: 'DIA' },
  { nombre: 'Ing. Sánchez', rol: 'supervisor_contratista', baterias: [], turno: 'NOCHE' },
  { nombre: 'Ing. Rodríguez', rol: 'supervisor_cliente', baterias: [], turno: 'DIA' },
  { nombre: 'Ing. Torres', rol: 'supervisor_cliente', baterias: [], turno: 'NOCHE' },
  { nombre: 'Admin', rol: 'admin', baterias: [], turno: 'DIA' },
];

const BATERIAS = [
  { codigo: 'BP 016', nombre: 'Batería 016', zona: 'Este', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 017', nombre: 'Batería 017', zona: 'Este', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 020', nombre: 'Batería 020', zona: 'Centro', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 201', nombre: 'Batería 201', zona: 'Este', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 210', nombre: 'Batería 210', zona: 'Centro', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Petróleo 2', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 211', nombre: 'Batería 211', zona: 'Oeste', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
  { codigo: 'BP 212', nombre: 'Batería 212', zona: 'Oeste', tanques: [{ nombre: 'TK Petróleo 1', producto: 'PETROLEO' }, { nombre: 'TK Agua 1', producto: 'AGUA' }] },
];

// --- Wells by battery (formato: numero/sistema/cat/crudo/agua/gas) ---

const WELLS_BP016: string[] = [
  '2779/PUG/C/2/0/9', '5361/PUG/C/1/1/8', '5709/PUG/A/5/0/21',
  '12215/PUG/C/2/1/22', '12221/PUG/B/3/0/14', '12254/PUG/B/3/0/14',
  '12284/PUG/A/5/1/34', '12290/PUG/C/2/0/14', '17113/PUG/C/2/1/17',
  '17121/PUG/C/2/2/4',
];

const WELLS_BP017: string[] = [
  '4956/PUG/C/2/1/9', '5703/PUG/C/2/0/14', '5741/PUG/C/2/0/17',
  '5756/PUG/C/2/0/9', '5813/PUG/C/2/0/15', '5830/PUG/B/3/0/13',
  '5939/PUG/C/2/0/3', '12200X/PUG/B/3/0/22', '12203/PUG/A/8/0/46',
  '12205/PUG/B/3/1/14', '12225/PUG/A/5/1/21', '12230/PUG/C/2/3/14',
  '12243/PUG/A/7/1/38', '12275/PUG/A/5/0/23', '12280/PUG/A/10/0/72',
  '17107/PUG/A/5/3/23', '17110/PUG/B/3/1/18', '17117/PUG/C/2/0/19',
];

const WELLS_BP020: string[] = [
  '5143/PUG/C/2/0/9', '12245/PUG/C/2/0/10', '12252D/PUG/C/2/0/0',
  '12279/PUG/B/3/0/14', '12282/PUG/C/2/1/2', '12286/PUG/C/2/0/4',
  '12287/PUG/C/2/0/9', '12300/PUG/B/3/1/15', '17112/PUG/C/2/1/8',
  '17127/PUG/C/2/0/0', '12248D/PUG/C/2/1/9',
];

const WELLS_BP201: string[] = [
  '3617/PUE/B/3/0/13', '3724/PUE/B/3/0/14', '3861/PUE/A/5/0/30',
  '3939/PUE/C/2/0/7', '3971/PUG/A/6/0/28', '3974/PUE/C/2/0/13',
  '5387/PUE/C/2/1/9', '5720/PUE/B/4/0/17', '5889/PUE/C/2/0/0',
  '12220/PUE/C/2/2/9', '12226/PUG/C/1/0/0', '12231/PUE/B/3/0/14',
  '12234/PUE/B/3/0/14', '12235/PUE/A/5/0/23', '12242/PUE/B/3/0/23',
  '12250/PUE/C/1/0/13', '12261/PUE/A/8/0/46', '12283/PUG/A/6/1/26',
];

const WELLS_BP210: string[] = [
  '4027/PUE/C/2/2/9', '4746/PUE/B/3/0/14', '4819/PUG/C/2/0/0',
  '4874/PUE/A/9/108/43', '5264/PUE/B/4/1/18', '6166/PUE/C/1/3/4',
  '12232/PUG/A/5/60/24', '12281/PUG/B/3/0/14', '12289/PUE/A/11/4/22',
  '12292/PUG/A/6/2/33', '12295/PUG/C/2/1/15', '2141/PUE/C/2/0/14',
  '3882/PUE/C/2/0/14', '3938/PUE/C/2/0/9', '4129/PUE/B/4/0/19',
  '4367/PUG/C/2/0/10', '12297/PUE/B/4/2/18', '17108/PUE/C/1/1/5',
  '17109/PUG/A/26/0/27', '17116/PUG/A/5/15/31', '17118/PUE/C/2/1/9',
  '17120/PUG/B/4/2/19',
];

const WELLS_BP211: string[] = [
  '12202/PUE/C/2/0/9', '12206/PUE/B/3/0/13', '12207/PUE/C/2/0/8',
  '12208/PUG/C/2/0/14', '12216/PUE/C/2/0/9', '12218/PUE/C/1/0/5',
  '12219/PUG/B/3/1/14', '12223/PUG/C/1/0/9', '12224/PUG/C/2/0/19',
  '12239/PUG/C/2/1/16', '12246/PUG/C/1/1/9', '12256/PUG/C/2/0/9',
  '12260/PUG/B/3/1/14', '12263/PUE/C/2/1/14', '12270/PUE/C/1/0/3',
  '17125/PUE/C/1/3/9', '776R/PUG/A/5/15/17', '5054/PUG/C/2/0/19',
  '17124/PL/B/3/0/63',
];

const WELLS_BP212: string[] = [
  '3821/PUE/A/7/0/114', '3914/PUE/A/5/0/23', '3951/GL/C/2/0/100',
  '5308/PUE/B/4/0/22', '5928/PUE/C/2/0/0', '12222/PUG/C/2/0/14',
  '12227/PUE/B/4/0/9', '12229/PUE/C/2/0/2', '12240/PUG/B/3/0/11',
  '12255/PUG/A/5/0/22', '12271/PL/A/6/1/211', '12273/PUG/B/4/0/19',
  '12277/PUE/B/4/0/5', '12278/PUG/A/11/0/16', '3911/PUE/C/1/0/0',
  '12237/PUE/C/2/0/0',
];

// --- Codigos de Diferida (86 codes) ---

const CODIGOS_DIFERIDA: { codigo: string; descripcion: string; area: string }[] = [
  // Mantenimiento (34)
  { codigo: 'M01', descripcion: 'Falla o Reemplazo de Motor', area: 'Mantenimiento' },
  { codigo: 'M02', descripcion: 'Falla o Reemplazo Equipo Superficie', area: 'Mantenimiento' },
  { codigo: 'M03', descripcion: 'Falla Motor Electrico', area: 'Mantenimiento' },
  { codigo: 'M04', descripcion: 'Falla Motor a Gas', area: 'Mantenimiento' },
  { codigo: 'M05', descripcion: 'Falla Equipo Electrico', area: 'Mantenimiento' },
  { codigo: 'M06', descripcion: 'Preventivo PU', area: 'Mantenimiento' },
  { codigo: 'M07', descripcion: 'Preventivo Motor Electrico', area: 'Mantenimiento' },
  { codigo: 'M08', descripcion: 'Preventivo Motor a Gas', area: 'Mantenimiento' },
  { codigo: 'M09', descripcion: 'Falla Reductor', area: 'Mantenimiento' },
  { codigo: 'M10', descripcion: 'Preventivo Motor', area: 'Mantenimiento' },
  { codigo: 'M11', descripcion: 'Cambio de Correas', area: 'Mantenimiento' },
  { codigo: 'M12', descripcion: 'Falla Arrancador', area: 'Mantenimiento' },
  { codigo: 'M13', descripcion: 'Falla Variador', area: 'Mantenimiento' },
  { codigo: 'M14', descripcion: 'Trabajos en Postes-Cables', area: 'Mantenimiento' },
  { codigo: 'M15', descripcion: 'Falla Tablero Electrico', area: 'Mantenimiento' },
  { codigo: 'M16', descripcion: 'Falla Transformador', area: 'Mantenimiento' },
  { codigo: 'M17', descripcion: 'Reparacion de Estructura', area: 'Mantenimiento' },
  { codigo: 'M18', descripcion: 'Cambio de Estrobo', area: 'Mantenimiento' },
  { codigo: 'M19', descripcion: 'Cojinete de Centro', area: 'Mantenimiento' },
  { codigo: 'M20', descripcion: 'Cojinete de Cola', area: 'Mantenimiento' },
  { codigo: 'M21', descripcion: 'Contrapesado', area: 'Mantenimiento' },
  { codigo: 'M22', descripcion: 'Perno-Biela', area: 'Mantenimiento' },
  { codigo: 'M23', descripcion: 'Caja Reductora', area: 'Mantenimiento' },
  { codigo: 'M24', descripcion: 'Sistema de Freno', area: 'Mantenimiento' },
  { codigo: 'M25', descripcion: 'Falla en Cabezal', area: 'Mantenimiento' },
  { codigo: 'M26', descripcion: 'Cambio de Empaquetadura', area: 'Mantenimiento' },
  { codigo: 'M27', descripcion: 'Cambio de Carrera', area: 'Mantenimiento' },
  { codigo: 'M28', descripcion: 'Cambio de Vastago', area: 'Mantenimiento' },
  { codigo: 'M29', descripcion: 'Reparacion Puente Superficie', area: 'Mantenimiento' },
  { codigo: 'M30', descripcion: 'Falla Generador', area: 'Mantenimiento' },
  { codigo: 'M31', descripcion: 'Reparacion Cañeria', area: 'Mantenimiento' },
  { codigo: 'M32', descripcion: 'Centrado PU', area: 'Mantenimiento' },
  { codigo: 'M33', descripcion: 'Alineado de Equipo', area: 'Mantenimiento' },
  { codigo: 'M34', descripcion: 'Repara Manifold', area: 'Mantenimiento' },
  // Ingenieria (10)
  { codigo: 'I01', descripcion: 'Diferida Swab', area: 'Ingenieria' },
  { codigo: 'I02', descripcion: 'Pozo espera Pulling', area: 'Ingenieria' },
  { codigo: 'I03', descripcion: 'Intervenido con Pulling', area: 'Ingenieria' },
  { codigo: 'I04', descripcion: 'Incremento agua despues de Pulling', area: 'Ingenieria' },
  { codigo: 'I05', descripcion: 'Espera Equipo de Cable', area: 'Ingenieria' },
  { codigo: 'I06', descripcion: 'Intervenido Equipo de Cable', area: 'Ingenieria' },
  { codigo: 'I07', descripcion: 'Evaluacion de Reservorios', area: 'Ingenieria' },
  { codigo: 'I08', descripcion: 'Espera Coiled Tubing', area: 'Ingenieria' },
  { codigo: 'I09', descripcion: 'Intervenido Coiled Tubing', area: 'Ingenieria' },
  { codigo: 'I10', descripcion: 'Espera Definicion', area: 'Ingenieria' },
  // Produccion (11 — P01 "Merma de Produccion" excluded)
  { codigo: 'P02', descripcion: 'Pozo cerrado', area: 'Produccion' },
  { codigo: 'P03', descripcion: 'Pozo sin produccion', area: 'Produccion' },
  { codigo: 'P04', descripcion: 'Sin surgencia', area: 'Produccion' },
  { codigo: 'P05', descripcion: 'Bloqueo por gas', area: 'Produccion' },
  { codigo: 'P06', descripcion: 'Merma por contrapresion', area: 'Produccion' },
  { codigo: 'P07', descripcion: 'Alto porcentaje de agua', area: 'Produccion' },
  { codigo: 'P08', descripcion: 'Espaciamiento de bomba', area: 'Produccion' },
  { codigo: 'P09', descripcion: 'Cambio de parametros', area: 'Produccion' },
  { codigo: 'P10', descripcion: 'Prueba hidraulica', area: 'Produccion' },
  { codigo: 'P11', descripcion: 'Mediciones fisicas', area: 'Produccion' },
  { codigo: 'P12', descripcion: 'Paro por Pump Off', area: 'Produccion' },
  // No Operativa (14)
  { codigo: 'N01', descripcion: 'Corte de Energia externo', area: 'No Operativa' },
  { codigo: 'N02', descripcion: 'Corte de Energia interno', area: 'No Operativa' },
  { codigo: 'N03', descripcion: 'Corte por razones climaticas', area: 'No Operativa' },
  { codigo: 'N04', descripcion: 'Reduccion de carga', area: 'No Operativa' },
  { codigo: 'N05', descripcion: 'Mal estado de caminos', area: 'No Operativa' },
  { codigo: 'N06', descripcion: 'Zona anegada por lluvias', area: 'No Operativa' },
  { codigo: 'N07', descripcion: 'Zona anegada por crecida rio', area: 'No Operativa' },
  { codigo: 'N08', descripcion: 'Robo materiales', area: 'No Operativa' },
  { codigo: 'N09', descripcion: 'Robo lineas electricas', area: 'No Operativa' },
  { codigo: 'N10', descripcion: 'Paro preventivo energia', area: 'No Operativa' },
  { codigo: 'N11', descripcion: 'Falta presupuesto', area: 'No Operativa' },
  { codigo: 'N12', descripcion: 'Espera materiales', area: 'No Operativa' },
  { codigo: 'N13', descripcion: 'Acondiciona locacion', area: 'No Operativa' },
  { codigo: 'N14', descripcion: 'Accesos en mal estado por lluvias', area: 'No Operativa' },
];

// ============================================================
// GET /api/seed
// ============================================================

export async function GET() {
  try {
    await dbConnect();

    // ---------- 1. Clear existing data ----------
    await Promise.all([
      Usuario.deleteMany({}),
      Pozo.deleteMany({}),
      Bateria.deleteMany({}),
      CodigoDiferida.deleteMany({}),
    ]);

    // ---------- 2. Hash PIN ----------
    const hashedPin = await bcrypt.hash('1234', 10);

    // ---------- 3. Insert Usuarios ----------
    const usuariosData = USUARIOS.map((u) => ({
      ...u,
      pin: hashedPin,
      activo: true,
    }));
    const usuarios = await Usuario.insertMany(usuariosData);

    // ---------- 4. Insert Baterias ----------
    const bateriasData = BATERIAS.map((b) => ({ ...b, activa: true }));
    const baterias = await Bateria.insertMany(bateriasData);

    // ---------- 5. Insert Pozos ----------
    const allWells = [
      ...WELLS_BP016.map((w) => parseWell(w, 'BP 016', 'Este')),
      ...WELLS_BP017.map((w) => parseWell(w, 'BP 017', 'Este')),
      ...WELLS_BP020.map((w) => parseWell(w, 'BP 020', 'Centro')),
      ...WELLS_BP201.map((w) => parseWell(w, 'BP 201', 'Este')),
      ...WELLS_BP210.map((w) => parseWell(w, 'BP 210', 'Centro')),
      ...WELLS_BP211.map((w) => parseWell(w, 'BP 211', 'Oeste')),
      ...WELLS_BP212.map((w) => parseWell(w, 'BP 212', 'Oeste')),
    ];
    const pozos = await Pozo.insertMany(allWells);

    // ---------- 6. Insert Codigos de Diferida ----------
    const codigosData = CODIGOS_DIFERIDA.map((c) => ({
      ...c,
      subarea: c.area,
      activo: true,
    }));
    const codigos = await CodigoDiferida.insertMany(codigosData);

    // ---------- 7. Summary ----------
    return Response.json({
      success: true,
      message: 'Seed completed — Lote I master data loaded',
      counts: {
        usuarios: usuarios.length,
        baterias: baterias.length,
        pozos: pozos.length,
        codigosDiferida: codigos.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
