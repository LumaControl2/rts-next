import { NextRequest } from 'next/server';
import groq from '@/lib/groq';

// Shared prompt - same as voice-transcribe
const SYSTEM_PROMPT = `Eres un asistente experto en operaciones petroleras del Lote I en Talara, Piura, Perú. Interpretas lo que un operador de campo dicta sobre un pozo de bombeo mecánico.

CONTEXTO: 114 pozos en 7 baterías (BP 016/017/020/201/210/211/212). Sistemas: PUE, PUG, PL, GL. Producción: 1-26 bbl crudo/día, 0-108 bbl agua. Presiones: tubos 20-550 PSI, forros -5 a 45 PSI. GPM: 4-10. Carrera: 24-112 pulgadas.

JERGA:
- "bombeando"/"trabajando"/"normal" = BOMBEANDO
- "parado"/"no bombea"/"detenido"/"caído" = PARADO
- "crudo"/"petróleo"/"barriles"/"producción" = crudoBls
- "agua" = aguaBls
- "presión"/"tubos"/"tubing" = presionTubos (asumir tubos si solo dice "presión")
- "forros"/"casing"/"anular" = presionForros
- "golpes"/"GPM"/"emboladas" = gpm
- "carrera"/"stroke" = carrera (pulgadas)
- "de" separa valor: "3 de crudo" = 3, "30 de agua" = 30

CÓDIGOS DIFERIDA: M01=Falla Motor, M02=Falla Equipo, M06=Preventivo PU, M10=Preventivo Motor, M11=Cambio Correas, M13=Falla Variador, M27=Cambio Carrera, M32=Centrado PU, I02=Espera Pulling, I03=Intervenido Pulling, P02=Cerrado, P03=Sin producción, P05=Bloqueo gas, P12=Pump Off, N01=Corte energía, N03=Clima, N14=Lluvias

REGLAS:
- Números como palabras → convertir a dígitos
- Si solo dice "presión" → presionTubos
- Si PARADO → crudoBls=0
- Lo que no encaje → comentarios
- Si no dice estado → BOMBEANDO

RESPONDE SOLO JSON:
{"pozo":string|null,"estado":"BOMBEANDO"|"PARADO","crudoBls":number|null,"aguaBls":number|null,"presionTubos":number|null,"presionForros":number|null,"gpm":number|null,"carrera":number|null,"timerOn":number|null,"timerOff":number|null,"codigoDiferida":string|null,"comentarios":string}`;

export async function POST(request: NextRequest) {
  try {
    const { texto } = await request.json();

    if (!texto) {
      return Response.json({ error: 'texto es requerido' }, { status: 400 });
    }

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: texto },
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'No se obtuvo respuesta del modelo' }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    return Response.json({ data: parsed });
  } catch (error: any) {
    console.error('Voice-parse error:', error);
    return Response.json({ error: error?.message || 'Error al procesar texto' }, { status: 500 });
  }
}
