import { NextRequest } from 'next/server';
import groq from '@/lib/groq';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';
import Pozo from '@/models/Pozo';
import Bateria from '@/models/Bateria';
import Jornada from '@/models/Jornada';
import CodigoDiferida from '@/models/CodigoDiferida';

// ─── SYSTEM PROMPT: AGENT WITH MULTI-ACTION ────────────────────

const SYSTEM_PROMPT = `Eres MATHIUS, asistente inteligente de campo para operadores petroleros del Lote I (Consorcio Panda Energy) en Talara, Piura, Perú.
Eres conciso, directo y confiable. Hablas como un compañero de campo experimentado.

CAPACIDAD CRÍTICA — MULTI-ACCIÓN:
Puedes ejecutar VARIAS acciones en un solo comando. Si el operador dice algo complejo, descomponlo en pasos.
Ejemplos:
- "Sal de la 16 y entra a la 20" → 1 acción: navegar a BP 020
- "Entra a la 20 y dime qué falta" → 2 acciones: navegar a BP 020 + consulta pendientes
- "Registra el 17109 con 3 crudo 30 agua 120 presión y pasa al siguiente" → 2 acciones: registrar + navegar al siguiente
- "Copia los de ayer y cierra la batería" → 2 acciones: copiar + cerrar

FORMATO DE RESPUESTA — siempre JSON:
{
  "mensaje": "Texto corto para el operador (máx 3 oraciones). Datos concretos, sin relleno.",
  "acciones": [
    {"tipo": "ACCION_1", ...params},
    {"tipo": "ACCION_2", ...params}
  ],
  "sugerencias": ["frase 1", "frase 2", "frase 3"]
}

REGLAS:
- "acciones" es SIEMPRE un array (puede tener 0, 1 o más acciones)
- Si solo informa sin modificar: "acciones": []
- Si hay múltiples pasos: ponlos EN ORDEN de ejecución
- SIEMPRE incluye 2-4 sugerencias contextuales
- Sé MUY conciso — operador en campo bajo el sol

ACCIONES DISPONIBLES:

NAVEGAR — ir a cualquier pantalla:
  {"tipo": "NAVEGAR", "pantalla": "home"}
  {"tipo": "NAVEGAR", "pantalla": "cierre", "bateriaId": "BP 210"}
  {"tipo": "NAVEGAR", "pantalla": "pozo", "bateriaId": "BP 210", "pozoId": "17109"}
  {"tipo": "NAVEGAR", "pantalla": "tanques", "bateriaId": "BP 210"}
  {"tipo": "NAVEGAR", "pantalla": "resumen", "bateriaId": "BP 210"}
  {"tipo": "NAVEGAR", "pantalla": "jornada"}

REGISTRAR POZO BOMBEANDO:
  {"tipo": "REGISTRAR_POZO", "datos": {"pozoId": "17109", "crudoBls": 3, "aguaBls": 30, "presionTubos": 120, "presionForros": 0, "gpm": 6, "carrera": 64, "estadoPozo": "BOMBEANDO"}}

REGISTRAR POZO PARADO:
  {"tipo": "REGISTRAR_POZO_PARADO", "datos": {"pozoId": "4874", "estadoPozo": "PARADO", "codigoDiferida": "M06", "comentarios": "motor hace ruido"}}

OTRAS:
  {"tipo": "INICIAR_JORNADA", "datos": {"placa": "ABC-123", "kmInicio": 45230}}
  {"tipo": "COPIAR_AYER", "bateriaId": "BP 210"}
  {"tipo": "CERRAR_BATERIA", "bateriaId": "BP 210"}

INTELIGENCIA DE COMANDO COMPUESTO:
- "vamos a la 210 y empieza con el primer pozo" → navegar a cierre BP 210 + navegar al primer pozo pendiente
- "el 17109 igual que ayer" → registrar con los MISMOS datos de ayer (TODOS los campos de ayer)
- "los que faltan igual que ayer" → COPIAR_AYER
- "retrocede" / "volver" / "atrás" → navegar a la pantalla anterior lógica (pozo→batería, batería→home)
- "siguiente" / "el que sigue" → navegar al siguiente pozo PENDIENTE
- "salta este" → navegar al siguiente pozo pendiente SIN registrar el actual
- "repite" / "lo mismo" → registrar el pozo actual con los mismos datos del pozo anterior
- "cambia de batería" / "ahora la 20" → navegar al cierre de esa batería

CUANDO EL OPERADOR REPORTA UN POZO:
- Si NO dice gpm, carrera, presionForros → usa los valores de AYER para ese pozo
- Si NO hay datos de ayer → gpm=6, carrera=valor del maestro, presionForros=0
- Si dice "igual que ayer" para un pozo → copia TODOS los valores de ayer
- SIEMPRE confirma: "Pozo X: Y crudo, Z agua, W presión. Van N/T."

CUANDO EL OPERADOR PREGUNTA:
- Responde con datos EXACTOS del contexto proporcionado
- Incluye números, no generalidades
- Si pregunta por una batería donde NO está: dame los datos igualmente del contexto

ALERTAS AUTOMÁTICAS (incluir en el mensaje si detectas):
- Presión > 2x ayer → "⚠️ Presión alta vs ayer"
- Crudo = 0 + bombeando → "¿Seguro que bombea con crudo 0?"
- Pozo parado ayer, hoy bombeando → "¿Se reparó? Ayer parado por X"
- Crudo > 2x potencial → "⚠️ Crudo sobre el doble del potencial"

CÓDIGOS DE DIFERIDA (relacionar con jerga):
"preventivo"=M06, "motor"=M01, "equipo"=M02, "eléctrico"=M03, "gas"=M04, "reductor"=M09, "correas"=M11, "variador"=M13, "tablero"=M15, "cabezal"=M25, "empaquetadura"=M26, "carrera"=M27, "vástago"=M28, "centrado"=M32, "alineado"=M33
"pulling"/"espera pulling"=I02, "intervenido"=I03, "espera definición"=I10
"cerrado"=P02, "sin producción"=P03, "bloqueo gas"=P05, "pump off"=P12
"corte luz"/"corte energía"=N01, "clima"=N03, "lluvia"=N14

JERGA → CAMPOS:
crudo/petróleo/barriles/aceite=crudoBls, agua=aguaBls, presión/tubos=presionTubos, forros/casing=presionForros, golpes/GPM=gpm, carrera=carrera, "3 de crudo"=crudoBls:3, "30 de agua"=aguaBls:30`;

const WHISPER_PROMPT = `Mathius es el asistente de campo. Operador petrolero del Lote I, Talara, Perú. Consorcio Panda Energy.
Pozos: 17109, 12280, 4874, 12289, 3821, 12255, 5264, 3824, 12281, 3832, 4878, 12284, 17110, 12285, 3833, 12286, 12270, 12271, 6784, 3847, 6785, 3848, 6786, 12273, 6787, 6303, 6800, 6801, 12253, 12256, 6304, 4851, 4857, 4862, 4864, 4865, 7356, 7357, 7358, 7359, 4841, 4843, 4846, 4848, 12236, 12240, 12241, 12243, 12249, 12250, 3810, 3811, 3812, 3813, 3814, 12238, 12244, 12245, 12246, 12248.
Baterías: BP 210, BP 212, BP 016, BP 020, BP 017, BP 019, BP 021.
Bombeando, parado, crudo, agua, presión tubos, forros, golpes por minuto, carrera, preventivo, falla motor, pulling, corte energía, diferida, pump off, variador, retrocede, siguiente, volver, igual que ayer, copia.`;

// ─── MAIN HANDLER ──────────────────────────────────────────────

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

    const context = contextStr ? JSON.parse(contextStr) : {};
    const history = historyStr ? JSON.parse(historyStr) : [];

    // Build rich DB context
    const dbContext = await buildDbContext(auth.userId, context);

    // Build messages
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + dbContext },
    ];
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: transcript });

    // Get AI response
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'Sin respuesta del modelo' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    // Normalize: support both old "accion" and new "acciones" format
    let acciones: any[] = [];
    if (Array.isArray(parsed.acciones)) {
      acciones = parsed.acciones.filter((a: any) => a && a.tipo);
    } else if (parsed.accion && parsed.accion.tipo && parsed.accion.tipo !== 'INFO') {
      acciones = [parsed.accion];
    }

    // Execute ALL actions in sequence
    const actionResults: any[] = [];
    for (const accion of acciones) {
      if (accion.tipo === 'INFO') continue;
      const result = await executeAction(accion, auth.userId, context);
      actionResults.push({ tipo: accion.tipo, ...result });
      // Update context for chained actions (e.g., navigate then query)
      if (accion.tipo === 'NAVEGAR' && accion.bateriaId) {
        context.bateriaId = accion.bateriaId;
        if (accion.pozoId) context.pozoId = accion.pozoId;
        // Fetch cierreId for the new battery
        const today = new Date().toISOString().slice(0, 10);
        const cierre = await Cierre.findOne({
          bateriaId: accion.bateriaId,
          fecha: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59Z') },
          estado: { $in: ['EN_PROGRESO', 'RECHAZADO'] },
        });
        if (cierre) context.cierreId = cierre._id.toString();
      }
    }

    return Response.json({
      transcript,
      response: parsed,
      actionResults,
    });
  } catch (error: any) {
    console.error('Assistant error:', error);
    return Response.json({ error: error?.message || 'Error del asistente' }, { status: 500 });
  }
}

// ─── DB CONTEXT BUILDER ────────────────────────────────────────

async function buildDbContext(userId: string, context: any): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const [baterias, allPozos, cierresHoy, cierresAyer, jornada] = await Promise.all([
      Bateria.find({ activa: true }).lean(),
      Pozo.find({ activo: true, grupo: 'Basica' }).lean(),
      Cierre.find({ fecha: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59Z') } }).lean(),
      Cierre.find({ fecha: { $gte: new Date(yesterdayStr), $lt: new Date(yesterdayStr + 'T23:59:59Z') }, estado: { $in: ['APROBADO', 'ENVIADO'] } }).lean(),
      Jornada.findOne({ operadorId: userId, estado: 'ACTIVA' }).lean(),
    ]);

    const activeCierre = context.bateriaId
      ? cierresHoy.find((c: any) => c.bateriaId === context.bateriaId && (c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO'))
      : null;

    // Battery summary
    const batLines = baterias.map((b: any) => {
      const pozos = allPozos.filter((p: any) => p.bateria === b.codigo);
      const potTotal = pozos.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0);
      const cierre = cierresHoy.find((c: any) => c.bateriaId === b.codigo);
      const estado = cierre ? cierre.estado : 'SIN_INICIAR';
      const reg = cierre ? `${(cierre as any).pozosRegistrados || 0}/${(cierre as any).totalPozos || pozos.length}` : `0/${pozos.length}`;
      const crudo = cierre ? (cierre as any).totalCrudo || 0 : 0;
      return `  ${b.codigo}(${b.zona}): ${pozos.length}pozos pot=${potTotal} ${estado} ${reg} crudo=${crudo}`;
    }).join('\n');

    // Well detail for current battery
    let wellDetail = '';
    if (context.bateriaId) {
      const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
      const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
      const lecturasAyer = cierreAyer ? (cierreAyer as any).lecturas || [] : [];

      wellDetail = `\nPOZOS ${context.bateriaId} (${bpozos.length}):\n` + bpozos.map((p: any) => {
        const la = lecturasAyer.find((l: any) => l.pozoId === p.numero);
        const lh = activeCierre ? (activeCierre as any).lecturas?.find((l: any) => l.pozoId === p.numero) : null;
        let line = `  ${p.numero}|${p.sistema}|Pot:${p.potencialCrudo}c/${p.potencialAgua || 0}a|carr=${p.carrera}`;
        if (la) {
          line += `|AYER:${la.crudoBls}c/${la.aguaBls}a/p${la.presionTubos}/g${la.gpm}/${la.estadoPozo}`;
          if (la.estadoPozo === 'PARADO') line += `(${la.codigoDiferida})`;
        }
        line += lh ? `|HOY:${lh.crudoBls}c/${lh.aguaBls}a/${lh.estadoPozo}✓` : '|PENDIENTE';
        return line;
      }).join('\n');
    }

    // Active cierre detail
    let cierreDetail = '';
    if (activeCierre) {
      const regs = (activeCierre as any).lecturas?.map((l: any) => l.pozoId) || [];
      const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
      const pends = bpozos.filter((p: any) => !regs.includes(p.numero)).map((p: any) => p.numero);
      const parados = (activeCierre as any).lecturas?.filter((l: any) => l.estadoPozo === 'PARADO') || [];
      cierreDetail = `\nCIERRE ${context.bateriaId}: ID=${(activeCierre as any)._id}
  Registrados:${regs.length}/${bpozos.length} [${regs.join(',')}]
  PENDIENTES:${pends.length} [${pends.join(',')}]
  SIGUIENTE:${pends[0] || 'TODOS_REGISTRADOS'}
  Crudo=${(activeCierre as any).totalCrudo} Agua=${(activeCierre as any).totalAgua} Dif=${(activeCierre as any).totalDiferida} KPI=${(activeCierre as any).kpiProduccion}%`;
      if (parados.length > 0) cierreDetail += `\n  Parados: ${parados.map((l: any) => `${l.pozoId}(${l.codigoDiferida})`).join(',')}`;
    }

    // Yesterday's battery summary
    let ayerDetail = '';
    if (context.bateriaId) {
      const ca = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId) as any;
      if (ca) ayerDetail = `\nAYER ${context.bateriaId}: crudo=${ca.totalCrudo} agua=${ca.totalAgua} dif=${ca.totalDiferida} parados=${ca.pozosParados} KPI=${ca.kpiProduccion}%`;
    }

    // Pozo detail
    let pozoDetail = '';
    if (context.pozoId) {
      const p = allPozos.find((px: any) => px.numero === context.pozoId) as any;
      if (p) {
        pozoDetail = `\nPOZO_ACTUAL ${p.numero}: ${p.sistema}|Cat.${p.categoria}|Pot:${p.potencialCrudo}c/${p.potencialAgua}a/${p.potencialGas}g|carr=${p.carrera}`;
        const ca = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId) as any;
        const la = ca?.lecturas?.find((l: any) => l.pozoId === p.numero);
        if (la) {
          pozoDetail += `\n  AYER: crudo=${la.crudoBls} agua=${la.aguaBls} pTubos=${la.presionTubos} pForros=${la.presionForros || 0} gpm=${la.gpm} carrera=${la.carrera || p.carrera} estado=${la.estadoPozo}`;
          if (la.estadoPozo === 'PARADO') pozoDetail += ` dif=${la.codigoDiferida}`;
        }
      }
    }

    // Day totals
    const crudoDia = cierresHoy.reduce((s, c: any) => s + (c.totalCrudo || 0), 0);
    const batCerradas = cierresHoy.filter((c: any) => c.estado === 'ENVIADO' || c.estado === 'APROBADO').length;

    // Navigation context
    const screen = context.screen || '';
    let navHint = '';
    if (screen.includes('/pozo/')) navHint = 'PANTALLA: formulario de pozo. "retrocede"→batería, "siguiente"→próximo pozo pendiente.';
    else if (screen.includes('/tanques')) navHint = 'PANTALLA: tanques. "retrocede"→batería, "resumen"→ver resumen.';
    else if (screen.includes('/resumen')) navHint = 'PANTALLA: resumen. "retrocede"→batería, "enviar"→enviar al supervisor.';
    else if (screen.includes('/cierre/')) navHint = 'PANTALLA: lista de pozos de batería. "retrocede"→home, "pozo X"→ir a formulario.';
    else if (screen === '/home' || screen.includes('/home')) navHint = 'PANTALLA: inicio. Puede ir a cualquier batería o iniciar jornada.';
    else if (screen.includes('/jornada')) navHint = 'PANTALLA: jornada. Puede ir a baterías o ver resumen del día.';

    return `

CAMPO — ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
Jornada: ${jornada ? `ACTIVA placa=${(jornada as any).vehiculo?.placa} km=${(jornada as any).vehiculo?.kmInicio}` : 'NO_INICIADA'}
${navHint}
Batería: ${context.bateriaId || 'ninguna'}
Día: crudo=${crudoDia}BLS cerradas=${batCerradas}/7

BATERÍAS:
${batLines}
${wellDetail}
${cierreDetail}
${ayerDetail}
${pozoDetail}`;
  } catch (err) {
    console.error('buildDbContext error:', err);
    return '\nError cargando contexto: ' + (err instanceof Error ? err.message : 'desconocido');
  }
}

// ─── ACTION EXECUTOR ───────────────────────────────────────────

async function executeAction(accion: any, userId: string, context: any) {
  try {
    switch (accion.tipo) {
      case 'INICIAR_JORNADA': {
        const placa = accion.datos?.placa;
        const kmInicio = accion.datos?.kmInicio;
        if (!placa) return { success: false, error: 'Diga la placa del vehículo' };
        const existing = await Jornada.findOne({ operadorId: userId, estado: 'ACTIVA' });
        if (existing) {
          return { success: true, tipo: 'JORNADA_CREADA', id: existing._id, placa: (existing as any).vehiculo?.placa, kmInicio: (existing as any).vehiculo?.kmInicio, yaExistia: true };
        }
        const jornada = await Jornada.create({
          fecha: new Date(), operadorId: userId,
          turno: new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DIA' : 'NOCHE',
          estado: 'ACTIVA',
          vehiculo: { placa: String(placa).toUpperCase(), kmInicio: kmInicio || 0 },
          actividades: [],
          resumen: { kmRecorridos: 0, totalActividades: 0, pozosVisitados: 0, bateriasCerradas: 0, tiempoTotal: 0, fotosTomadas: 0 },
        });
        return { success: true, tipo: 'JORNADA_CREADA', id: jornada._id, placa: String(placa).toUpperCase(), kmInicio: kmInicio || 0 };
      }

      case 'REGISTRAR_POZO': {
        if (!context.cierreId) return { success: false, error: 'No hay cierre activo. Navegue a una batería.' };
        const cierre = await Cierre.findById(context.cierreId);
        if (!cierre || cierre.estado === 'APROBADO') return { success: false, error: 'Cierre no disponible' };

        const datos = accion.datos;
        const existingIdx = cierre.lecturas.findIndex((l: any) => l.pozoId === datos.pozoId);

        const lecturaData = {
          pozoId: datos.pozoId,
          crudoBls: datos.crudoBls ?? 0, aguaBls: datos.aguaBls ?? 0,
          presionTubos: datos.presionTubos ?? 0, presionForros: datos.presionForros ?? 0,
          gpm: datos.gpm ?? 0, carrera: datos.carrera ?? 64,
          timerOn: datos.timerOn ?? 0, timerOff: datos.timerOff ?? 0,
          estadoPozo: datos.estadoPozo || 'BOMBEANDO',
          codigoDiferida: datos.codigoDiferida || null,
          comentarioDiferida: datos.comentarios || '', comentarios: datos.comentarios || '',
          fotos: [], horaRegistro: new Date(), gpsLat: 0, gpsLng: 0,
        };

        if (existingIdx >= 0) cierre.lecturas[existingIdx] = { ...cierre.lecturas[existingIdx], ...lecturaData };
        else cierre.lecturas.push(lecturaData);

        // Recalculate
        const lects = cierre.lecturas;
        cierre.totalCrudo = lects.reduce((s: number, l: any) => s + (l.crudoBls || 0), 0);
        cierre.totalAgua = lects.reduce((s: number, l: any) => s + (l.aguaBls || 0), 0);
        cierre.pozosRegistrados = lects.length;
        cierre.pozosBombeando = lects.filter((l: any) => l.estadoPozo === 'BOMBEANDO').length;
        cierre.pozosParados = lects.filter((l: any) => l.estadoPozo === 'PARADO').length;

        const paradoIds = lects.filter((l: any) => l.estadoPozo === 'PARADO').map((l: any) => l.pozoId);
        if (paradoIds.length > 0) {
          const pp = await Pozo.find({ numero: { $in: paradoIds } });
          cierre.totalDiferida = pp.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0);
        } else cierre.totalDiferida = 0;
        cierre.kpiProduccion = cierre.potencialTotal > 0 ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 1000) / 10 : 0;

        await cierre.save();

        const allPozos = await Pozo.find({ bateria: cierre.bateriaId, activo: true, grupo: 'Basica' }).lean();
        const regIds = cierre.lecturas.map((l: any) => l.pozoId);
        const nextPending = allPozos.find((p: any) => !regIds.includes(p.numero));

        return {
          success: true, tipo: 'POZO_REGISTRADO', pozo: datos.pozoId,
          pozosRegistrados: cierre.pozosRegistrados, totalPozos: cierre.totalPozos,
          totalCrudo: cierre.totalCrudo, kpi: cierre.kpiProduccion,
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
        const ys = yesterday.toISOString().slice(0, 10);
        const cierreAyer = await Cierre.findOne({
          bateriaId: accion.bateriaId || cierre.bateriaId,
          fecha: { $gte: new Date(ys), $lt: new Date(ys + 'T23:59:59Z') },
          estado: { $in: ['APROBADO', 'ENVIADO'] },
        });
        if (!cierreAyer) return { success: false, error: 'No hay cierre de ayer' };

        const regPozos = cierre.lecturas.map((l: any) => l.pozoId);
        let copied = 0;
        for (const lect of cierreAyer.lecturas) {
          if (!regPozos.includes(lect.pozoId)) {
            cierre.lecturas.push({ ...lect.toObject(), _id: undefined, horaRegistro: new Date(), comentarios: (lect.comentarios || '') + ' (copiado)' });
            copied++;
          }
        }

        cierre.pozosRegistrados = cierre.lecturas.length;
        cierre.totalCrudo = cierre.lecturas.reduce((s: number, l: any) => s + (l.crudoBls || 0), 0);
        cierre.totalAgua = cierre.lecturas.reduce((s: number, l: any) => s + (l.aguaBls || 0), 0);
        cierre.pozosBombeando = cierre.lecturas.filter((l: any) => l.estadoPozo === 'BOMBEANDO').length;
        cierre.pozosParados = cierre.lecturas.filter((l: any) => l.estadoPozo === 'PARADO').length;
        cierre.kpiProduccion = cierre.potencialTotal > 0 ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 1000) / 10 : 0;
        await cierre.save();

        return { success: true, tipo: 'COPIADO_AYER', copiedCount: copied, totalRegistrados: cierre.pozosRegistrados, totalPozos: cierre.totalPozos, totalCrudo: cierre.totalCrudo };
      }

      case 'NAVEGAR':
        return { success: true, tipo: 'NAVEGAR', pantalla: accion.pantalla, bateriaId: accion.bateriaId, pozoId: accion.pozoId };

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
