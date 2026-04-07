import { NextRequest } from 'next/server';
import groq from '@/lib/groq';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';
import Pozo from '@/models/Pozo';
import Bateria from '@/models/Bateria';
import Jornada from '@/models/Jornada';
import CodigoDiferida from '@/models/CodigoDiferida';

const SYSTEM_PROMPT = `Eres MATHIUS, el asistente inteligente de campo para operadores petroleros del Lote I (Consorcio Panda Energy) en Talara, Piura, Perú.
Hablas español informal pero profesional. Eres conciso, directo y confiable como un compañero de campo experimentado.
El Lote I tiene 7 baterías, 114 pozos activos, sistemas PUE/PUG/PL/GL/TBG/CSG.
Tu nombre es MATHIUS. Los operadores te llaman diciendo "Mathius" antes de su comando.

Tu trabajo es:
1. EJECUTAR: registrar pozos, iniciar jornada, navegar a baterías y pozos, cerrar baterías
2. INFORMAR: datos de pozos, producción, comparaciones con ayer, rangos, diferidas, resúmenes
3. ALERTAR: datos fuera de rango, inconsistencias, pozos sin registro
4. GUIAR: sugerir el siguiente paso lógico al operador

SIEMPRE respondes con un JSON con esta estructura:
{
  "mensaje": "Lo que le dices al operador (texto corto, máximo 3 oraciones). Incluye datos concretos.",
  "accion": null o un objeto de acción (ver abajo),
  "sugerencias": ["texto acción 1", "texto acción 2", "texto acción 3"]
}

REGLA CRÍTICA sobre sugerencias:
- SIEMPRE incluye 2-4 sugerencias relevantes al contexto actual
- Las sugerencias son frases que el operador puede decir para continuar
- Deben ser acciones concretas y útiles según dónde está el operador

ACCIONES POSIBLES:
- {"tipo": "INICIAR_JORNADA", "datos": {"placa": "ABC-123", "kmInicio": 45230}}
- {"tipo": "NAVEGAR", "pantalla": "home"}
- {"tipo": "NAVEGAR", "pantalla": "cierre", "bateriaId": "BP 210"}
- {"tipo": "NAVEGAR", "pantalla": "pozo", "bateriaId": "BP 210", "pozoId": "17109"}
- {"tipo": "NAVEGAR", "pantalla": "tanques", "bateriaId": "BP 210"}
- {"tipo": "NAVEGAR", "pantalla": "resumen", "bateriaId": "BP 210"}
- {"tipo": "NAVEGAR", "pantalla": "jornada"}
- {"tipo": "REGISTRAR_POZO", "datos": {"pozoId": "17109", "crudoBls": 3, "aguaBls": 30, "presionTubos": 120, "presionForros": 0, "gpm": 6, "carrera": 64, "estadoPozo": "BOMBEANDO", "codigoDiferida": null, "comentarios": ""}}
- {"tipo": "REGISTRAR_POZO_PARADO", "datos": {"pozoId": "4874", "estadoPozo": "PARADO", "codigoDiferida": "M06", "comentarios": "motor hace ruido"}}
- {"tipo": "COPIAR_AYER", "bateriaId": "BP 210"}
- {"tipo": "CERRAR_BATERIA", "bateriaId": "BP 210"}
- {"tipo": "INFO"} — cuando solo informa sin modificar nada

REGLAS DE ACCIÓN:
1. Si dice "inicio turno" SIN placa y km: NO generes INICIAR_JORNADA. Pregunta: "¿Cuál es la placa y el kilometraje?" con accion: null
2. Si dice datos de un pozo, genera REGISTRAR_POZO. Si no dice algún campo, usa el valor de AYER si existe
3. Si dice "parado" + motivo, genera REGISTRAR_POZO_PARADO con el código de diferida correcto
4. Si dice "copiar ayer" o "los demás igual", genera COPIAR_AYER
5. Si dice "cerrar batería" o "eso es todo" y todos registrados, genera CERRAR_BATERIA
6. SIEMPRE confirma lo que registraste: repite pozo + datos clave + progreso (ej: "5/12 pozos")
7. Sé MUY conciso — operador en campo bajo el sol
8. Si dice "ir a pozo X" o "registrar pozo X", navega directamente al formulario de ese pozo
9. Si dice "siguiente pozo", navega al primer pozo PENDIENTE de la batería actual
10. Si dice "tanques" o "bombeos", navega a la pantalla de tanques

REGLAS DE CONSULTA:
11. "¿Qué pozos tiene la batería X?" → Lista TODOS los pozos con número + sistema + potencial
12. "¿Cómo cerró el pozo X ayer?" → Valores exactos de AYER
13. "¿Cuál es el potencial/rango del pozo X?" → Potencial crudo/agua/gas + carrera
14. "¿Cuántos faltan?" → Lista EXACTA de pozos pendientes por número
15. "¿Cuántos llevo?" / "¿Cómo voy?" → Resumen: registrados/total, crudo total, KPI%
16. "¿Cómo va el día?" → Resumen de TODAS las baterías con estado
17. "¿Qué pozos están parados?" → Lista con código de diferida
18. "¿Cuál es la diferida?" → Total diferida BLS y detalle por pozo
19. "Resumen de la batería" → Totales: crudo, agua, diferida, bombeando, parados, KPI
20. Para consultas, usa accion: {"tipo": "INFO"}

REGLAS DE ALERTA:
21. Si presión reportada > 2x valor de ayer → "⚠️ Presión muy alta vs ayer (X PSI)"
22. Si crudo = 0 pero dice "bombeando" → "¿Seguro que está bombeando? Crudo=0"
23. Si pozo parado ayer y hoy bombeando → "¿Ya se reparó el pozo X? Ayer estaba parado por Y"
24. Si crudo reportado > 2x potencial → "⚠️ Crudo mayor al doble del potencial"

INTELIGENCIA DE CAMPO:
25. Cuando registras un pozo, si el operador no dice GPM o carrera, usa los valores de AYER
26. Si no hay datos de ayer, usa los del maestro de pozos (potencial como referencia)
27. Relaciona los códigos de diferida con lo que dice el operador:
    - "preventivo" = M06 (Preventivo PU)
    - "motor" = M01 (Falla Motor)
    - "equipo" = M02 (Falla Equipo)
    - "pulling" = I02 (Espera Pulling) o I03 (Intervenido)
    - "sin producción" = P03
    - "corte de luz/energía" = N01
    - "lluvia" = N14
    - "pump off" = P12
    - "variador" = M13
    - "tablero" = M15
    - "correas" = M11

CÓDIGOS DE DIFERIDA COMPLETOS:
M01=Falla Motor, M02=Falla Equipo, M03=Falla Motor Eléctrico, M04=Falla Motor Gas, M06=Preventivo PU, M09=Falla Reductor, M10=Preventivo Motor, M11=Cambio Correas, M13=Falla Variador, M15=Falla Tablero, M25=Falla Cabezal, M26=Cambio Empaquetadura, M27=Cambio Carrera, M28=Cambio Vástago, M32=Centrado PU, M33=Alineado
I02=Espera Pulling, I03=Intervenido Pulling, I10=Espera Definición
P02=Cerrado, P03=Sin producción, P05=Bloqueo gas, P12=Pump Off
N01=Corte energía externo, N03=Clima, N14=Lluvias

JERGA DE CAMPO:
- "crudo"/"petróleo"/"barriles"/"aceite" = crudoBls
- "agua" = aguaBls
- "presión"/"tubos" = presionTubos (asumir tubos si solo dice "presión")
- "forros"/"casing" = presionForros
- "golpes"/"GPM"/"golpes por minuto" = gpm
- "carrera" = carrera (pulgadas)
- "de" separa valor: "3 de crudo" = crudoBls:3
- "30 de agua" = aguaBls:30
- "120 de presión" = presionTubos:120
- Timer: convertir horas a minutos
- "el siguiente"/"el que sigue" = primer pozo PENDIENTE
- "todos iguales"/"lo mismo" = COPIAR_AYER`;

// Whisper prompt with ALL well numbers for better transcription
const WHISPER_PROMPT = `Mathius es el asistente de campo. Operador petrolero del Lote I, Talara, Perú. Consorcio Panda Energy.
Pozos: 17109, 12280, 4874, 12289, 3821, 12255, 5264, 3824, 12281, 3832, 4878, 12284, 17110, 12285, 3833, 12286, 12270, 12271, 6784, 3847, 6785, 3848, 6786, 12273, 6787, 6303, 6800, 6801, 12253, 12256, 6304, 4851, 4857, 4862, 4864, 4865, 7356, 7357, 7358, 7359, 4841, 4843, 4846, 4848, 12236, 12240, 12241, 12243, 12249, 12250, 3810, 3811, 3812, 3813, 3814, 12238, 12244, 12245, 12246, 12248.
Baterías: BP 210, BP 212, BP 016, BP 020, BP 017, BP 019, BP 021.
Bombeando, parado, crudo, agua, presión tubos, forros, golpes por minuto, carrera, preventivo PU, falla motor, pulling, corte energía, diferida, pump off, variador.
Placa vehículo, kilómetro, kilometraje, jornada, turno día, turno noche.`;

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const auth = await getUserFromRequest(request);
    if (!auth) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const textInput = formData.get('text') as string | null;
    const contextStr = formData.get('context') as string | null;
    const historyStr = formData.get('history') as string | null;

    // Support both audio and text input
    let transcript: string;
    if (textInput?.trim()) {
      transcript = textInput.trim();
    } else if (audioFile && audioFile.size > 0) {
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'es',
        response_format: 'json',
        prompt: WHISPER_PROMPT,
      });
      transcript = transcription.text;
      if (!transcript?.trim()) {
        return Response.json({ error: 'No se detectó voz' }, { status: 400 });
      }
    } else {
      return Response.json({ error: 'Envíe audio o texto' }, { status: 400 });
    }

    // Build context
    const context = contextStr ? JSON.parse(contextStr) : {};
    const history = historyStr ? JSON.parse(historyStr) : [];

    // Build rich DB context
    const dbContext = await buildDbContext(auth.userId, context);

    // Build conversation messages
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + dbContext },
    ];
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: transcript });

    // Get response from Llama
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'Sin respuesta del modelo' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    // Execute action if any
    let actionResult: any = null;
    if (parsed.accion && parsed.accion.tipo && parsed.accion.tipo !== 'INFO') {
      actionResult = await executeAction(parsed.accion, auth.userId, context);
    }

    return Response.json({
      transcript,
      response: parsed,
      actionResult,
    });
  } catch (error: any) {
    console.error('Assistant error:', error);
    return Response.json({ error: error?.message || 'Error del asistente' }, { status: 500 });
  }
}

async function buildDbContext(userId: string, context: any): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Parallel DB queries
    const [baterias, allPozos, cierresHoy, cierresAyer, jornada, codigos] = await Promise.all([
      Bateria.find({ activa: true }).lean(),
      Pozo.find({ activo: true, grupo: 'Basica' }).lean(),
      Cierre.find({
        fecha: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59Z') },
      }).lean(),
      Cierre.find({
        fecha: { $gte: new Date(yesterdayStr), $lt: new Date(yesterdayStr + 'T23:59:59Z') },
        estado: { $in: ['APROBADO', 'ENVIADO'] },
      }).lean(),
      Jornada.findOne({ operadorId: userId, estado: 'ACTIVA' }).lean(),
      CodigoDiferida.find().lean(),
    ]);

    // Active cierre for current battery
    const activeCierre = context.bateriaId
      ? cierresHoy.find((c: any) => c.bateriaId === context.bateriaId && (c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO'))
      : null;

    // --- Battery summary ---
    const batLines = baterias.map((b: any) => {
      const pozos = allPozos.filter((p: any) => p.bateria === b.codigo);
      const potTotal = pozos.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0);
      const cierre = cierresHoy.find((c: any) => c.bateriaId === b.codigo);
      const estado = cierre ? cierre.estado : 'SIN INICIAR';
      const progreso = cierre ? `${(cierre as any).pozosRegistrados || 0}/${(cierre as any).totalPozos || pozos.length}` : '0/' + pozos.length;
      const crudo = cierre ? (cierre as any).totalCrudo || 0 : 0;
      return `  ${b.codigo} (${b.zona}): ${pozos.length} pozos, pot=${potTotal}BLS, estado=${estado}, progreso=${progreso}, crudo=${crudo}`;
    }).join('\n');

    // --- Well detail for current battery ---
    let wellDetail = '';
    if (context.bateriaId) {
      const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
      const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
      const lecturasAyer = cierreAyer ? (cierreAyer as any).lecturas || [] : [];

      const lines = bpozos.map((p: any) => {
        const lectAyer = lecturasAyer.find((l: any) => l.pozoId === p.numero);
        const lectHoy = activeCierre ? (activeCierre as any).lecturas?.find((l: any) => l.pozoId === p.numero) : null;

        let line = `  ${p.numero} | ${p.sistema} | Cat.${p.categoria} | Pot:${p.potencialCrudo}c/${p.potencialAgua || 0}a | carr=${p.carrera}`;
        if (lectAyer) {
          line += ` | AYER:${lectAyer.crudoBls}c/${lectAyer.aguaBls}a/p${lectAyer.presionTubos}/g${lectAyer.gpm}/${lectAyer.estadoPozo}`;
          if (lectAyer.estadoPozo === 'PARADO') line += `(${lectAyer.codigoDiferida})`;
        }
        line += lectHoy
          ? ` | HOY:${lectHoy.crudoBls}c/${lectHoy.aguaBls}a/${lectHoy.estadoPozo} ✓`
          : ' | HOY:PENDIENTE';
        return line;
      });
      wellDetail = `\nPOZOS DE ${context.bateriaId} (${bpozos.length} total):\n${lines.join('\n')}`;
    }

    // --- Active cierre detail ---
    let cierreDetail = '';
    if (activeCierre) {
      const registrados = (activeCierre as any).lecturas?.map((l: any) => l.pozoId) || [];
      const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
      const pendientes = bpozos.filter((p: any) => !registrados.includes(p.numero)).map((p: any) => p.numero);
      const parados = (activeCierre as any).lecturas?.filter((l: any) => l.estadoPozo === 'PARADO') || [];
      cierreDetail = `\nCIERRE ACTIVO ${context.bateriaId}:
  ID: ${(activeCierre as any)._id}
  Registrados: ${registrados.length}/${bpozos.length} → [${registrados.join(', ')}]
  PENDIENTES: ${pendientes.length} → [${pendientes.join(', ')}]
  SIGUIENTE POZO PENDIENTE: ${pendientes[0] || 'TODOS REGISTRADOS'}
  Crudo=${(activeCierre as any).totalCrudo} Agua=${(activeCierre as any).totalAgua} Dif=${(activeCierre as any).totalDiferida}
  Bombeando=${(activeCierre as any).pozosBombeando} Parados=${parados.length} KPI=${(activeCierre as any).kpiProduccion}%`;
      if (parados.length > 0) {
        cierreDetail += `\n  Detalle parados: ${parados.map((l: any) => `${l.pozoId}(${l.codigoDiferida})`).join(', ')}`;
      }
    }

    // --- Yesterday's summary ---
    let ayerDetail = '';
    if (context.bateriaId) {
      const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
      if (cierreAyer) {
        const ca = cierreAyer as any;
        ayerDetail = `\nAYER ${context.bateriaId}: crudo=${ca.totalCrudo} agua=${ca.totalAgua} dif=${ca.totalDiferida} parados=${ca.pozosParados} KPI=${ca.kpiProduccion}%`;
      }
    }

    // --- Day overview (all batteries) ---
    const totalCrudoDia = cierresHoy.reduce((s, c: any) => s + (c.totalCrudo || 0), 0);
    const totalAguaDia = cierresHoy.reduce((s, c: any) => s + (c.totalAgua || 0), 0);
    const batCerradas = cierresHoy.filter((c: any) => c.estado === 'ENVIADO' || c.estado === 'APROBADO').length;

    // --- Well for specific pozo context ---
    let pozoDetail = '';
    if (context.pozoId) {
      const pozo = allPozos.find((p: any) => p.numero === context.pozoId);
      if (pozo) {
        const p = pozo as any;
        pozoDetail = `\nPOZO ACTUAL ${p.numero}: ${p.sistema} | Cat.${p.categoria} | Pot: crudo=${p.potencialCrudo} agua=${p.potencialAgua} gas=${p.potencialGas} | carrera=${p.carrera}`;
        // Yesterday's data for this well
        if (context.bateriaId) {
          const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
          const lectAyer = cierreAyer ? (cierreAyer as any).lecturas?.find((l: any) => l.pozoId === p.numero) : null;
          if (lectAyer) {
            pozoDetail += `\n  AYER: crudo=${lectAyer.crudoBls} agua=${lectAyer.aguaBls} pTubos=${lectAyer.presionTubos} pForros=${lectAyer.presionForros || 0} gpm=${lectAyer.gpm} carrera=${lectAyer.carrera || p.carrera} estado=${lectAyer.estadoPozo}`;
            if (lectAyer.estadoPozo === 'PARADO') pozoDetail += ` diferida=${lectAyer.codigoDiferida}`;
          }
        }
      }
    }

    return `

ESTADO DEL CAMPO — ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}:
Jornada: ${jornada ? `ACTIVA (placa: ${(jornada as any).vehiculo?.placa}, km: ${(jornada as any).vehiculo?.kmInicio}, actividades: ${(jornada as any).actividades?.length || 0})` : 'NO INICIADA — el operador debe iniciar jornada primero'}
Pantalla: ${context.screen || 'desconocida'}
Batería: ${context.bateriaId || 'ninguna seleccionada'}
Día: crudo total=${totalCrudoDia}BLS, agua total=${totalAguaDia}BLS, baterías cerradas=${batCerradas}/7

BATERÍAS:
${batLines}
${wellDetail}
${cierreDetail}
${ayerDetail}
${pozoDetail}

INSTRUCCIONES DE SUGERENCIAS:
- En HOME sin jornada: sugiere iniciar jornada
- En HOME con jornada: sugiere ir a la batería con más potencial sin cerrar
- En CIERRE de batería: sugiere registrar el siguiente pozo pendiente, copiar ayer, o consultar datos
- En POZO: sugiere qué datos reportar basado en ayer
- Siempre ofrece opciones útiles y contextuales`;
  } catch (err) {
    console.error('buildDbContext error:', err);
    return '\nError cargando contexto: ' + (err instanceof Error ? err.message : 'desconocido');
  }
}

async function executeAction(accion: any, userId: string, context: any) {
  try {
    switch (accion.tipo) {
      case 'INICIAR_JORNADA': {
        const placa = accion.datos?.placa;
        const kmInicio = accion.datos?.kmInicio;
        if (!placa) {
          return { success: false, error: 'Diga la placa del vehículo para iniciar' };
        }
        const existing = await Jornada.findOne({ operadorId: userId, estado: 'ACTIVA' });
        if (existing) {
          return {
            success: true,
            tipo: 'JORNADA_CREADA',
            id: existing._id,
            placa: (existing as any).vehiculo?.placa,
            kmInicio: (existing as any).vehiculo?.kmInicio,
            yaExistia: true,
          };
        }
        const jornada = await Jornada.create({
          fecha: new Date(),
          operadorId: userId,
          turno: new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DIA' : 'NOCHE',
          estado: 'ACTIVA',
          vehiculo: { placa: String(placa).toUpperCase(), kmInicio: kmInicio || 0 },
          actividades: [],
          resumen: { kmRecorridos: 0, totalActividades: 0, pozosVisitados: 0, bateriasCerradas: 0, tiempoTotal: 0, fotosTomadas: 0 },
        });
        return { success: true, tipo: 'JORNADA_CREADA', id: jornada._id, placa: String(placa).toUpperCase(), kmInicio: kmInicio || 0 };
      }

      case 'REGISTRAR_POZO': {
        if (!context.cierreId) return { success: false, error: 'No hay cierre activo. Navegue a una batería primero.' };

        const cierre = await Cierre.findById(context.cierreId);
        if (!cierre || cierre.estado === 'APROBADO') {
          return { success: false, error: 'Cierre no disponible' };
        }

        const datos = accion.datos;
        const existingIdx = cierre.lecturas.findIndex((l: any) => l.pozoId === datos.pozoId);

        const lecturaData = {
          pozoId: datos.pozoId,
          crudoBls: datos.crudoBls ?? 0,
          aguaBls: datos.aguaBls ?? 0,
          presionTubos: datos.presionTubos ?? 0,
          presionForros: datos.presionForros ?? 0,
          gpm: datos.gpm ?? 0,
          carrera: datos.carrera ?? 64,
          timerOn: datos.timerOn ?? 0,
          timerOff: datos.timerOff ?? 0,
          estadoPozo: datos.estadoPozo || 'BOMBEANDO',
          codigoDiferida: datos.codigoDiferida || null,
          comentarioDiferida: datos.comentarios || '',
          comentarios: datos.comentarios || '',
          fotos: [],
          horaRegistro: new Date(),
          gpsLat: 0,
          gpsLng: 0,
        };

        if (existingIdx >= 0) {
          cierre.lecturas[existingIdx] = { ...cierre.lecturas[existingIdx], ...lecturaData };
        } else {
          cierre.lecturas.push(lecturaData);
        }

        // Recalculate totals
        const lecturas = cierre.lecturas;
        cierre.totalCrudo = lecturas.reduce((s: number, l: any) => s + (l.crudoBls || 0), 0);
        cierre.totalAgua = lecturas.reduce((s: number, l: any) => s + (l.aguaBls || 0), 0);
        cierre.pozosRegistrados = lecturas.length;
        cierre.pozosBombeando = lecturas.filter((l: any) => l.estadoPozo === 'BOMBEANDO').length;
        cierre.pozosParados = lecturas.filter((l: any) => l.estadoPozo === 'PARADO').length;

        const pozoIdsParados = lecturas.filter((l: any) => l.estadoPozo === 'PARADO').map((l: any) => l.pozoId);
        if (pozoIdsParados.length > 0) {
          const pozosParados = await Pozo.find({ numero: { $in: pozoIdsParados } });
          cierre.totalDiferida = pozosParados.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0);
        } else {
          cierre.totalDiferida = 0;
        }
        cierre.kpiProduccion = cierre.potencialTotal > 0
          ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 1000) / 10
          : 0;

        await cierre.save();

        // Find next pending well
        const allPozos = await Pozo.find({ bateria: cierre.bateriaId, activo: true, grupo: 'Basica' }).lean();
        const registeredIds = cierre.lecturas.map((l: any) => l.pozoId);
        const nextPending = allPozos.find((p: any) => !registeredIds.includes(p.numero));

        return {
          success: true,
          tipo: 'POZO_REGISTRADO',
          pozo: datos.pozoId,
          pozosRegistrados: cierre.pozosRegistrados,
          totalPozos: cierre.totalPozos,
          totalCrudo: cierre.totalCrudo,
          kpi: cierre.kpiProduccion,
          nextPending: nextPending ? (nextPending as any).numero : null,
        };
      }

      case 'REGISTRAR_POZO_PARADO': {
        accion.datos.estadoPozo = 'PARADO';
        accion.datos.crudoBls = 0;
        accion.datos.aguaBls = 0;
        accion.tipo = 'REGISTRAR_POZO';
        return executeAction(accion, userId, context);
      }

      case 'COPIAR_AYER': {
        if (!context.cierreId) return { success: false, error: 'No hay cierre activo' };

        const cierre = await Cierre.findById(context.cierreId);
        if (!cierre) return { success: false, error: 'Cierre no encontrado' };

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const cierreAyer = await Cierre.findOne({
          bateriaId: accion.bateriaId || cierre.bateriaId,
          fecha: { $gte: new Date(yesterdayStr), $lt: new Date(yesterdayStr + 'T23:59:59Z') },
          estado: { $in: ['APROBADO', 'ENVIADO'] },
        });

        if (!cierreAyer) return { success: false, error: 'No hay cierre de ayer para copiar' };

        const registeredPozos = cierre.lecturas.map((l: any) => l.pozoId);
        let copied = 0;
        for (const lectura of cierreAyer.lecturas) {
          if (!registeredPozos.includes(lectura.pozoId)) {
            cierre.lecturas.push({
              ...lectura.toObject(),
              _id: undefined,
              horaRegistro: new Date(),
              comentarios: (lectura.comentarios || '') + ' (copiado de ayer)',
            });
            copied++;
          }
        }

        cierre.pozosRegistrados = cierre.lecturas.length;
        cierre.totalCrudo = cierre.lecturas.reduce((s: number, l: any) => s + (l.crudoBls || 0), 0);
        cierre.totalAgua = cierre.lecturas.reduce((s: number, l: any) => s + (l.aguaBls || 0), 0);
        cierre.pozosBombeando = cierre.lecturas.filter((l: any) => l.estadoPozo === 'BOMBEANDO').length;
        cierre.pozosParados = cierre.lecturas.filter((l: any) => l.estadoPozo === 'PARADO').length;
        cierre.kpiProduccion = cierre.potencialTotal > 0
          ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 1000) / 10
          : 0;

        await cierre.save();
        return {
          success: true,
          tipo: 'COPIADO_AYER',
          copiedCount: copied,
          totalRegistrados: cierre.pozosRegistrados,
          totalPozos: cierre.totalPozos,
          totalCrudo: cierre.totalCrudo,
        };
      }

      case 'NAVEGAR':
        return {
          success: true,
          tipo: 'NAVEGAR',
          pantalla: accion.pantalla,
          bateriaId: accion.bateriaId,
          pozoId: accion.pozoId,
        };

      case 'CERRAR_BATERIA':
        return { success: true, tipo: 'CERRAR_BATERIA', bateriaId: accion.bateriaId };

      default:
        return { success: false, error: `Acción desconocida: ${accion.tipo}` };
    }
  } catch (error: any) {
    console.error('executeAction error:', accion.tipo, error);
    return { success: false, error: error?.message || 'Error ejecutando acción' };
  }
}
