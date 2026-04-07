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

type ListenState = 'off' | 'listening' | 'recording' | 'processing' | 'speaking';

const WAKE_WORD_PATTERN = /math?i[ua]s|mati[ua]s|matheus|matheu/i;

export default function Assistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();

  const [chatOpen, setChatOpen] = useState(false);
  const [listenState, setListenState] = useState<ListenState>('off');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [toast, setToast] = useState('');

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
  const stateRef = useRef<ListenState>('off');
  const processingRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenStartedRef = useRef(false);

  // Stable refs for values that change often (prevent callback chain recreation)
  const messagesRef = useRef<Message[]>([]);
  const tokenRef = useRef(token);
  const sendToAPIRef = useRef<(transcript: string, audioBlob?: Blob) => Promise<void>>(async () => {});
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => { stateRef.current = listenState; }, [listenState]);

  // Context from URL
  const getContext = useCallback(() => {
    const parts = pathname.split('/');
    const ctx: any = { screen: pathname };
    if (parts[1] === 'cierre' && parts[2]) ctx.bateriaId = decodeURIComponent(parts[2]);
    if (parts[3] === 'pozo' && parts[4]) ctx.pozoId = decodeURIComponent(parts[4]);
    if (parts[3] === 'tanques') ctx.subScreen = 'tanques';
    if (parts[3] === 'resumen') ctx.subScreen = 'resumen';
    return ctx;
  }, [pathname]);

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
        return arr.find((c: any) => c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO')?._id || null;
      }
    } catch {}
    return null;
  }, [getContext, token]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Show toast briefly
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 5000);
  }, []);

  // TTS
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-PE';
      u.rate = 1.15;
      u.onstart = () => setListenState('speaking');
      u.onend = () => { setListenState('off'); resolve(); };
      u.onerror = () => { setListenState('off'); resolve(); };
      window.speechSynthesis.speak(u);
    });
  }, []);

  // Execute action (no UI interruption — only TTS + events)
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
      // Use longer delay for chained actions so previous actions complete first
      setTimeout(() => router.push(target), 600);
      emitAssistantEvent({ type: 'DATOS_CAMBIARON' });
      return { label: `📍 → ${accion.pozoId || accion.bateriaId || accion.pantalla}`, success: true };
    }

    if (tipo === 'INICIAR_JORNADA') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'JORNADA_CREADA', payload: actionResult });
        setTimeout(() => { router.push('/jornada'); emitAssistantEvent({ type: 'DATOS_CAMBIARON' }); }, 800);
        return { label: `🚗 Jornada — ${actionResult.placa}`, success: true };
      }
      return { label: `❌ ${actionResult?.error}`, success: false };
    }

    if (tipo === 'REGISTRAR_POZO' || tipo === 'REGISTRAR_POZO_PARADO') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'POZO_REGISTRADO', payload: actionResult });
        return { label: `${accion.datos?.estadoPozo === 'PARADO' ? '🔴' : '✅'} ${actionResult.pozo} — ${actionResult.pozosRegistrados}/${actionResult.totalPozos}`, success: true };
      }
      return { label: `❌ ${actionResult?.error}`, success: false };
    }

    if (tipo === 'COPIAR_AYER') {
      if (actionResult?.success) {
        emitAssistantEvent({ type: 'DATOS_CAMBIARON', payload: actionResult });
        return { label: `📋 ${actionResult.copiedCount} copiados`, success: true };
      }
      return { label: `❌ ${actionResult?.error}`, success: false };
    }

    if (tipo === 'CERRAR_BATERIA') {
      const bat = accion.bateriaId || getContext().bateriaId;
      if (bat) setTimeout(() => router.push(`/cierre/${encodeURIComponent(bat)}/resumen`), 500);
      return { label: '📊 Resumen', success: true };
    }

    return { label: '', success: true };
  }, [router, getContext]);

  // Send to API — uses refs for stable callback (no recreation on messages change)
  const sendToAPI = useCallback(async (transcript: string, audioBlob?: Blob) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setListenState('processing');
    setError('');

    try {
      const cierreId = await getCierreId();
      const ctx = { ...getContext(), cierreId };

      const fd = new FormData();
      if (audioBlob) fd.append('audio', audioBlob, 'rec.webm');
      else fd.append('text', transcript);
      fd.append('context', JSON.stringify(ctx));
      fd.append('history', JSON.stringify(messagesRef.current.slice(-10).map(m => ({ role: m.role, content: m.content }))));

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) { setError(json.error || 'Error'); return; }

      // Check wake word — if audio mode, verify "Mathius" in transcript
      if (audioBlob) {
        const t = (json.transcript || '').toLowerCase();
        if (!WAKE_WORD_PATTERN.test(t)) {
          // No wake word — ignore silently
          return;
        }
      }

      const userMsg: Message = { role: 'user', content: audioBlob ? (json.transcript || transcript) : transcript, timestamp: new Date() };

      // Execute ALL actions (multi-action support)
      const labels: string[] = [];
      let anySuccess = false;
      const results = json.actionResults || [];
      // Also support legacy single action
      const acciones = Array.isArray(json.response?.acciones) ? json.response.acciones : (json.response?.accion ? [json.response.accion] : []);

      for (let i = 0; i < acciones.length; i++) {
        const accion = acciones[i];
        if (!accion || accion.tipo === 'INFO') continue;
        const actionResult = results[i] || json.actionResult;
        const result = await executeAction(accion, actionResult);
        if (result.label) labels.push(result.label);
        if (result.success) anySuccess = true;
      }

      const botMsg: Message = {
        role: 'assistant',
        content: json.response?.mensaje || 'No entendí, repita.',
        timestamp: new Date(),
        actionLabel: labels.join('\n'),
        actionSuccess: anySuccess || labels.length === 0,
        suggestions: json.response?.sugerencias,
      };

      setMessages(prev => [...prev, userMsg, botMsg]);

      // Show toast (non-intrusive) and speak
      if (json.response?.mensaje) {
        showToast(labels.join(' | ') || json.response.mensaje);
        await speak(json.response.mensaje);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      processingRef.current = false;
      setListenState('off');
    }
  }, [getCierreId, getContext, executeAction, speak, showToast]);

  // Keep ref in sync
  useEffect(() => { sendToAPIRef.current = sendToAPI; }, [sendToAPI]);

  // ─── CONTINUOUS BACKGROUND LISTENING ────────────────

  const stopListening = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') { try { mediaRecorderRef.current.stop(); } catch {} }
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
      setError('Permita el micrófono');
      return;
    }
    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    analyserRef.current = analyser;

    audioChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (blob.size > 1000 && hasSpeechRef.current) {
        await sendToAPIRef.current?.('', blob);
      }
      hasSpeechRef.current = false;
    };

    mr.start();
    recordingStartRef.current = Date.now();
    hasSpeechRef.current = false;
    setListenState('listening');

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const SPEECH_THRESHOLD = 18;
    const SILENCE_DURATION = 1800;

    const monitor = () => {
      if (!analyserRef.current || stateRef.current === 'processing' || stateRef.current === 'speaking') return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(avg / 40, 1));

      if (avg > SPEECH_THRESHOLD) {
        if (!hasSpeechRef.current) {
          hasSpeechRef.current = true;
          setListenState('recording');
        }
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      } else if (hasSpeechRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (Date.now() - recordingStartRef.current > 600 && hasSpeechRef.current && mediaRecorderRef.current?.state === 'recording') {
            try { mediaRecorderRef.current.stop(); } catch {}
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
        }, SILENCE_DURATION);
      }

      rafRef.current = requestAnimationFrame(monitor);
    };
    rafRef.current = requestAnimationFrame(monitor);
  }, [stopListening]);

  // Auto-restart listening after idle
  useEffect(() => {
    if (listenState === 'off' && !processingRef.current && user && token && pathname !== '/') {
      const timer = setTimeout(() => {
        if (stateRef.current === 'off' && !processingRef.current) startListening();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [listenState, user, token, pathname, startListening]);

  // Start background listening on login
  useEffect(() => {
    if (user && token && pathname !== '/' && !listenStartedRef.current) {
      listenStartedRef.current = true;
      const timer = setTimeout(() => startListening(), 2000);
      return () => clearTimeout(timer);
    }
  }, [user, token, pathname, startListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopListening();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [stopListening]);

  // Contextual suggestions
  const getContextualSuggestions = useCallback((): string[] => {
    const ctx = getContext();
    if (pathname === '/home') return ['Mathius, iniciar jornada', 'Mathius, ¿cómo va el día?', 'Mathius, ir a batería 210'];
    if (pathname === '/jornada') return ['Mathius, ir a batería 210', 'Mathius, ¿cómo va el día?'];
    if (ctx.pozoId) return [`Mathius, datos de ayer del ${ctx.pozoId}`, 'Mathius, siguiente pozo'];
    if (ctx.bateriaId) return ['Mathius, ¿qué pozos faltan?', 'Mathius, siguiente pozo', 'Mathius, copiar ayer'];
    return ['Mathius, ¿cómo va el día?', 'Mathius, iniciar jornada'];
  }, [getContext, pathname]);

  // Handle text
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

  return (
    <>
      {/* ── Toast notification (non-intrusive) ── */}
      {toast && !chatOpen && (
        <div className="fixed z-50 bottom-[6rem] right-4 left-4 sm:left-auto sm:right-4 sm:w-[320px] animate-in slide-in-from-bottom-2">
          <div className="bg-[#112240] border border-[#22d3ee]/30 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <p className="text-white text-sm flex-1 line-clamp-2">{toast}</p>
            <button onClick={() => setToast('')} className="text-[#94a3b8] text-xs shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* ── Floating Mathius button ── */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className={cn(
          'fixed z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all',
          'bottom-20 right-4',
          chatOpen ? 'scale-90' : '',
        )}
        style={{
          background: chatOpen
            ? '#ef4444'
            : listenState === 'speaking'
            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
            : listenState === 'recording'
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : listenState === 'processing'
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        }}
      >
        {chatOpen ? (
          <span className="text-white text-2xl">✕</span>
        ) : (
          <div className="relative">
            <span className="text-white text-lg font-black tracking-tighter">M</span>
            {/* Listening indicator ring */}
            {(listenState === 'listening' || listenState === 'recording') && (
              <div
                className="absolute -inset-3 rounded-full border-2"
                style={{
                  borderColor: listenState === 'recording' ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.3)',
                  animation: `ping ${listenState === 'recording' ? '1s' : '2.5s'} cubic-bezier(0, 0, 0.2, 1) infinite`,
                }}
              />
            )}
            {listenState === 'processing' && (
              <div className="absolute -inset-1 rounded-full border-2 border-[#f59e0b]/50 animate-spin" style={{ borderTopColor: 'transparent' }} />
            )}
          </div>
        )}
      </button>

      {/* ── Small status pill (non-intrusive) ── */}
      {!chatOpen && listenState === 'recording' && (
        <div className="fixed z-40 bottom-[5.5rem] right-[4.5rem] bg-[#ef4444] rounded-full px-2.5 py-0.5 flex items-center gap-1.5 shadow-lg animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
          <span className="text-white text-[10px] font-semibold">Escuchando</span>
        </div>
      )}
      {!chatOpen && listenState === 'processing' && (
        <div className="fixed z-40 bottom-[5.5rem] right-[4.5rem] bg-[#f59e0b] rounded-full px-2.5 py-0.5 shadow-lg">
          <span className="text-white text-[10px] font-semibold">Procesando...</span>
        </div>
      )}

      {/* ── Chat panel (only when user opens it) ── */}
      {chatOpen && (
        <div className="fixed z-50 bottom-[8.5rem] right-3 left-3 sm:left-auto sm:w-[420px] bg-[#0d1f3c] border border-[#6366f1]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '60vh' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#6366f1]/15 to-[#8b5cf6]/10 border-b border-[#6366f1]/20 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg">
              <span className="text-white text-sm font-black">M</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Mathius</p>
              <p className="text-[#a5b4fc] text-xs">
                {listenState === 'recording' ? '🔴 Escuchando...'
                  : listenState === 'listening' ? '👂 Esperando "Mathius..."'
                  : listenState === 'processing' ? '⚡ Procesando...'
                  : listenState === 'speaking' ? '🔊 Respondiendo...'
                  : '● Activo'}
              </p>
            </div>
            {/* Audio level bars */}
            {(listenState === 'listening' || listenState === 'recording') && (
              <div className="flex items-end gap-0.5 h-5">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className={cn('w-1 rounded-full transition-all duration-100', listenState === 'recording' ? 'bg-[#ef4444]' : 'bg-[#6366f1]/40')}
                    style={{ height: `${Math.max(3, Math.min(20, audioLevel * 20 * (0.5 + Math.random() * 0.5)))}px` }}
                  />
                ))}
              </div>
            )}
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-[#94a3b8] text-xs px-2 py-1 rounded-lg hover:bg-white/10">Limpiar</button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ minHeight: '120px' }}>
            {messages.length === 0 && (
              <div className="text-center py-4 px-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center mb-3 shadow-lg">
                  <span className="text-white text-2xl font-black">M</span>
                </div>
                <p className="text-white text-sm font-medium mb-1">Soy Mathius</p>
                <p className="text-[#94a3b8] text-xs mb-3">Tu asistente de campo inteligente. Diga &ldquo;Mathius&rdquo; seguido de su comando.</p>
                <div className="space-y-1.5 text-left bg-[#112240] rounded-xl p-3">
                  <p className="text-[#a5b4fc] text-[11px] font-bold uppercase mb-1">Ejemplos:</p>
                  <p className="text-[#94a3b8] text-xs">&ldquo;Mathius, inicio turno placa ABC-123 km 45230&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">&ldquo;Mathius, vamos a la batería 210&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">&ldquo;Mathius, pozo 17109 bombeando 3 crudo 30 agua&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">&ldquo;Mathius, ¿qué pozos faltan?&rdquo;</p>
                  <p className="text-[#94a3b8] text-xs">&ldquo;Mathius, copia los de ayer&rdquo;</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5',
                  msg.role === 'user' ? 'bg-[#6366f1]/15 text-white rounded-br-sm' : 'bg-[#1a2d4a] text-white rounded-bl-sm',
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

            {listenState === 'processing' && (
              <div className="flex justify-start">
                <div className="bg-[#1a2d4a] rounded-2xl px-4 py-3 rounded-bl-sm flex gap-1.5">
                  <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#6366f1] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {listenState !== 'processing' && listenState !== 'recording' && (
            <div className="px-3 pb-2 shrink-0">
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {currentSuggestions.map((sug, i) => (
                  <button key={i} onClick={() => handleSendText(sug)} className="shrink-0 px-3 py-1.5 rounded-full bg-[#6366f1]/10 border border-[#6366f1]/25 text-[#a5b4fc] text-[11px] font-medium hover:bg-[#6366f1]/20 active:scale-95 transition-all whitespace-nowrap">
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-[#ef4444]/15 border-t border-[#ef4444]/30 shrink-0">
              <p className="text-[#ef4444] text-xs">{error}</p>
            </div>
          )}

          {/* Text input */}
          <div className="border-t border-[#6366f1]/20 px-3 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder='Escriba o diga "Mathius..."'
                disabled={listenState === 'processing' || listenState === 'speaking'}
                className="flex-1 bg-[#112240] border border-[#1e3a5f] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#6366f1]/50 disabled:opacity-50"
              />
              {inputText.trim() && (
                <button onClick={() => handleSendText()} disabled={listenState === 'processing'} className="w-10 h-10 rounded-xl bg-[#6366f1] text-white flex items-center justify-center active:scale-90 transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
