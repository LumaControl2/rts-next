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
  suggestions?: string[];
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
  const [inputText, setInputText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasGreeted = useRef(false);

  // Derive context from URL
  const getContext = useCallback(() => {
    const parts = pathname.split('/');
    const ctx: any = { screen: pathname };
    if (parts[1] === 'cierre' && parts[2]) ctx.bateriaId = decodeURIComponent(parts[2]);
    if (parts[3] === 'pozo' && parts[4]) ctx.pozoId = decodeURIComponent(parts[4]);
    if (parts[3] === 'tanques') ctx.subScreen = 'tanques';
    if (parts[3] === 'resumen') ctx.subScreen = 'resumen';
    if (parts[3] === 'novedades') ctx.subScreen = 'novedades';
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

  // Generate contextual suggestions based on current page
  const getContextualSuggestions = useCallback((): string[] => {
    const ctx = getContext();

    if (pathname === '/home') {
      return [
        'Iniciar jornada',
        '¿Cómo va el día?',
        'Ir a batería 210',
        '¿Qué baterías faltan?',
      ];
    }

    if (pathname === '/jornada') {
      return [
        'Ir a batería 210',
        '¿Cómo va el día?',
        'Ir al inicio',
      ];
    }

    if (ctx.pozoId) {
      return [
        `Datos de ayer del ${ctx.pozoId}`,
        `¿Cuál es el potencial?`,
        'Siguiente pozo',
        'Volver a la batería',
      ];
    }

    if (ctx.subScreen === 'tanques') {
      return ['Volver a pozos', 'Ver resumen', '¿Cómo va la batería?'];
    }

    if (ctx.subScreen === 'resumen') {
      return ['¿Falta algo?', 'Volver a pozos', 'Ir al inicio'];
    }

    if (ctx.bateriaId) {
      return [
        '¿Qué pozos faltan?',
        'Siguiente pozo',
        'Copiar datos de ayer',
        '¿Cómo voy?',
      ];
    }

    return ['¿Cómo va el día?', 'Iniciar jornada', 'Ir a batería 210'];
  }, [getContext, pathname]);

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

  // Execute action returned by the AI
  const executeAction = useCallback(async (accion: any, actionResult: any): Promise<{ label: string; success: boolean }> => {
    if (!accion || accion.tipo === 'INFO') return { label: '', success: true };

    const tipo = accion.tipo;

    // NAVEGAR — navigate to target
    if (tipo === 'NAVEGAR') {
      let target = '/home';
      if (accion.pantalla === 'cierre' && accion.bateriaId) {
        target = `/cierre/${encodeURIComponent(accion.bateriaId)}`;
      } else if (accion.pantalla === 'pozo' && accion.bateriaId && accion.pozoId) {
        target = `/cierre/${encodeURIComponent(accion.bateriaId)}/pozo/${encodeURIComponent(accion.pozoId)}`;
      } else if (accion.pantalla === 'tanques' && accion.bateriaId) {
        target = `/cierre/${encodeURIComponent(accion.bateriaId)}/tanques`;
      } else if (accion.pantalla === 'resumen' && accion.bateriaId) {
        target = `/cierre/${encodeURIComponent(accion.bateriaId)}/resumen`;
      } else if (accion.pantalla === 'jornada') {
        target = '/jornada';
      }
      setTimeout(() => router.push(target), 400);
      const label = accion.pozoId
        ? `Pozo ${accion.pozoId}`
        : accion.bateriaId || accion.pantalla;
      return { label: `📍 → ${label}`, success: true };
    }

    // INICIAR_JORNADA
    if (tipo === 'INICIAR_JORNADA') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'JORNADA_CREADA', payload: actionResult });
        setTimeout(() => {
          router.push('/jornada');
          emitAssistantEvent({ type: 'DATOS_CAMBIARON' });
        }, 800);
        return {
          label: actionResult.yaExistia
            ? `🚗 Jornada activa (${actionResult.placa})`
            : `🚗 Jornada iniciada — ${actionResult.placa}, km ${actionResult.kmInicio}`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'Error al iniciar jornada'}`, success: false };
    }

    // REGISTRAR_POZO
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
        const emoji = accion.datos?.estadoPozo === 'PARADO' ? '🔴' : '✅';
        return {
          label: `${emoji} Pozo ${actionResult.pozo} — ${actionResult.pozosRegistrados}/${actionResult.totalPozos} | Crudo: ${actionResult.totalCrudo} BLS`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'Error al registrar'}`, success: false };
    }

    // COPIAR_AYER
    if (tipo === 'COPIAR_AYER') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'DATOS_CAMBIARON', payload: actionResult });
        return {
          label: `📋 ${actionResult.copiedCount} pozos copiados — ${actionResult.totalRegistrados}/${actionResult.totalPozos} | Crudo: ${actionResult.totalCrudo} BLS`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'No hay datos de ayer'}`, success: false };
    }

    // CERRAR_BATERIA
    if (tipo === 'CERRAR_BATERIA') {
      const bat = accion.bateriaId || getContext().bateriaId;
      if (bat) {
        setTimeout(() => router.push(`/cierre/${encodeURIComponent(bat)}/resumen`), 500);
        return { label: '📊 Abriendo resumen', success: true };
      }
    }

    return { label: '', success: true };
  }, [router, getContext]);

  // Core: send message to API (works for both voice and text)
  const sendToAPI = useCallback(async (transcript: string, audioBlob?: Blob) => {
    setProcessing(true);
    setError('');

    try {
      const cierreId = await getCierreId();
      const ctx = { ...getContext(), cierreId };

      const fd = new FormData();
      if (audioBlob) {
        fd.append('audio', audioBlob, 'rec.webm');
      } else {
        fd.append('text', transcript);
      }
      fd.append('context', JSON.stringify(ctx));
      fd.append('history', JSON.stringify(messages.slice(-10).map(m => ({ role: m.role, content: m.content }))));

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Error del asistente');
        return;
      }

      // User message
      const userMsg: Message = {
        role: 'user',
        content: audioBlob ? (json.transcript || transcript) : transcript,
        timestamp: new Date(),
      };

      // Execute action
      let actionLabel = '';
      let actionSuccess = false;
      if (json.response?.accion && json.response.accion.tipo !== 'INFO') {
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
        suggestions: json.response?.sugerencias,
      };

      setMessages(prev => [...prev, userMsg, botMsg]);

      // Speak response
      if (json.response?.mensaje && audioBlob) {
        speak(json.response.mensaje);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setProcessing(false);
    }
  }, [getCierreId, getContext, messages, token, executeAction, speak]);

  // Handle text submission
  const handleSendText = useCallback(async (text?: string) => {
    const msg = text || inputText.trim();
    if (!msg || processing) return;
    setInputText('');
    await sendToAPI(msg);
  }, [inputText, processing, sendToAPI]);

  // Handle voice recording
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

      await sendToAPI('', blob);
    };

    mr.start();
    setRecording(true);
    setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 30000);
  }

  // Auto-greet when panel opens for first time
  useEffect(() => {
    if (open && messages.length === 0 && !hasGreeted.current) {
      hasGreeted.current = true;
    }
  }, [open, messages.length]);

  // Reset greeting flag on page change
  useEffect(() => {
    hasGreeted.current = false;
  }, [pathname]);

  if (!user || !token || pathname === '/') return null;

  const currentSuggestions = messages.length > 0 && messages[messages.length - 1].suggestions
    ? messages[messages.length - 1].suggestions!
    : getContextualSuggestions();

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 300);
        }}
        className={cn(
          'fixed z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all',
          'bottom-20 right-4',
          open ? 'bg-[#ef4444] scale-90' : speaking ? 'bg-[#22c55e] animate-pulse' : 'bg-gradient-to-br from-[#22d3ee] to-[#0ea5e9]',
        )}
      >
        <span className="text-2xl">{open ? '✕' : '🤖'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 bottom-[8.5rem] right-3 left-3 sm:left-auto sm:w-[420px] bg-[#0d1f3c] border border-[#22d3ee]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '60vh' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#22d3ee]/15 to-[#0ea5e9]/10 border-b border-[#22d3ee]/20 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#22d3ee]/30 to-[#0ea5e9]/20 flex items-center justify-center text-lg">
              {recording ? '🔴' : processing ? '⚡' : speaking ? '🔊' : '🤖'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Asistente RT NEXT</p>
              <p className="text-[#22d3ee] text-xs truncate">
                {recording ? 'Grabando... toque para enviar' : processing ? 'Procesando...' : speaking ? 'Hablando...' : 'Listo — hable o escriba'}
              </p>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); hasGreeted.current = false; }} className="text-[#94a3b8] text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors">
                Limpiar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ minHeight: '120px' }}>
            {messages.length === 0 && (
              <div className="text-center py-4 px-2">
                <p className="text-3xl mb-2">🤖</p>
                <p className="text-white text-sm font-medium mb-1">Hola {user.nombre?.split(' ')[0]}!</p>
                <p className="text-[#94a3b8] text-xs mb-3">Soy tu asistente inteligente. Conozco todos los pozos, baterías y datos del Lote I.</p>
                <div className="grid grid-cols-2 gap-1.5 text-left">
                  {[
                    { icon: '🚗', text: 'Iniciar jornada' },
                    { icon: '📋', text: 'Navegar a baterías' },
                    { icon: '✅', text: 'Registrar pozos' },
                    { icon: '🔴', text: 'Reportar parados' },
                    { icon: '📊', text: 'Ver resúmenes' },
                    { icon: '🔍', text: 'Consultar datos' },
                  ].map(item => (
                    <div key={item.text} className="bg-[#112240] rounded-lg px-2.5 py-2 flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <span className="text-[#94a3b8] text-[11px]">{item.text}</span>
                    </div>
                  ))}
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
                  <p className="text-[13px] leading-relaxed whitespace-pre-line">{msg.content}</p>
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

          {/* Suggestion chips */}
          {!processing && !recording && (
            <div className="px-3 pb-2 shrink-0">
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {currentSuggestions.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendText(sug)}
                    disabled={processing}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-[#22d3ee]/10 border border-[#22d3ee]/25 text-[#22d3ee] text-[11px] font-medium hover:bg-[#22d3ee]/20 active:scale-95 transition-all whitespace-nowrap"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-[#ef4444]/15 border-t border-[#ef4444]/30 shrink-0">
              <p className="text-[#ef4444] text-xs">{error}</p>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-[#22d3ee]/20 px-3 py-2.5 shrink-0">
            {/* Text input row */}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder={recording ? 'Grabando...' : 'Escriba un comando...'}
                disabled={processing || recording}
                className="flex-1 bg-[#112240] border border-[#1e3a5f] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#22d3ee]/50 disabled:opacity-50"
              />
              {/* Send text button */}
              {inputText.trim() && (
                <button
                  onClick={() => handleSendText()}
                  disabled={processing}
                  className="w-10 h-10 rounded-xl bg-[#22d3ee] text-[#0a192f] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              )}
              {/* Mic button */}
              <button
                onClick={handleRecord}
                disabled={processing}
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90',
                  recording
                    ? 'bg-[#ef4444] text-white animate-pulse'
                    : processing
                    ? 'bg-[#112240] text-[#4a6a8a]'
                    : 'bg-[#22d3ee]/15 text-[#22d3ee] hover:bg-[#22d3ee]/25'
                )}
              >
                {processing ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : recording ? (
                  <span className="text-lg">⏹</span>
                ) : (
                  <span className="text-lg">🎤</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
