'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, cn } from '@/lib/utils';

export default function JornadaPage() {
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [placa, setPlaca] = useState('');
  const [kmInicio, setKmInicio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jornada, setJornada] = useState<any>(null);
  const [loadingJornada, setLoadingJornada] = useState(true);

  // Check for existing active jornada
  useEffect(() => {
    if (!user) return;
    authFetch('/api/jornadas?estado=ACTIVA')
      .then(r => r.json())
      .then(json => {
        const arr = json.data || json;
        if (Array.isArray(arr) && arr.length > 0) {
          setJornada(arr[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingJornada(false));
  }, [user, authFetch]);

  async function handleIniciar() {
    if (!placa.trim()) {
      setError('Ingrese la placa del vehículo');
      return;
    }
    if (!kmInicio.trim()) {
      setError('Ingrese el kilometraje inicial');
      return;
    }
    setError('');
    setSaving(true);

    try {
      const res = await authFetch('/api/jornadas', {
        method: 'POST',
        body: JSON.stringify({
          turno: new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'DIA' : 'NOCHE',
          vehiculo: { placa: placa.toUpperCase(), kmInicio: Number(kmInicio) },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setJornada(json.data || json);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Error al iniciar jornada');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  async function handleCerrar() {
    if (!jornada) return;
    const kmFin = prompt('Ingrese kilometraje final:');
    if (!kmFin) return;

    try {
      const res = await authFetch(`/api/jornadas/${jornada._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          estado: 'CERRADA',
          'vehiculo.kmFin': Number(kmFin),
          horaLlegada: new Date().toISOString(),
          resumen: {
            kmRecorridos: Number(kmFin) - (jornada.vehiculo?.kmInicio || 0),
            totalActividades: jornada.actividades?.length || 0,
          },
        }),
      });
      if (res.ok) {
        router.push('/home');
      }
    } catch {
      setError('Error al cerrar jornada');
    }
  }

  if (authLoading || loadingJornada) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <svg className="animate-spin h-8 w-8 text-cyan" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  if (!user) return null;

  // Active jornada view
  if (jornada) {
    const actividades = jornada.actividades || [];
    const km = jornada.vehiculo?.kmInicio || 0;

    return (
      <div className="flex flex-col min-h-screen bg-navy">
        <header className="bg-[#112240] border-b border-[#1e3a5f] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/home')} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-[#1e3a5f]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Jornada Activa</h1>
            <p className="text-[#94a3b8] text-sm">{formatDate(new Date())} | {jornada.turno}</p>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 overflow-y-auto pb-32">
          {/* Vehicle info */}
          <div className="bg-[#112240] rounded-2xl p-4 mb-4 border border-[#1e3a5f]">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🚗</span>
              <div>
                <p className="text-white font-bold">{jornada.vehiculo?.placa}</p>
                <p className="text-[#94a3b8] text-sm">Km inicio: {km.toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0a192f] rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-[#94a3b8]">Actividades</p>
                <p className="text-lg font-bold text-white">{actividades.length}</p>
              </div>
              <div className="bg-[#0a192f] rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-[#94a3b8]">Hora inicio</p>
                <p className="text-sm font-bold text-white">{new Date(jornada.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="bg-[#0a192f] rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-[#94a3b8]">Turno</p>
                <p className="text-lg font-bold text-cyan">{jornada.turno}</p>
              </div>
            </div>
          </div>

          {/* Activities */}
          <h3 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Actividades</h3>
          {actividades.length === 0 ? (
            <div className="bg-[#112240] rounded-xl p-6 border border-[#1e3a5f] text-center">
              <p className="text-[#94a3b8] text-sm">Sin actividades registradas</p>
              <p className="text-[#94a3b8] text-xs mt-1">Use el asistente 🤖 para registrar actividades por voz</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actividades.map((act: any, i: number) => (
                <div key={i} className="bg-[#112240] rounded-xl p-3 border border-[#1e3a5f]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {act.tipo === 'CIERRE_BATERIA' ? '📋' : act.tipo === 'INSPECCION' ? '🔍' : act.tipo === 'TOMA_PARAMETROS' ? '📊' : '📝'}
                    </span>
                    <p className="text-white text-sm font-medium">{act.tipo?.replace(/_/g, ' ')}</p>
                    <span className="text-[#94a3b8] text-xs ml-auto">
                      {act.horaLlegada ? new Date(act.horaLlegada).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  {act.descripcion && <p className="text-[#94a3b8] text-xs mt-1">{act.descripcion}</p>}
                  {act.ubicacionId && <p className="text-cyan text-xs mt-0.5">{act.ubicacionId}</p>}
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Bottom actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#112240] border-t border-[#1e3a5f] px-4 py-3 z-30">
          <button
            onClick={handleCerrar}
            className="w-full py-3.5 rounded-xl bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30 font-bold text-base"
          >
            CERRAR JORNADA
          </button>
        </div>
      </div>
    );
  }

  // New jornada form
  return (
    <div className="flex flex-col min-h-screen bg-navy">
      <header className="bg-[#112240] border-b border-[#1e3a5f] px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/home')} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-[#1e3a5f]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-lg font-bold text-white">Iniciar Jornada</h1>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="bg-[#112240] rounded-2xl p-6 border border-[#1e3a5f]">
          <div className="text-center mb-6">
            <span className="text-4xl">🚗</span>
            <h2 className="text-xl font-bold text-white mt-2">Registro de Vehículo</h2>
            <p className="text-[#94a3b8] text-sm mt-1">{formatDate(new Date())}</p>
          </div>

          <div className="mb-4">
            <label className="block text-[#94a3b8] text-sm mb-2 font-medium">Placa del vehículo</label>
            <input
              type="text"
              value={placa}
              onChange={e => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC-123"
              className="w-full p-4 text-xl text-center font-bold rounded-xl bg-[#0a192f] border border-[#1e3a5f] uppercase tracking-widest"
              maxLength={10}
            />
          </div>

          <div className="mb-6">
            <label className="block text-[#94a3b8] text-sm mb-2 font-medium">Kilometraje inicial</label>
            <input
              type="number"
              value={kmInicio}
              onChange={e => setKmInicio(e.target.value)}
              placeholder="45230"
              className="w-full p-4 text-xl text-center font-bold rounded-xl bg-[#0a192f] border border-[#1e3a5f]"
            />
          </div>

          {error && (
            <div className="bg-[#ef4444]/20 border border-[#ef4444]/30 rounded-xl p-3 mb-4">
              <p className="text-[#ef4444] text-sm text-center">{error}</p>
            </div>
          )}

          <button
            onClick={handleIniciar}
            disabled={saving}
            className={cn(
              'w-full py-4 rounded-xl font-bold text-lg transition-all',
              saving ? 'bg-cyan/30 text-cyan/50' : 'bg-cyan text-[#0a192f] active:scale-95'
            )}
          >
            {saving ? 'Registrando...' : 'INICIAR JORNADA'}
          </button>
        </div>

        <p className="text-center text-[#94a3b8] text-xs mt-4">
          También puede iniciar la jornada por voz con el asistente 🤖
        </p>
      </main>
    </div>
  );
}
