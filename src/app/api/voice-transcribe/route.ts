import { NextRequest } from 'next/server';
import groq from '@/lib/groq';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return Response.json({ error: 'audio file is required' }, { status: 400 });
    }

    // Transcribe with Whisper via Groq
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: 'es',
      response_format: 'json',
    });

    const texto = transcription.text;

    if (!texto || !texto.trim()) {
      return Response.json({ error: 'No se detectó voz en el audio' }, { status: 400 });
    }

    // Now parse with Llama
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
- Si dice motivo de parada, busca el código: M01=Falla Motor, M02=Falla Equipo, M06=Preventivo PU, M10=Preventivo Motor, M27=Cambio Carrera, M32=Centrado PU, I02=Espera Pulling, I03=Intervenido Pulling, P02=Pozo cerrado, P03=Sin producción, N01=Corte energía, N14=Lluvias
- Si no reconoces un campo, ponlo en comentarios
- Responde SOLO el JSON`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: texto },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: 'No se obtuvo respuesta del modelo' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    return Response.json({
      data: parsed,
      transcript: texto,
    });
  } catch (error: any) {
    console.error('Voice-transcribe error:', error);
    return Response.json(
      { error: error?.message || 'Error al procesar audio' },
      { status: 500 }
    );
  }
}
