import { NextRequest } from 'next/server';
import groq from '@/lib/groq';
import { dbConnect } from '@/lib/mongodb';
import { getUserFromRequest } from '@/lib/authMiddleware';
import Cierre from '@/models/Cierre';
import Pozo from '@/models/Pozo';
import Bateria from '@/models/Bateria';
import Jornada from '@/models/Jornada';

const SYSTEM_PROMPT = `Eres el asistente de campo "RT NEXT" para operadores petroleros del Lote I en Talara, Piura, Perú.
Hablas español informal pero profesional. Eres conciso y directo como un compañero de campo experimentado.

Tu trabajo es:
1. EJECUTAR: registrar pozos, iniciar jornada, navegar a baterías, cerrar baterías
2. INFORMAR: decir qué pozos tiene una batería, cómo cerró ayer, cuántos faltan, rangos normales
3. ALERTAR: si un dato está fuera de rango normal, avisar al operador

Tienes acceso a TODA la información del campo en tiempo real: pozos, potenciales, datos de ayer, cierre activo, pozos pendientes.

SIEMPRE respondes con un JSON con esta estructura:
{
  "mensaje": "Lo que le dices al operador (texto corto, máximo 3 oraciones). Incluye datos concretos cuando informas.",
  "accion": null o un objeto de acción (ver abajo),
  "sugerencia": "Texto opcional de qué puede decir después el operador"
}

ACCIONES POSIBLES:
- {"tipo": "INICIAR_JORNADA", "datos": {"placa": "ABC-123", "kmInicio": 45230}}
- {"tipo": "NAVEGAR", "pantalla": "home" | "cierre", "bateriaId": "BP 210"}
- {"tipo": "REGISTRAR_POZO", "datos": {"pozoId": "17109", "crudoBls": 3, "aguaBls": 30, "presionTubos": 120, "presionForros": 0, "gpm": 6, "carrera": 64, "estadoPozo": "BOMBEANDO", "codigoDiferida": null, "comentarios": "cambió polea"}}
- {"tipo": "REGISTRAR_POZO_PARADO", "datos": {"pozoId": "4874", "estadoPozo": "PARADO", "codigoDiferida": "M06", "comentarios": "motor hace ruido"}}
- {"tipo": "COPIAR_AYER", "bateriaId": "BP 210"}
- {"tipo": "CERRAR_BATERIA", "bateriaId": "BP 210", "novedades": "texto"}
- {"tipo": "INFO", "consulta": "texto"} — cuando el operador pregunta algo sin acción

REGLAS DE ACCIÓN:
1. Si el operador dice "inicio turno" SIN placa y km: NO generes acción INICIAR_JORNADA. En su lugar pregúntale: "¿Cuál es la placa y el kilometraje inicial?" con accion: null. SOLO genera INICIAR_JORNADA cuando tenga AMBOS datos (placa Y km).
2. Si dice datos de un pozo, genera REGISTRAR_POZO con todos los campos que mencionó
3. Si dice "parado" + motivo, genera REGISTRAR_POZO_PARADO con el código de diferida correcto
4. Si dice "copiar ayer" o "los demás están igual", genera COPIAR_AYER
5. Si dice "cerrar batería" o "eso es todo", genera CERRAR_BATERIA
6. SIEMPRE confirma lo que registraste: repite los datos clave
7. Sé MUY conciso — el operador está en campo, no quiere leer párrafos

REGLAS DE CONSULTA (cuando el operador PREGUNTA algo):
8. "¿Qué pozos tiene la batería X?" → Lista los pozos con su potencial desde los DATOS proporcionados
9. "¿Cómo cerró el pozo X ayer?" → Busca en DATOS DE AYER y da los valores
10. "¿Cuál es el rango normal del pozo X?" → Da el potencial (crudo, agua, gas) y carrera del maestro
11. "¿Cuántos faltan?" → Lista los pozos PENDIENTES del cierre activo
12. "¿Cuántos llevo?" → Da el resumen: pozos registrados, crudo total, KPI
13. "¿Cómo va el día?" → Resumen de todos los cierres del día
14. "¿Qué pozos están parados?" → Lista pozos con estadoPozo=PARADO de hoy y ayer
15. Si pregunta algo y NO tienes datos, dilo honestamente: "No tengo esa información"
16. Para consultas, usa accion: {"tipo": "INFO"} — NO modifica nada, solo informa

REGLAS DE ALERTA:
17. Si el operador reporta presión > 2x el valor de ayer para ese pozo → alertar
18. Si reporta crudo = 0 pero dice "bombeando" → preguntar si está parado
19. Si el pozo estaba parado ayer y hoy reporta bombeando → confirmar: "¿ya se reparó?"

CÓDIGOS DE DIFERIDA:
M01=Falla Motor, M02=Falla Equipo, M03=Falla Motor Eléctrico, M04=Falla Motor Gas, M06=Preventivo PU, M09=Falla Reductor, M10=Preventivo Motor, M11=Cambio Correas, M13=Falla Variador, M15=Falla Tablero, M25=Falla Cabezal, M26=Cambio Empaquetadura, M27=Cambio Carrera, M28=Cambio Vástago, M32=Centrado PU, M33=Alineado
I02=Espera Pulling, I03=Intervenido Pulling, I10=Espera Definición
P02=Cerrado, P03=Sin producción, P05=Bloqueo gas, P12=Pump Off
N01=Corte energía externo, N03=Clima, N14=Lluvias

JERGA DE CAMPO:
- "crudo"/"petróleo"/"barriles" = crudoBls
- "agua" = aguaBls
- "presión"/"tubos" = presionTubos (asumir tubos si solo dice "presión")
- "forros"/"casing" = presionForros
- "golpes"/"GPM" = gpm
- "carrera" = carrera (pulgadas)
- "de" separa valor: "3 de crudo" = crudoBls:3
- Timer: convertir horas a minutos`;

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const auth = await getUserFromRequest(request);
    if (!auth) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const contextStr = formData.get('context') as string | null;
    const historyStr = formData.get('history') as string | null;

    if (!audioFile) {
      return Response.json({ error: 'Audio requerido' }, { status: 400 });
    }

    // 1. Transcribe audio with Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: 'es',
      response_format: 'json',
      prompt: 'Operador petrolero Lote I Talara. Pozos: 17109, 12280, 4874, 12289, 3821, 12255, 5264. Bombeando, parado, crudo, agua, presión tubos, forros, golpes por minuto, carrera, preventivo PU, falla motor, pulling, corte energía. Batería BP 210, BP 212, BP 016.',
    });

    const transcript = transcription.text;
    if (!transcript?.trim()) {
      return Response.json({ error: 'No se detectó voz' }, { status: 400 });
    }

    // 2. Build context for the assistant
    const context = contextStr ? JSON.parse(contextStr) : {};
    const history = historyStr ? JSON.parse(historyStr) : [];

    // Get real-time state from DB — RICH CONTEXT
    let dbContext = '';
    try {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      // 1. All batteries
      const baterias = await Bateria.find({ activa: true }).lean();

      // 2. All wells with potentials
      const allPozos = await Pozo.find({ activo: true, grupo: 'Basica' }).lean();

      // 3. Today's cierres
      const cierresHoy = await Cierre.find({
        fecha: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59Z') },
      }).lean();

      // 4. Yesterday's cierres (for "how did it close yesterday")
      const cierresAyer = await Cierre.find({
        fecha: { $gte: new Date(yesterdayStr), $lt: new Date(yesterdayStr + 'T23:59:59Z') },
        estado: { $in: ['APROBADO', 'ENVIADO'] },
      }).lean();

      // 5. Active jornada
      const jornada = await Jornada.findOne({
        operadorId: auth.userId,
        estado: 'ACTIVA',
      }).lean();

      // 6. Current active cierre
      const activeCierre = context.bateriaId
        ? cierresHoy.find((c: any) => c.bateriaId === context.bateriaId && (c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO'))
        : null;

      // Build battery summary with well counts
      const batSummary = baterias.map((b: any) => {
        const pozos = allPozos.filter((p: any) => p.bateria === b.codigo);
        const potTotal = pozos.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0);
        const cierre = cierresHoy.find((c: any) => c.bateriaId === b.codigo && c.estado !== 'APROBADO');
        const cierreAprobado = cierresHoy.find((c: any) => c.bateriaId === b.codigo && c.estado === 'APROBADO');
        return `${b.codigo} (${b.zona}): ${pozos.length} pozos, pot=${potTotal} BLS` +
          (cierre ? `, cierre ${cierre.estado} ${cierre.pozosRegistrados}/${cierre.totalPozos} pozos, crudo=${cierre.totalCrudo}` : '') +
          (cierreAprobado ? `, APROBADO crudo=${cierreAprobado.totalCrudo}` : '');
      }).join('\n  ');

      // Build detailed well list for current battery
      let wellDetail = '';
      if (context.bateriaId) {
        const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
        // Get yesterday's data for these wells
        const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
        const lecturasAyer = cierreAyer ? (cierreAyer as any).lecturas || [] : [];

        wellDetail = '\nPOZOS DE ' + context.bateriaId + ':\n' + bpozos.map((p: any) => {
          const lectAyer = lecturasAyer.find((l: any) => l.pozoId === p.numero);
          const lectHoy = activeCierre
            ? (activeCierre as any).lecturas?.find((l: any) => l.pozoId === p.numero)
            : null;

          let line = `  ${p.numero} | ${p.sistema} | Cat.${p.categoria} | Pot: crudo=${p.potencialCrudo} agua=${p.potencialAgua} gas=${p.potencialGas} | carrera=${p.carrera}`;
          if (lectAyer) {
            line += ` | AYER: crudo=${lectAyer.crudoBls} agua=${lectAyer.aguaBls} pTubos=${lectAyer.presionTubos} gpm=${lectAyer.gpm} estado=${lectAyer.estadoPozo}`;
            if (lectAyer.estadoPozo === 'PARADO') line += ` dif=${lectAyer.codigoDiferida}`;
          }
          if (lectHoy) {
            line += ` | HOY: crudo=${lectHoy.crudoBls} agua=${lectHoy.aguaBls} pTubos=${lectHoy.presionTubos} estado=${lectHoy.estadoPozo} [REGISTRADO]`;
          } else {
            line += ' | HOY: [PENDIENTE]';
          }
          return line;
        }).join('\n');
      }

      // Build registrados vs pendientes for active cierre
      let cierreDetail = '';
      if (activeCierre) {
        const registrados = (activeCierre as any).lecturas?.map((l: any) => l.pozoId) || [];
        const bpozos = allPozos.filter((p: any) => p.bateria === context.bateriaId);
        const pendientes = bpozos.filter((p: any) => !registrados.includes(p.numero)).map((p: any) => p.numero);
        cierreDetail = `\nCIERRE ACTIVO ${context.bateriaId}:
  ID: ${(activeCierre as any)._id}
  Registrados (${registrados.length}): ${registrados.join(', ') || 'ninguno'}
  Pendientes (${pendientes.length}): ${pendientes.join(', ') || 'todos registrados'}
  Totales: crudo=${(activeCierre as any).totalCrudo} agua=${(activeCierre as any).totalAgua} dif=${(activeCierre as any).totalDiferida}
  KPI: ${(activeCierre as any).kpiProduccion}%`;
      }

      // Production ranges (from yesterday's data across all batteries)
      let rangesInfo = '';
      if (context.bateriaId) {
        const cierreAyer = cierresAyer.find((c: any) => c.bateriaId === context.bateriaId);
        if (cierreAyer) {
          rangesInfo = `\nDATOS DE AYER ${context.bateriaId}:
  Crudo total: ${(cierreAyer as any).totalCrudo} BLS
  Agua total: ${(cierreAyer as any).totalAgua} BLS
  Diferida: ${(cierreAyer as any).totalDiferida} BLS
  Pozos parados: ${(cierreAyer as any).pozosParados}
  KPI: ${(cierreAyer as any).kpiProduccion}%`;
        }
      }

      dbContext = `
ESTADO ACTUAL DEL CAMPO:
Jornada: ${jornada ? `ACTIVA (placa: ${(jornada as any).vehiculo?.placa}, km: ${(jornada as any).vehiculo?.kmInicio}, actividades: ${(jornada as any).actividades?.length || 0})` : 'NO INICIADA'}
Pantalla actual: ${context.screen || 'desconocida'}
Batería seleccionada: ${context.bateriaId || 'ninguna'}

BATERÍAS DEL LOTE I:
  ${batSummary}
${wellDetail}
${cierreDetail}
${rangesInfo}

CAPACIDADES DE CONSULTA:
- Si preguntan por pozos de una batería, LISTAR los pozos con sus datos
- Si preguntan cómo cerró un pozo ayer, DAR los datos de ayer
- Si preguntan el potencial o rango normal, DAR los datos del maestro de pozos
- Si preguntan cuántos faltan, LISTAR los pendientes
- Si preguntan el resumen del día, DAR totales de todos los cierres`;
    } catch (err) {
      dbContext = '\nError cargando contexto: ' + (err instanceof Error ? err.message : 'desconocido');
    }

    // 3. Build conversation messages
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT + dbContext },
    ];

    // Add conversation history (last 10 turns)
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }

    // Add current transcription
    messages.push({ role: 'user', content: transcript });

    // 4. Get response from Llama
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'Sin respuesta del modelo' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    // 5. Execute action if any
    let actionResult: any = null;
    if (parsed.accion) {
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

async function executeAction(accion: any, userId: string, context: any) {
  try {
    switch (accion.tipo) {
      case 'INICIAR_JORNADA': {
        const placa = accion.datos?.placa;
        const kmInicio = accion.datos?.kmInicio;
        if (!placa) {
          return { success: false, error: 'Falta la placa del vehículo' };
        }
        // Check if there's already an active jornada
        const existing = await Jornada.findOne({ operadorId: userId, estado: 'ACTIVA' });
        if (existing) {
          return { success: false, error: 'Ya tiene una jornada activa' };
        }
        const jornada = await Jornada.create({
          fecha: new Date(),
          operadorId: userId,
          turno: new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DIA' : 'NOCHE',
          estado: 'ACTIVA',
          vehiculo: { placa: String(placa).toUpperCase(), kmInicio: kmInicio || 0 },
          actividades: [],
        });
        return { success: true, tipo: 'JORNADA_CREADA', id: jornada._id, placa, kmInicio };
      }

      case 'REGISTRAR_POZO': {
        if (!context.cierreId) return { success: false, error: 'No hay cierre activo' };

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

        // Calculate diferida
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
        return {
          success: true,
          tipo: 'POZO_REGISTRADO',
          pozo: datos.pozoId,
          pozosRegistrados: cierre.pozosRegistrados,
          totalPozos: cierre.totalPozos,
          totalCrudo: cierre.totalCrudo,
        };
      }

      case 'REGISTRAR_POZO_PARADO': {
        // Same as REGISTRAR_POZO but with PARADO state
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

        // Find yesterday's cierre for same battery
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        const cierreAyer = await Cierre.findOne({
          bateriaId: accion.bateriaId || cierre.bateriaId,
          fecha: { $gte: new Date(yesterdayStr), $lt: new Date(yesterdayStr + 'T23:59:59Z') },
          estado: { $in: ['APROBADO', 'ENVIADO'] },
        });

        if (!cierreAyer) return { success: false, error: 'No hay cierre de ayer para copiar' };

        // Copy lecturas that aren't already registered
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

        // Recalculate
        cierre.pozosRegistrados = cierre.lecturas.length;
        cierre.totalCrudo = cierre.lecturas.reduce((s: number, l: any) => s + (l.crudoBls || 0), 0);
        cierre.totalAgua = cierre.lecturas.reduce((s: number, l: any) => s + (l.aguaBls || 0), 0);
        cierre.pozosBombeando = cierre.lecturas.filter((l: any) => l.estadoPozo === 'BOMBEANDO').length;
        cierre.pozosParados = cierre.lecturas.filter((l: any) => l.estadoPozo === 'PARADO').length;
        cierre.kpiProduccion = cierre.potencialTotal > 0
          ? Math.round((cierre.totalCrudo / cierre.potencialTotal) * 1000) / 10
          : 0;

        await cierre.save();
        return { success: true, tipo: 'COPIADO_AYER', copiedCount: copied, totalRegistrados: cierre.pozosRegistrados };
      }

      case 'NAVEGAR':
        return { success: true, tipo: 'NAVEGAR', pantalla: accion.pantalla, bateriaId: accion.bateriaId };

      case 'INFO':
        return { success: true, tipo: 'INFO' };

      default:
        return { success: false, error: `Acción desconocida: ${accion.tipo}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
