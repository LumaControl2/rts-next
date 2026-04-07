'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function NovedadesPage({
  params,
}: {
  params: Promise<{ bateriaId: string }>;
}) {
  const { bateriaId: rawBateriaId } = use(params);
  const bateriaId = decodeURIComponent(rawBateriaId);
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [bateriaLabel, setBateriaLabel] = useState(bateriaId);
  const [cierreId, setCierreId] = useState('');
  const [novedades, setNovedades] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch battery info
      const batRes = await authFetch('/api/baterias');
      if (batRes.ok) {
        const batJson = await batRes.json();
        const allBats = batJson.data || batJson;
        const found = (Array.isArray(allBats) ? allBats : []).find((b: any) => b._id === bateriaId || b.codigo === bateriaId);
        if (found) setBateriaLabel(found.codigo);
      }

      // Fetch cierre
      const today = new Date().toISOString().slice(0, 10);
      const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bateriaId)}`);
      if (cierreRes.ok) {
        const cierreJson = await cierreRes.json();
        const cierreList = cierreJson.data || cierreJson;
        const cierreData = Array.isArray(cierreList) ? cierreList[0] : cierreList;
        if (cierreData?._id) {
          setCierreId(cierreData._id);
          if (cierreData.novedades) setNovedades(cierreData.novedades);
        }
      }
    } catch {
      // Error loading
    } finally {
      setLoading(false);
    }
  }, [user, bateriaId, authFetch]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  function handleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-PE';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    setVoiceActive(true);

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      setNovedades(prev => prev ? prev + ' ' + transcript.trim() : transcript.trim());
    };

    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);

    recognition.start();

    // Stop after 30 seconds
    setTimeout(() => {
      try { recognition.stop(); } catch { /* ignore */ }
    }, 30000);
  }

  async function handleSave() {
    if (!cierreId) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/cierres/${cierreId}`, {
        method: 'PUT',
        body: JSON.stringify({ novedades }),
      });

      if (res.ok) {
        router.push(`/cierre/${encodeURIComponent(bateriaId)}/resumen`);
      } else {
        setSaving(false);
      }
    } catch {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-cyan" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-muted text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* Header */}
      <header className="bg-navy-mid border-b border-navy-light px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/cierre/${encodeURIComponent(bateriaId)}/tanques`)}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-navy-light"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">{bateriaLabel} — Novedades</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 overflow-y-auto pb-28">
        <div className="bg-navy-light rounded-2xl p-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-2">Novedades del Turno</h3>
          <p className="text-muted text-sm mb-4">
            Registre las novedades, observaciones y eventos relevantes ocurridos durante el turno.
          </p>
          <textarea
            value={novedades}
            onChange={e => setNovedades(e.target.value)}
            placeholder="Novedades del turno..."
            rows={12}
            className="w-full p-4 text-base rounded-xl bg-navy-mid border border-navy-light resize-none leading-relaxed"
          />
          <div className="mt-2 flex justify-between items-center">
            <button
              onClick={handleVoice}
              disabled={voiceActive}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                voiceActive
                  ? 'bg-cyan/20 border-cyan text-cyan animate-pulse'
                  : 'bg-navy-mid border-navy-light text-muted hover:border-cyan hover:text-cyan'
              )}
            >
              <span>{'\uD83C\uDFA4'}</span>
              {voiceActive ? 'Escuchando...' : 'Dictar (requiere senal)'}
            </button>
            <span className="text-muted text-xs">{novedades.length} caracteres</span>
          </div>
        </div>
      </main>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-navy-mid border-t border-navy-light z-40">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-98',
            saving
              ? 'bg-navy-light text-muted cursor-not-allowed'
              : 'bg-cyan text-navy'
          )}
        >
          {saving ? 'GUARDANDO...' : 'SIGUIENTE'}
        </button>
      </div>
    </div>
  );
}
