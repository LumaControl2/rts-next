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

type AssistantState = 'idle' | 'listening' | 'recording' | 'processing' | 'speaking';

export default function Assistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [autoOpened, setAutoOpened] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpeechRef = useRef(false);
  const recordingStartRef = useRef(0);
  const stateRef = useRef<AssistantState>('idle');
  const processingRef = useRef(false);

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = state; }, [state]);

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

  // Fetch cierreId
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

  // Contextual suggestions
  const getContextualSuggestions = useCallback((): string[] => {
    const ctx = getContext();
    if (pathname === '/home') return ['Iniciar jornada', '¿Cómo va el día?', 'Ir a batería 210', '¿Qué baterías faltan?'];
    if (pathname === '/jornada') return ['Ir a batería 210', '¿Cómo va el día?', 'Ir al inicio'];
    if (ctx.pozoId) return [`Datos de ayer del ${ctx.pozoId}`, '¿Cuál es el potencial?', 'Siguiente pozo', 'Volver a la batería'];
    if (ctx.subScreen === 'tanques') return ['Volver a pozos', 'Ver resumen', '¿Cómo va la batería?'];
    if (ctx.subScreen === 'resumen') return ['¿Falta algo?', 'Volver a pozos', 'Ir al inicio'];
    if (ctx.bateriaId) return ['¿Qué pozos faltan?', 'Siguiente pozo', 'Copiar datos de ayer', '¿Cómo voy?'];
    return ['¿Cómo va el día?', 'Iniciar jornada', 'Ir a batería 210'];
  }, [getContext, pathname]);

  // TTS — returns a promise that resolves when speech finishes
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-PE';
      u.rate = 1.15;
      u.onstart = () => setState('speaking');
      u.onend = () => { setState('idle'); resolve(); };
      u.onerror = () => { setState('idle'); resolve(); };
      window.speechSynthesis.speak(u);
    });
  }, []);

  // Execute action
  const executeAction = useCallback(async (accion: any, actionResult: any): Promise<{ label: string; success: boolean }> => {
    if (!accion || accion.tipo === 'INFO') return { label: '', success: true };
    const tipo = accion.tipo;

    if (tipo === 'NAVEGAR') {
      let target = '/home';
      if (accion.pantalla === 'cierre' && accion.bateriaId) target = `/cierre/${encodeURIComponent(accion.bateriaId)}`;
      else if (accion.pantalla === 'pozo' && accion.bateriaId && accion.pozoId) target = `/cierre/${encodeURIComponent(accion.bateriaId)}/pozo/${encodeURIComponent(accion.pozoId)}`;
      else if (accion.pantalla === 'tanques' && accion.bateriaId) target = `/cierre/${encodeURIComponent(accion.bateriaId)}/tanques`;
      else if (accion.pantalla === 'resumen' && accion.bateriaId) target = `/cierre/${encodeURIComponent(accion.bateriaId)}/resumen`;
      else if (accion.pantalla === 'jornada') target = '/jornada';
      setTimeout(() => router.push(target), 400);
      const label = accion.pozoId ? `Pozo ${accion.pozoId}` : accion.bateriaId || accion.pantalla;
      return { label: `📍 → ${label}`, success: true };
    }

    if (tipo === 'INICIAR_JORNADA') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'JORNADA_CREADA', payload: actionResult });
        setTimeout(() => { router.push('/jornada'); emitAssistantEvent({ type: 'DATOS_CAMBIARON' }); }, 800);
        return {
          label: actionResult.yaExistia ? `🚗 Jornada activa (${actionResult.placa})` : `🚗 Jornada iniciada — ${actionResult.placa}, km ${actionResult.kmInicio}`,
          success: true,
        };
      }
      return { label: `❌ ${actionResult?.error || 'Error'}`, success: false };
    }

    if (tipo === 'REGISTRAR_POZO' || tipo === 'REGISTRAR_POZO_PARADO') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'POZO_REGISTRADO', payload: actionResult });
        const emoji = accion.datos?.estadoPozo === 'PARADO' ? '🔴' : '✅';
        return { label: `${emoji} Pozo ${actionResult.pozo} — ${actionResult.pozosRegistrados}/${actionResult.totalPozos} | Crudo: ${actionResult.totalCrudo} BLS`, success: true };
      }
      return { label: `❌ ${actionResult?.error || 'Error'}`, success: false };
    }

    if (tipo === 'COPIAR_AYER') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'DATOS_CAMBIARON', payload: actionResult });
        return { label: `📋 ${actionResult.copiedCount} pozos copiados — ${actionResult.totalRegistrados}/${actionResult.totalPozos}`, success: true };
      }
      return { label: `❌ ${actionResult?.error || 'No hay datos de ayer'}`, success: false };
    }

    if (tipo === 'CERRAR_BATERIA') {
      const bat = accion.bateriaId || getContext().bateriaId;
      if (bat) {
        setTimeout(() => router.push(`/cierre/${encodeURIComponent(bat)}/resumen`), 500);
        return { label: '📊 Abriendo resumen', success: true };
      }
    }

    return { label: '', success: true };
  }, [router, getContext]);

  // Send to API (voice or text)
  const sendToAPI = useCallback(async (transcript: string, audioBlob?: Blob) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setState('processing');
    setError('');

    try {
      const cierreId = await getCierreId();
      const ctx = { ...getContext(), cierreId };

      const fd = new FormData();
      if (audioBlob) fd.append('audio', audioBlob, 'rec.webm');
      else fd.append('text', transcript);
      fd.append('context', JSON.stringify(ctx));
      fd.append('history', JSON.stringify(messages.slice(-10).map(m => ({ role: m.role, content: m.content }))));

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) { setError(json.error || 'Error'); return; }

      const userMsg: Message = { role: 'user', content: audioBlob ? (json.transcript || transcript) : transcript, timestamp: new Date() };

      let actionLabel = '';
      let actionSuccess = false;
      if (json.response?.accion && json.response.accion.tipo !== 'INFO') {
        const result = await executeAction(json.response.accion, json.actionResult);
        actionLabel = result.label;
        actionSuccess = result.success;
      }

      const botMsg: Message = {
        role: 'assistant',
        content: json.response?.mensaje || 'No entendí, repita.',
        timestamp: new Date(),
        actionLabel,
        actionSuccess,
        suggestions: json.response?.sugerencias,
      };

      setMessages(prev => [...prev, userMsg, botMsg]);

      // Speak and then restart listening
      if (json.response?.mensaje) {
        await speak(json.response.mensaje);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      processingRef.current = false;
      setState('idle');
    }
  }, [getCierreId, getContext, messages, token, executeAction, speak]);

  // ─── CONTINUOUS VOICE (VAD) ───────────────────────────

  const stopListening = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current?.state !== 'closed') { try { audioCtxRef.current?.close(); } catch {} }
    audioCtxRef.current = null;
    analyserRef.current = null;
    hasSpeechRef.current = false;
    setAudioLevel(0);
  }, []);

  const startListening = useCallback(async () => {
    if (stateRef.current === 'processing' || stateRef.current === 'speaking' || processingRef.current) return;
    stopListening();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Permita el micrófono para el modo manos libres');
      return;
    }
    streamRef.current = stream;

    // Audio analysis for VAD
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    analyserRef.current = analyser;

    // Start recorder
    audioChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (blob.size > 1000 && hasSpeechRef.current) {
        await sendToAPI('', blob);
      }
      hasSpeechRef.current = false;
    };

    mr.start();
    recordingStartRef.current = Date.now();
    hasSpeechRef.current = false;
    setState('listening');

    // VAD monitoring loop
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const SPEECH_THRESHOLD = 18;
    const SILENCE_DURATION = 1800; // ms of silence after speech to trigger send

    const monitor = () => {
      if (!analyserRef.current || stateRef.current === 'processing' || stateRef.current === 'speaking') return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(avg / 40, 1)); // normalize 0-1

      if (avg > SPEECH_THRESHOLD) {
        // Speech detected
        if (!hasSpeechRef.current) {
          hasSpeechRef.current = true;
          setState('recording');
        }
        // Clear silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (hasSpeechRef.current && !silenceTimerRef.current) {
        // Speech ended, start silence timer
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          const elapsed = Date.now() - recordingStartRef.current;
          if (elapsed > 600 && hasSpeechRef.current && mediaRecorderRef.current?.state === 'recording') {
            // Stop recording — onstop will process
            try { mediaRecorderRef.current.stop(); } catch {}
            // Stop the stream + analyser (will be recreated on restart)
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
        }, SILENCE_DURATION);
      }

      rafRef.current = requestAnimationFrame(monitor);
    };

    rafRef.current = requestAnimationFrame(monitor);
  }, [stopListening, sendToAPI]);

  // Auto-restart listening after processing/speaking ends
  useEffect(() => {
    if (open && state === 'idle' && !processingRef.current) {
      const timer = setTimeout(() => {
        if (stateRef.current === 'idle' && open) {
          startListening();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [open, state, startListening]);

  // Stop listening when panel closes
  useEffect(() => {
    if (!open) {
      stopListening();
      setState('idle');
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    }
  }, [open, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [stopListening]);

  // Auto-open assistant after login (when on /home)
  useEffect(() => {
    if (user && token && pathname === '/home' && !autoOpened) {
      const timer = setTimeout(() => {
        setOpen(true);
        setAutoOpened(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, token, pathname, autoOpened]);

  // Handle text submit
  const handleSendText = useCallback(async (text?: string) => {
    const msg = text || inputText.trim();
    if (!msg || processingRef.current) return;
    setInputText('');
    stopListening();
    await sendToAPI(msg);
  }, [inputText, sendToAPI, stopListening]);

  if (!user || !token || pathname === '/') return null;

  const currentSuggestions = messages.length > 0 && messages[messages.length - 1].suggestions
    ? messages[messages.length - 1].suggestions!
    : getContextualSuggestions();

  const isActive = state === 'listening' || state === 'recording';

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
          open ? 'bg-[#ef4444] scale-90'
            : state === 'speaking' ? 'bg-[#22c55e] animate-pulse'
            : state === 'recording' ? 'bg-[#ef4444] animate-pulse'
            : 'bg-gradient-to-br from-[#22d3ee] to-[#0ea5e9]',
        )}
      >
        <span className="text-2xl">{open ? '✕' : '🤖'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 bottom-[8.5rem] right-3 left-3 sm:left-auto sm:w-[420px] bg-[#0d1f3c] border border-[#22d3ee]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '60vh' }}>
          {/* Header with audio visualization */}
          <div className="bg-gradient-to-r from-[#22d3ee]/15 to-[#0ea5e9]/10 border-b border-[#22d3ee]/20 px-4 py-3 flex items-center gap-3 shrink-0">
            {/* Animated status indicator */}
            <div className="relative">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all',
                state === 'recording' && 'bg-[#ef4444]/20',
                state === 'listening' && 'bg-[#22d3ee]/20',
                state === 'processing' && 'bg-[#f59e0b]/20',
                state === 'speaking' && 'bg-[#22c55e]/20',
                state === 'idle' && 'bg-[#22d3ee]/10',
              )}>
                {state === 'recording' ? '🔴' : state === 'processing' ? '⚡' : state === 'speaking' ? '🔊' : state === 'listening' ? '👂' : '🤖'}
              </div>
              {/* Pulsing ring for listening/recording */}
              {isActive && (
                <div
                  className={cn(
                    'absolute inset-0 rounded-full border-2 animate-ping',
                    state === 'recording' ? 'border-[#ef4444]/50' : 'border-[#22d3ee]/30',
                  )}
                  style={{ animationDuration: state === 'recording' ? '1s' : '2s' }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Asistente RT NEXT</p>
              <p className={cn(
                'text-xs truncate font-medium',
                state === 'recording' ? 'text-[#ef4444]'
                  : state === 'listening' ? 'text-[#22d3ee]'
                  : state === 'processing' ? 'text-[#f59e0b]'
                  : state === 'speaking' ? 'text-[#22c55e]'
                  : 'text-[#94a3b8]',
              )}>
                {state === 'recording' ? 'Escuchando... hable con confianza'
                  : state === 'listening' ? 'Esperando su voz...'
                  : state === 'processing' ? 'Procesando...'
                  : state === 'speaking' ? 'Respondiendo...'
                  : 'Conectando...'}
              </p>
            </div>
            {/* Audio level bars */}
            {isActive && (
              <div className="flex items-end gap-0.5 h-6 mr-1">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className={cn(
                      'w-1 rounded-full transition-all duration-100',
                      state === 'recording' ? 'bg-[#ef4444]' : 'bg-[#22d3ee]/50',
                    )}
                    style={{
                      height: `${Math.max(4, Math.min(24, audioLevel * 24 * (0.5 + Math.random() * 0.5)))}px`,
                    }}
                  />
                ))}
              </div>
            )}
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-[#94a3b8] text-xs px-2 py-1 rounded-lg hover:bg-white/10">
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
                <p className="text-[#94a3b8] text-xs mb-3">Solo hable y yo ejecuto. No necesita tocar botones.</p>
                <div className="grid grid-cols-2 gap-1.5 text-left">
                  {[
                    { icon: '🚗', text: 'Iniciar jornada' },
                    { icon: '📋', text: 'Navegar a baterías' },
                    { icon: '✅', text: 'Registrar pozos por voz' },
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
                  msg.role === 'user' ? 'bg-[#22d3ee]/15 text-white rounded-br-sm' : 'bg-[#1a2d4a] text-white rounded-bl-sm',
                )}>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line">{msg.content}</p>
                  {msg.actionLabel && (
                    <div className={cn(
                      'mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                      msg.actionSuccess ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]',
                    )}>
                      {msg.actionLabel}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {state === 'processing' && (
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
          {state !== 'processing' && state !== 'recording' && (
            <div className="px-3 pb-2 shrink-0">
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {currentSuggestions.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendText(sug)}
                    disabled={processingRef.current}
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

          {/* Input area — text fallback + status */}
          <div className="border-t border-[#22d3ee]/20 px-3 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder={state === 'recording' ? 'Escuchando...' : state === 'listening' ? 'O escriba aquí...' : 'Escriba un comando...'}
                disabled={state === 'processing' || state === 'speaking'}
                className="flex-1 bg-[#112240] border border-[#1e3a5f] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#22d3ee]/50 disabled:opacity-50"
              />
              {inputText.trim() ? (
                <button
                  onClick={() => handleSendText()}
                  disabled={state === 'processing'}
                  className="w-10 h-10 rounded-xl bg-[#22d3ee] text-[#0a192f] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isActive) { stopListening(); setState('idle'); }
                    else startListening();
                  }}
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                    isActive
                      ? 'bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30'
                      : 'bg-[#22d3ee]/15 text-[#22d3ee] hover:bg-[#22d3ee]/25',
                  )}
                  title={isActive ? 'Pausar micrófono' : 'Activar micrófono'}
                >
                  {isActive ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <span className="text-lg">🎤</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
