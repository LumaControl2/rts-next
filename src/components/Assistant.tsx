'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { emitAssistantEvent } from '@/lib/events';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionLabel?: string;
  actionSuccess?: boolean;
}

export default function Assistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();

  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derive context from URL
  const getContext = useCallback(() => {
    const parts = pathname.split('/');
    const ctx: any = { screen: pathname };
    if (parts[1] === 'cierre' && parts[2]) ctx.bateriaId = decodeURIComponent(parts[2]);
    if (parts[3] === 'pozo' && parts[4]) ctx.pozoId = decodeURIComponent(parts[4]);
    return ctx;
  }, [pathname]);

  // Fetch cierreId for current battery
  const getCierreId = useCallback(async () => {
    const ctx = getContext();
    if (!ctx.bateriaId || !token) return null;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(ctx.bateriaId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const arr = json.data || json;
      if (Array.isArray(arr)) {
        const editable = arr.find((c: any) => c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO');
        return editable?._id || null;
      }
    } catch {}
    return null;
  }, [getContext, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // TTS
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-PE';
    u.rate = 1.15;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  // Execute action returned by the AI — THIS IS WHERE THE REAL WORK HAPPENS
  const executeAction = useCallback(async (accion: any, actionResult: any): Promise<{ label: string; success: boolean }> => {
    if (!accion) return { label: '', success: false };

    const tipo = accion.tipo;

    // NAVEGAR — actually navigate
    if (tipo === 'NAVEGAR') {
      const target = accion.pantalla === 'cierre' && accion.bateriaId
        ? `/cierre/${encodeURIComponent(accion.bateriaId)}`
        : accion.pantalla === 'jornada' ? '/jornada'
        : '/home';
      setTimeout(() => router.push(target), 500);
      return { label: `📍 Navegando a ${accion.bateriaId || accion.pantalla}`, success: true };
    }

    // INICIAR_JORNADA — created by backend with placa+km
    if (tipo === 'INICIAR_JORNADA') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'JORNADA_CREADA', payload: actionResult });
        setTimeout(() => {
          router.push('/jornada');
          emitAssistantEvent({ type: 'DATOS_CAMBIARON' });
        }, 800);
        const label = actionResult.yaExistia
          ? `🚗 Jornada ya activa (${actionResult.placa})`
          : `🚗 Jornada iniciada — ${actionResult.placa}, km ${actionResult.kmInicio}`;
        return { label, success: true };
      }
      return { label: `❌ ${actionResult?.error || 'Error al iniciar jornada'}`, success: false };
    }

    // REGISTRAR_POZO — already saved by backend
    if (tipo === 'REGISTRAR_POZO' || tipo === 'REGISTRAR_POZO_PARADO') {
      if (actionResult?.success) {
        emitAssistantEvent({
          type: 'POZO_REGISTRADO',
          payload: {
            pozo: actionResult.pozo,
            pozosRegistrados: actionResult.pozosRegistrados,
            totalPozos: actionResult.totalPozos,
            totalCrudo: actionResult.totalCrudo,
          },
        });
        const emoji = tipo === 'REGISTRAR_POZO_PARADO' ? '🔴' : '✅';
        return {
          label: `${emoji} Pozo ${actionResult.pozo}: ${actionResult.pozosRegistrados}/${actionResult.totalPozos}`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'Error al registrar pozo'}`, success: false };
    }

    // COPIAR_AYER
    if (tipo === 'COPIAR_AYER') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'DATOS_CAMBIARON', payload: actionResult });
        return {
          label: `📋 Copiados ${actionResult.copiedCount} pozos de ayer (total: ${actionResult.totalRegistrados})`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'No hay datos de ayer'}`, success: false };
    }

    // CERRAR_BATERIA
    if (tipo === 'CERRAR_BATERIA') {
      // Navigate to resumen
      const ctx = getContext();
      if (ctx.bateriaId) {
        setTimeout(() => router.push(`/cierre/${encodeURIComponent(ctx.bateriaId)}/resumen`), 500);
        return { label: '📊 Abriendo resumen para enviar', success: true };
      }
    }

    return { label: `ℹ️ ${tipo}`, success: true };
  }, [router, getContext]);

  // Main record + process flow
  async function handleRecord() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    setError('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Permita el micrófono');
      return;
    }

    audioChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setRecording(false);

      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (blob.size < 1000) { setError('Muy corto — hable más'); return; }

      setProcessing(true);

      try {
        // Get current cierreId
        const cierreId = await getCierreId();
        const ctx = { ...getContext(), cierreId };

        const fd = new FormData();
        fd.append('audio', blob, 'rec.webm');
        fd.append('context', JSON.stringify(ctx));
        fd.append('history', JSON.stringify(messages.slice(-8).map(m => ({ role: m.role, content: m.content }))));

        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || 'Error del asistente');
          setProcessing(false);
          return;
        }

        // User message
        const userMsg: Message = { role: 'user', content: json.transcript || '...', timestamp: new Date() };

        // Execute action and get result label
        let actionLabel = '';
        let actionSuccess = false;
        if (json.response?.accion) {
          const result = await executeAction(json.response.accion, json.actionResult);
          actionLabel = result.label;
          actionSuccess = result.success;
        }

        // Assistant message
        const botMsg: Message = {
          role: 'assistant',
          content: json.response?.mensaje || 'No entendí, repita por favor.',
          timestamp: new Date(),
          actionLabel,
          actionSuccess,
        };

        setMessages(prev => [...prev, userMsg, botMsg]);

        // Speak
        if (json.response?.mensaje) speak(json.response.mensaje);

      } catch {
        setError('Error de conexión');
      } finally {
        setProcessing(false);
      }
    };

    mr.start();
    setRecording(true);
    setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 30000);
  }

  if (!user || !token || pathname === '/') return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed z-50 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all',
          'bottom-20 right-4',
          open ? 'bg-[#ef4444] scale-90' : speaking ? 'bg-[#22c55e] animate-pulse' : 'bg-[#22d3ee]',
        )}
      >
        <span className="text-2xl">{open ? '✕' : '🤖'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 bottom-[8.5rem] right-3 left-3 sm:left-auto sm:w-[400px] bg-[#0d1f3c] border border-[#22d3ee]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '55vh' }}>
          {/* Header */}
          <div className="bg-[#22d3ee]/10 border-b border-[#22d3ee]/20 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-[#22d3ee]/20 flex items-center justify-center text-lg">🤖</div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Asistente RT NEXT</p>
              <p className="text-[#22d3ee] text-xs truncate">
                {recording ? '🔴 Grabando...' : processing ? '⚡ Procesando...' : speaking ? '🔊 Hablando...' : '● Listo'}
              </p>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-[#94a3b8] text-xs px-2 py-1 rounded hover:bg-white/5">Limpiar</button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ minHeight: '160px' }}>
            {messages.length === 0 && (
              <div className="text-center py-6 px-2">
                <p className="text-3xl mb-3">🤖</p>
                <p className="text-white text-sm font-medium mb-1">Hola {user.nombre?.split(' ')[0]}!</p>
                <p className="text-[#94a3b8] text-xs mb-4">Soy tu asistente de campo. Háblame y yo ejecuto las acciones.</p>
                <div className="space-y-1.5 text-left bg-[#112240] rounded-xl p-3">
                  <p className="text-[#22d3ee] text-[11px] font-bold uppercase mb-1">Puedo hacer:</p>
                  <p className="text-[#94a3b8] text-xs">🚗 &ldquo;Inicio turno, placa ABC-123, km 45230&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">📋 &ldquo;Vamos a la batería 210&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">✅ &ldquo;Pozo 17109, bombeando, 3 crudo, 30 agua, presión 120&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">🔴 &ldquo;El 4874 está parado por preventivo&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">📋 &ldquo;Copia los datos de ayer&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">📊 &ldquo;Cierra la batería&rdquo;</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user'
                    ? 'bg-[#22d3ee]/15 text-white rounded-br-sm'
                    : 'bg-[#1a2d4a] text-white rounded-bl-sm'
                )}>
                  <p className="text-[13px] leading-relaxed">{msg.content}</p>
                  {msg.actionLabel && (
                    <div className={cn(
                      'mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                      msg.actionSuccess ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]'
                    )}>
                      {msg.actionLabel}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {processing && (
              <div className="flex justify-start">
                <div className="bg-[#1a2d4a] rounded-2xl px-4 py-3 rounded-bl-sm flex gap-1.5">
                  <div className="w-2 h-2 bg-[#22d3ee] rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-[#22d3ee] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#22d3ee] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-[#ef4444]/15 border-t border-[#ef4444]/30 shrink-0">
              <p className="text-[#ef4444] text-xs">{error}</p>
            </div>
          )}

          {/* Record */}
          <div className="border-t border-[#22d3ee]/20 px-3 py-3 shrink-0">
            <button
              onClick={handleRecord}
              disabled={processing}
              className={cn(
                'w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all',
                recording
                  ? 'bg-[#ef4444] text-white animate-pulse'
                  : processing
                  ? 'bg-[#112240] text-[#94a3b8] border border-[#1e3a5f]'
                  : 'bg-[#22d3ee] text-[#0a192f] active:scale-[0.97]'
              )}
            >
              {processing ? (
                <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg> Procesando...</>
              ) : recording ? (
                <><span className="text-xl">⏹</span> GRABANDO — toque para enviar</>
              ) : (
                <><span className="text-xl">🎤</span> Hablar al asistente</>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
