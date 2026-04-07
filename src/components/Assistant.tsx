'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: any;
}

interface AssistantContext {
  bateriaId?: string;
  cierreId?: string;
  pozoId?: string;
  screen?: string;
}

export default function Assistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();

  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [context, setContext] = useState<AssistantContext>({});
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Init TTS
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update context from current URL
  useEffect(() => {
    const parts = pathname.split('/');
    const newCtx: AssistantContext = { screen: pathname };
    if (parts[1] === 'cierre' && parts[2]) {
      newCtx.bateriaId = decodeURIComponent(parts[2]);
    }
    if (parts[3] === 'pozo' && parts[4]) {
      newCtx.pozoId = decodeURIComponent(parts[4]);
    }
    setContext(prev => ({ ...prev, ...newCtx }));
  }, [pathname]);

  // Detect cierreId from the page
  useEffect(() => {
    if (!context.bateriaId || !token) return;
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(context.bateriaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        const arr = json.data || json;
        if (Array.isArray(arr)) {
          const editable = arr.find((c: any) => c.estado === 'EN_PROGRESO' || c.estado === 'RECHAZADO');
          if (editable) setContext(prev => ({ ...prev, cierreId: editable._id }));
        }
      })
      .catch(() => {});
  }, [context.bateriaId, token]);

  // Speak text using browser TTS
  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-PE';
    utterance.rate = 1.1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, []);

  // Handle navigation actions
  const handleAction = useCallback((action: any, actionResult: any) => {
    if (!action) return;

    if (action.tipo === 'NAVEGAR' && actionResult?.success) {
      if (action.pantalla === 'home') {
        router.push('/home');
      } else if (action.pantalla === 'cierre' && action.bateriaId) {
        router.push(`/cierre/${encodeURIComponent(action.bateriaId)}`);
        setContext(prev => ({ ...prev, bateriaId: action.bateriaId }));
      }
    }

    if (action.tipo === 'INICIAR_JORNADA' && actionResult?.success) {
      // Refresh the page
      router.refresh();
    }

    if ((action.tipo === 'REGISTRAR_POZO' || action.tipo === 'REGISTRAR_POZO_PARADO') && actionResult?.success) {
      // If on the well list page, trigger refresh
      if (pathname.includes('/cierre/') && !pathname.includes('/pozo/')) {
        router.refresh();
      }
    }

    if (action.tipo === 'COPIAR_AYER' && actionResult?.success) {
      router.refresh();
    }
  }, [router, pathname]);

  // Record and send to assistant
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
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setRecording(false);

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size < 1000) {
        setError('Grabación muy corta');
        return;
      }

      setProcessing(true);

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('context', JSON.stringify(context));
        formData.append('history', JSON.stringify(
          messages.map(m => ({ role: m.role, content: m.content }))
        ));

        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const json = await res.json();

        if (res.ok) {
          // Add user message (transcript)
          const userMsg: Message = {
            role: 'user',
            content: json.transcript,
            timestamp: new Date(),
          };

          // Add assistant response
          const assistantMsg: Message = {
            role: 'assistant',
            content: json.response?.mensaje || 'No entendí, repita por favor.',
            timestamp: new Date(),
            action: json.response?.accion,
          };

          setMessages(prev => [...prev, userMsg, assistantMsg]);

          // Speak the response
          if (json.response?.mensaje) {
            speak(json.response.mensaje);
          }

          // Execute navigation/action
          if (json.response?.accion) {
            handleAction(json.response.accion, json.actionResult);
          }
        } else {
          setError(json.error || 'Error del asistente');
        }
      } catch {
        setError('Error de conexión');
      } finally {
        setProcessing(false);
      }
    };

    mediaRecorder.start();
    setRecording(true);

    // Auto-stop at 30s
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
    }, 30000);
  }

  // Don't show if not logged in or on login page
  if (!user || !token || pathname === '/') return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all',
          'bottom-20 right-4',
          open ? 'bg-danger' : 'bg-cyan',
          speaking && 'animate-pulse'
        )}
      >
        {open ? (
          <span className="text-white text-2xl font-bold">✕</span>
        ) : (
          <span className="text-navy text-2xl">🤖</span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed z-50 bottom-36 right-4 left-4 sm:left-auto sm:w-96 bg-[#0d1f3c] border border-cyan/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: '60vh' }}
        >
          {/* Header */}
          <div className="bg-cyan/10 border-b border-cyan/20 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan/20 flex items-center justify-center">
              <span className="text-lg">🤖</span>
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Asistente RT NEXT</p>
              <p className="text-cyan text-xs">
                {recording ? '🔴 Escuchando...' : processing ? '⚡ Procesando...' : speaking ? '🔊 Hablando...' : '● En línea'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setContext(prev => ({ screen: prev.screen })); }}
                className="text-muted text-xs hover:text-white"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: '200px' }}>
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">🤖</p>
                <p className="text-muted text-sm">Hola {user.nombre?.split(' ')[0]}!</p>
                <p className="text-muted text-sm">Toca el micrófono y háblame.</p>
                <p className="text-muted text-xs mt-2 italic">
                  &ldquo;Inicio turno, camioneta placa ABC-123&rdquo;
                </p>
                <p className="text-muted text-xs italic">
                  &ldquo;Pozo 17109, bombeando, 3 de crudo&rdquo;
                </p>
                <p className="text-muted text-xs italic">
                  &ldquo;Está parado por preventivo&rdquo;
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5',
                  msg.role === 'user'
                    ? 'bg-cyan/20 text-white rounded-br-md'
                    : 'bg-[#1a2d4a] text-white rounded-bl-md'
                )}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  {msg.action && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs">
                        {msg.action.tipo === 'REGISTRAR_POZO' && '✅'}
                        {msg.action.tipo === 'REGISTRAR_POZO_PARADO' && '🔴'}
                        {msg.action.tipo === 'NAVEGAR' && '📍'}
                        {msg.action.tipo === 'INICIAR_JORNADA' && '🚗'}
                        {msg.action.tipo === 'COPIAR_AYER' && '📋'}
                      </span>
                      <span className="text-[10px] text-cyan/70 font-medium uppercase">
                        {msg.action.tipo?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted mt-1">
                    {msg.timestamp.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {processing && (
              <div className="flex justify-start">
                <div className="bg-[#1a2d4a] rounded-2xl px-4 py-3 rounded-bl-md">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 bg-danger/20 border-t border-danger/30">
              <p className="text-danger text-xs">{error}</p>
            </div>
          )}

          {/* Record button */}
          <div className="border-t border-cyan/20 px-4 py-3">
            <button
              onClick={handleRecord}
              disabled={processing}
              className={cn(
                'w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all',
                recording
                  ? 'bg-danger/20 border-2 border-danger text-danger animate-pulse'
                  : processing
                  ? 'bg-cyan/10 border-2 border-cyan/30 text-cyan/50'
                  : 'bg-cyan/20 border-2 border-cyan text-cyan active:scale-95'
              )}
            >
              {processing ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Procesando...
                </>
              ) : recording ? (
                <>
                  <span className="text-xl">⏹</span>
                  Toque para detener
                </>
              ) : (
                <>
                  <span className="text-xl">🎤</span>
                  Mantener y hablar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
