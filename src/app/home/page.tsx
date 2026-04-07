'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import { formatDate, cn } from '@/lib/utils';

interface BateriaInfo {
  _id: string;
  codigo: string;
  nombre: string;
  campo: string;
  pozosCount: number;
  potencialTotal: number;
  cierreHoy: {
    estado: string;
    pozosRegistrados: number;
    totalPozos: number;
    totalCrudo: number;
    totalAgua: number;
  } | null;
}

export default function HomePage() {
  const router = useRouter();
  const { user, token, loading: authLoading, logout, authFetch } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [baterias, setBaterias] = useState<BateriaInfo[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [jornada, setJornada] = useState<any>(null);

  const loadBaterias = useCallback(async () => {
    if (!user || !token) return;

    try {
      // Check for active jornada
      try {
        const jorRes = await authFetch('/api/jornadas?estado=ACTIVA');
        if (jorRes.ok) {
          const jorJson = await jorRes.json();
          const jorArr = jorJson.data || jorJson;
          if (Array.isArray(jorArr) && jorArr.length > 0) setJornada(jorArr[0]);
        }
      } catch { /* ignore */ }

      // Fetch all baterias
      const batRes = await authFetch('/api/baterias');
      if (!batRes.ok) return;
      const batJson = await batRes.json();
      const misBaterias = batJson.data || batJson;

      // For each battery, get pozo count and check for today's cierre
      const enriched: BateriaInfo[] = await Promise.all(
        misBaterias.map(async (bat: any) => {
          let pozosCount = 0;
          let potencialTotal = 0;
          let cierreHoy = null;
          try {
            const pozRes = await authFetch(`/api/pozos?bateria=${encodeURIComponent(bat.codigo)}`);
            if (pozRes.ok) {
              const pozJson = await pozRes.json();
              const pozData = pozJson.data || pozJson;
              pozosCount = Array.isArray(pozData) ? pozData.length : 0;
              potencialTotal = Array.isArray(pozData) ? pozData.reduce((s: number, p: any) => s + (p.potencialCrudo || 0), 0) : 0;
            }
          } catch { /* ignore */ }
          // Check for today's cierre
          try {
            const today = new Date().toISOString().split('T')[0];
            const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bat.codigo)}`);
            if (cierreRes.ok) {
              const cierreJson = await cierreRes.json();
              const cierreArr = cierreJson.data || cierreJson;
              if (Array.isArray(cierreArr) && cierreArr.length > 0) {
                const c = cierreArr[0];
                cierreHoy = {
                  estado: c.estado,
                  pozosRegistrados: c.pozosRegistrados || 0,
                  totalPozos: c.totalPozos || pozosCount,
                  totalCrudo: c.totalCrudo || 0,
                  totalAgua: c.totalAgua || 0,
                };
              }
            }
          } catch { /* ignore */ }

          return {
            _id: bat._id,
            codigo: bat.codigo,
            nombre: bat.nombre,
            campo: bat.zona || 'Lote I',
            pozosCount,
            potencialTotal,
            cierreHoy,
          };
        })
      );

      setBaterias(enriched);
    } catch {
      // fallback: show empty
    } finally {
      setLoadingData(false);
    }
  }, [user, token, authFetch]);

  useEffect(() => {
    if (user && token) {
      loadBaterias();
    }
  }, [user, token, loadBaterias]);

  // Redirect supervisors
  useEffect(() => {
    if (user && (user.rol === 'supervisor_contratista' || user.rol === 'supervisor_cliente')) {
      router.push('/supervisor');
    }
  }, [user, router]);

  if (authLoading) {
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

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const turno = hour >= 6 && hour < 18 ? 'Turno Dia' : 'Turno Noche';

  function getBateriaStatus(bat: BateriaInfo) {
    if (!bat.cierreHoy) {
      return { label: 'SIN INICIAR', color: 'bg-muted/30 text-muted', canContinue: false };
    }
    const c = bat.cierreHoy;
    if (c.estado === 'APROBADO') return { label: 'APROBADO', color: 'bg-success/20 text-success', canContinue: false };
    if (c.estado === 'ENVIADO') return { label: 'ENVIADO', color: 'bg-warning/20 text-warning', canContinue: false };
    if (c.estado === 'RECHAZADO') return { label: 'RECHAZADO', color: 'bg-danger/20 text-danger', canContinue: true };
    return {
      label: `EN PROGRESO ${c.pozosRegistrados}/${c.totalPozos}`,
      color: 'bg-cyan/20 text-cyan',
      canContinue: true,
    };
  }

  function handleBateriaAction(bat: BateriaInfo) {
    router.push(`/cierre/${encodeURIComponent(bat.codigo)}`);
  }

  const initials = user.nombre
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-navy-surface border-b border-navy-light">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-navy-light transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">
          <span className="text-white">RT</span>
          <span className="text-cyan"> NEXT</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success" />
          <div className="w-11 h-11 rounded-full bg-cyan/20 flex items-center justify-center text-cyan font-bold text-sm">
            {initials}
          </div>
        </div>
      </header>

      {/* Slide menu */}
      {menuOpen && (
        <div className="absolute inset-0 z-50 flex">
          <div className="w-72 bg-navy-surface border-r border-navy-light p-6 flex flex-col h-full shadow-2xl">
            <div className="mb-8">
              <p className="text-white font-bold text-lg">{user.nombre}</p>
              <p className="text-muted text-sm capitalize">{user.rol}</p>
              <p className="text-navy-light text-xs mt-1">{user.turno}</p>
            </div>
            <nav className="flex-1 space-y-2">
              <button
                onClick={() => { setMenuOpen(false); router.push('/home'); }}
                className="w-full text-left px-4 py-3 rounded-xl text-white hover:bg-navy-light transition-colors min-h-[44px]"
              >
                Inicio
              </button>
              {(user.rol === 'supervisor_contratista' || user.rol === 'supervisor_cliente') && (
                <button
                  onClick={() => { setMenuOpen(false); router.push('/supervisor'); }}
                  className="w-full text-left px-4 py-3 rounded-xl text-white hover:bg-navy-light transition-colors min-h-[44px]"
                >
                  Dashboard Supervisor
                </button>
              )}
            </nav>
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="w-full px-4 py-3 rounded-xl text-danger hover:bg-danger/10 text-left font-medium transition-colors min-h-[44px]"
            >
              Cerrar Sesion
            </button>
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-4 py-6 overflow-y-auto pb-24">
        {/* Greeting */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">{greeting}, {user.nombre.split(' ')[0]}</h2>
          <p className="text-muted mt-1">{turno} &middot; {formatDate(now)}</p>
        </div>

        {/* Jornada section */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Jornada
          </h3>
          <div className="bg-navy-surface rounded-xl p-5 border border-navy-light">
            {jornada ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                    <span className="text-2xl">🚗</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-text-primary font-medium">Jornada activa</p>
                    <p className="text-muted text-sm">
                      {jornada.vehiculo?.placa} | Km {jornada.vehiculo?.kmInicio?.toLocaleString()} | {jornada.actividades?.length || 0} actividades
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/jornada')}
                  className="w-full mt-4 py-3.5 rounded-xl bg-success/20 text-success border border-success/30 font-bold text-base transition-all active:scale-98 min-h-[48px]"
                >
                  VER JORNADA
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-cyan/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12,6 12,12 16,14" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-text-primary font-medium">Sin jornada activa</p>
                    <p className="text-muted text-sm">Inicie su jornada para registrar actividades</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/jornada')}
                  className="w-full mt-4 py-3.5 rounded-xl bg-cyan/20 text-cyan border border-cyan/30 font-bold text-base transition-all active:scale-98 min-h-[48px]"
                >
                  INICIAR JORNADA
                </button>
              </>
            )}
          </div>
        </div>

        {/* Batteries section */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Mis Baterias Hoy
          </h3>
        </div>

        {loadingData ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <svg className="animate-spin h-6 w-6 text-cyan" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-muted text-sm">Cargando baterias...</p>
          </div>
        ) : baterias.length === 0 ? (
          <div className="bg-navy-surface rounded-xl p-8 border border-navy-light text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy-light flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
              </svg>
            </div>
            <p className="text-text-primary font-medium mb-1">Sin baterias asignadas</p>
            <p className="text-muted text-sm">Contacte a su supervisor para la asignacion</p>
          </div>
        ) : (
          <div className="space-y-4">
            {baterias.map(bat => {
              const status = getBateriaStatus(bat);
              const isCompleted = status.label === 'APROBADO' || status.label === 'ENVIADO';

              return (
                <div
                  key={bat._id}
                  className="bg-navy-surface rounded-2xl p-5 border border-navy-light"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-lg font-bold text-white">{bat.codigo} — {bat.nombre}</h4>
                      <p className="text-muted text-sm mt-1">
                        {bat.pozosCount} pozos &middot; Potencial: {bat.potencialTotal} BLS
                      </p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="mb-4">
                    <span className={cn('px-3 py-1.5 rounded-full text-xs font-bold', status.color)}>
                      {status.label}
                    </span>
                  </div>

                  {/* Progress if in progress */}
                  {bat.cierreHoy && bat.cierreHoy.estado === 'EN_PROGRESO' && (
                    <div className="mb-4">
                      <div className="w-full h-2 bg-navy rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan rounded-full transition-all"
                          style={{ width: `${bat.cierreHoy.totalPozos > 0 ? (bat.cierreHoy.pozosRegistrados / bat.cierreHoy.totalPozos) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted">
                        <span>Crudo: {bat.cierreHoy.totalCrudo} BLS</span>
                        <span>Agua: {bat.cierreHoy.totalAgua} BLS</span>
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  {!isCompleted && (
                    <button
                      onClick={() => handleBateriaAction(bat)}
                      className={cn(
                        'w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-98 min-h-[48px]',
                        status.canContinue
                          ? 'bg-cyan text-navy'
                          : 'bg-cyan/20 text-cyan border border-cyan/30'
                      )}
                    >
                      {status.canContinue ? 'CONTINUAR' : 'INICIAR CIERRE'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-navy-surface border-t border-navy-light px-4 py-2 flex justify-around z-40">
        <button
          onClick={() => router.push('/home')}
          className="flex flex-col items-center gap-1 py-2 px-4 text-cyan min-h-[44px]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" />
          </svg>
          <span className="text-xs font-medium">Inicio</span>
        </button>
        <button
          onClick={() => {}}
          className="flex flex-col items-center gap-1 py-2 px-4 text-muted min-h-[44px]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-xs font-medium">Historial</span>
        </button>
      </nav>
    </div>
  );
}
