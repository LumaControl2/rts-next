// ============================================================
// RT NEXT — POST /api/voice-parse
// ============================================================

import { NextRequest } from 'next/server';
import groq from '@/lib/groq';

const SYSTEM_PROMPT = `Eres un asistente de captura de datos para operaciones petroleras en el Lote I, Talara, Perú.
El operador de campo te dictará información sobre un pozo. Extrae los datos y devuelve SOLO un JSON:
{
  "pozo": "número del pozo o null",
  "estado": "BOMBEANDO o PARADO",
  "crudoBls": número o null,
  "aguaBls": número o null,
  "presionTubos": número o null,
  "presionForros": número o null,
  "gpm": número o null,
  "carrera": número o null,
  "timerOn": número en minutos o null,
  "timerOff": número en minutos o null,
  "codigoDiferida": código más probable o null,
  "comentarios": texto libre con observaciones
}
Reglas:
- "crudo","petróleo","barriles" = crudoBls
- "agua" = aguaBls
- "presión","tubos","tubing" = presionTubos
- "forros","casing" = presionForros
- "golpes","GPM" = gpm
- "parado","no bombea","detenido" = estado PARADO
- Si dice motivo de parada, busca el código: M01=Falla Motor, M06=Preventivo PU, M27=Cambio Carrera, I02=Espera Pulling, P02=Pozo cerrado, P03=Sin producción, N01=Corte energía
- Si no reconoces un campo, ponlo en comentarios
- Responde SOLO el JSON`;

export async function POST(request: NextRequest) {
  try {
    const { texto } = await request.json();

    if (!texto) {
      return Response.json(
        { error: 'texto es requerido' },
        { status: 400 }
      );
    }

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: texto },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return Response.json(
        { error: 'No se obtuvo respuesta del modelo' },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content);

    return Response.json({ data: parsed });
  } catch (error) {
    console.error('Voice-parse error:', error);
    return Response.json(
      { error: 'Error al procesar texto de voz' },
      { status: 500 }
    );
  }
}
