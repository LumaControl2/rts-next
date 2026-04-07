'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, getTodayStr, calcularKPI, cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Bateria {
  _id: string;
  codigo: string;
  nombre: string;
  zona: 'Este' | 'Centro' | 'Oeste';
  tanques: { nombre: string; producto: string; capacidad?: number }[];
  activa: boolean;
}

interface Lectura {
  _id?: string;
  pozoId: string;
  crudoBls: number;
  aguaBls: number;
  presionTubos: number;
  presionForros: number;
  gpm: number;
  carrera: number;
  timerOn: number;
  timerOff: number;
  estadoPozo: 'BOMBEANDO' | 'PARADO';
  codigoDiferida: string | null;
  comentarioDiferida: string;
  comentarios: string;
  fotos: string[];
  horaRegistro: string;
}

interface TanqueCierre {
  nombre: string;
  producto: string;
  medidaAnterior: number;
  medidaActual: number;
  aguaLibre: number;
}

interface Bombeo {
  volumen: number;
  horaInicio: string;
  horaFin: string;
  destino: string;
  producto: 'PETROLEO' | 'AGUA';
}

interface CierreData {
  _id: string;
  fecha: string;
  turno: 'DIA' | 'NOCHE';
  bateriaId: string;
  operadorId: { _id: string; nombre: string } | null;
  estado: 'EN_PROGRESO' | 'COMPLETO' | 'ENVIADO' | 'APROBADO' | 'RECHAZADO';
  lecturas: Lectura[];
  tanques: TanqueCierre[];
  bombeos: Bombeo[];
  presionCierre: number;
  novedades: string;
  totalCrudo: number;
  totalAgua: number;
  totalDiferida: number;
  pozosRegistrados: number;
  pozosBombeando: number;
  pozosParados: number;
  totalPozos: number;
  potencialTotal: number;
  kpiProduccion: number;
  enviadoEn: string;
  aprobadoPor: { _id: string; nombre: string } | null;
  aprobadoEn: string;
  comentarioRechazo: string;
  createdAt: string;
  updatedAt: string;
}

interface PozoData {
  _id: string;
  numero: string;
  bateria: string;
  zona: string;
  grupo: string;
  sistema: string;
  potencialCrudo: number;
  potencialAgua: number;
  activo: boolean;
}

interface Alerta {
  tipo: string;
  mensaje: string;
  severity: 'danger' | 'warning' | 'info';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return n.toLocaleString('es-PE', { maximumFractionDigits: 1 });
}

function kpiColor(kpi: number): string {
  if (kpi >= 85) return 'text-success';
  if (kpi >= 60) return 'text-warning';
  return 'text-danger';
}

function kpiBgColor(kpi: number): string {
  if (kpi >= 85) return 'bg-success/15 border-success/30';
  if (kpi >= 60) return 'bg-warning/15 border-warning/30';
  return 'bg-danger/15 border-danger/30';
}

function semaforoIcon(kpi: number | null): string {
  if (kpi === null) return '\u2B1C';
  if (kpi >= 85) return '\uD83D\uDFE2';
  if (kpi >= 60) return '\uD83D\uDFE1';
  return '\uD83D\uDD34';
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    EN_PROGRESO: 'bg-cyan/20 text-cyan',
    COMPLETO: 'bg-cyan/20 text-cyan',
    ENVIADO: 'bg-warning/20 text-warning',
    APROBADO: 'bg-success/20 text-success',
    RECHAZADO: 'bg-danger/20 text-danger',
    PENDIENTE: 'bg-muted/20 text-muted',
  };
  return map[estado] || 'bg-muted/20 text-muted';
}

function estadoLabel(estado: string): string {
  const map: Record<string, string> = {
    EN_PROGRESO: 'EN PROGRESO',
    COMPLETO: 'COMPLETO',
    ENVIADO: 'ENVIADO',
    APROBADO: 'APROBADO',
    RECHAZADO: 'RECHAZADO',
    PENDIENTE: 'PENDIENTE',
  };
  return map[estado] || estado;
}

// Spinner SVG
function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SupervisorDashboard() {
  const router = useRouter();
  const { user, token, loading: authLoading, logout, authFetch } = useAuth();

  // Data state
  const [baterias, setBaterias] = useState<Bateria[]>([]);
  const [cierres, setCierres] = useState<CierreData[]>([]);
  const [pozos, setPozos] = useState<PozoData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // UI state
  const [expandedBat, setExpandedBat] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
    if (!authLoading && user && user.rol === 'operador') {
      router.push('/home');
    }
  }, [user, authLoading, router]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const fetchCierres = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setRefreshing(true);
    try {
      const today = getTodayStr();
      const res = await authFetch(`/api/cierres?fecha=${today}`);
      if (res.ok) {
        const json = await res.json();
        setCierres(json.data || []);
      }
      setLastUpdate(new Date());
    } catch {
      // network error — keep existing data
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [token, authFetch]);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      const [batRes, cierreRes, pozoRes] = await Promise.all([
        authFetch('/api/baterias'),
        authFetch(`/api/cierres?fecha=${getTodayStr()}`),
        authFetch('/api/pozos'),
      ]);

      if (batRes.ok) {
        const batJson = await batRes.json();
        setBaterias(batJson.data || batJson);
      }
      if (cierreRes.ok) {
        const cierreJson = await cierreRes.json();
        setCierres(cierreJson.data || []);
      }
      if (pozoRes.ok) {
        const pozoJson = await pozoRes.json();
        setPozos(pozoJson.data || pozoJson);
      }
      setLastUpdate(new Date());
    } catch {
      // keep empty
    } finally {
      setLoadingData(false);
    }
  }, [token, authFetch]);

  // Initial fetch
  useEffect(() => {
    if (user && token) {
      fetchAll();
    }
  }, [user, token, fetchAll]);

  // Polling every 15s — only after initial load
  useEffect(() => {
    if (loadingData) return;
    intervalRef.current = setInterval(() => {
      fetchCierres(true);
    }, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadingData, fetchCierres]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  async function handleApprove(cierreId: string) {
    setActionLoading(cierreId);
    try {
      const res = await authFetch(`/api/cierres/${cierreId}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'APROBADO' }),
      });
      if (res.ok) {
        await fetchCierres();
      }
    } catch {
      // error
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectModal || !rejectComment.trim()) return;
    setActionLoading(rejectModal);
    try {
      const res = await authFetch(`/api/cierres/${rejectModal}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'RECHAZADO', comentarioRechazo: rejectComment }),
      });
      if (res.ok) {
        setRejectModal(null);
        setRejectComment('');
        await fetchCierres();
      }
    } catch {
      // error
    } finally {
      setActionLoading(null);
    }
  }

  // -----------------------------------------------------------------------
  // Loading / guard
  // -----------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-cyan" />
          <p className="text-muted text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user || user.rol === 'operador') return null;

  // -----------------------------------------------------------------------
  // Computed data
  // -----------------------------------------------------------------------
  const today = new Date();

  // Map cierre by bateriaId for quick lookup
  const cierreByBat: Record<string, CierreData> = {};
  cierres.forEach(c => {
    // If multiple cierres for same bat, take most recent
    if (!cierreByBat[c.bateriaId] || new Date(c.updatedAt) > new Date(cierreByBat[c.bateriaId].updatedAt)) {
      cierreByBat[c.bateriaId] = c;
    }
  });

  // Total pozos activos from pozos collection
  const totalPozosActivos = pozos.filter(p => p.activo).length;

  // KPI aggregates from cierres
  const totalCrudo = cierres.reduce((s, c) => s + (c.totalCrudo || 0), 0);
  const totalAgua = cierres.reduce((s, c) => s + (c.totalAgua || 0), 0);
  const totalDiferida = cierres.reduce((s, c) => s + (c.totalDiferida || 0), 0);
  const totalPozosBombeando = cierres.reduce((s, c) => s + (c.pozosBombeando || 0), 0);
  const totalPotencial = pozos.filter(p => p.activo).reduce((s, p) => s + (p.potencialCrudo || 0), 0);
  const kpiGlobal = calcularKPI(totalCrudo, totalPotencial);

  // Build alerts
  const alertas: Alerta[] = [];

  // Batteries without cierre
  baterias.forEach(bat => {
    if (!cierreByBat[bat._id]) {
      alertas.push({
        tipo: 'SIN CIERRE',
        mensaje: `${bat.codigo} (${bat.nombre}) no tiene cierre registrado hoy`,
        severity: 'warning',
      });
    }
  });

  // KPI < 60%
  cierres.forEach(c => {
    const bat = baterias.find(b => b._id === c.bateriaId);
    if (c.kpiProduccion > 0 && c.kpiProduccion < 60) {
      alertas.push({
        tipo: 'KPI CRITICO',
        mensaje: `${bat?.codigo || c.bateriaId}: KPI ${c.kpiProduccion}% (< 60%)`,
        severity: 'danger',
      });
    }
  });

  // Produccion no justificada
  cierres.forEach(c => {
    const bat = baterias.find(b => b._id === c.bateriaId);
    if (c.potencialTotal > 0 && (c.totalCrudo + c.totalDiferida) < c.potencialTotal * 0.5) {
      alertas.push({
        tipo: 'PRODUCCION BAJA',
        mensaje: `${bat?.codigo || c.bateriaId}: Crudo + Diferida muy por debajo del potencial`,
        severity: 'warning',
      });
    }
  });

  // Pozos parados with generic codes
  cierres.forEach(c => {
    const bat = baterias.find(b => b._id === c.bateriaId);
    const paradosSinCodigo = c.lecturas.filter(
      l => l.estadoPozo === 'PARADO' && (!l.codigoDiferida || l.codigoDiferida === '')
    );
    if (paradosSinCodigo.length > 0) {
      alertas.push({
        tipo: 'CODIGO FALTANTE',
        mensaje: `${bat?.codigo || c.bateriaId}: ${paradosSinCodigo.length} pozo(s) parado(s) sin codigo de diferida`,
        severity: 'warning',
      });
    }
  });

  // Cuadre issues (tanque discrepancy)
  cierres.forEach(c => {
    if (c.tanques && c.tanques.length > 0) {
      const bat = baterias.find(b => b._id === c.bateriaId);
      c.tanques.forEach(t => {
        if (t.producto === 'PETROLEO' || t.producto === 'AGUA') {
          const diff = Math.abs(t.medidaActual - t.medidaAnterior);
          if (diff > 0 && c.totalCrudo > 0) {
            const pct = Math.abs(diff - c.totalCrudo) / c.totalCrudo * 100;
            if (pct > 15) {
              alertas.push({
                tipo: 'CUADRE TANQUE',
                mensaje: `${bat?.codigo || c.bateriaId}: Discrepancia en tanque "${t.nombre}" (${pct.toFixed(1)}%)`,
                severity: 'danger',
              });
            }
          }
        }
      });
    }
  });

  // Sort: danger first, then warning, then info
  const severityOrder = { danger: 0, warning: 1, info: 2 };
  alertas.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Map pozos by numero for lookups inside lecturas
  const pozoByNumero: Record<string, PozoData> = {};
  pozos.forEach(p => { pozoByNumero[p.numero] = p; });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* ================================================================ */}
      {/* TOP BAR                                                          */}
      {/* ================================================================ */}
      <header className="bg-navy-surface border-b border-navy-light px-4 lg:px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg lg:text-xl font-bold">
              <span className="text-white">RT NEXT</span>
              <span className="text-cyan"> — Dashboard Supervisor</span>
            </h1>
          </div>
          {/* Center */}
          <div className="hidden md:block text-center">
            <span className="text-muted text-sm">Lote I</span>
            <span className="text-navy-light mx-2">|</span>
            <span className="text-text-primary text-sm font-medium">{formatDate(today)}</span>
          </div>
          {/* Right */}
          <div className="flex items-center gap-3">
            {refreshing && <Spinner className="h-4 w-4 text-cyan" />}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-text-primary text-sm font-medium">{user.nombre}</span>
            </div>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sub-header */}
      <div className="md:hidden bg-navy-surface border-b border-navy-light px-4 py-2 flex items-center justify-between">
        <span className="text-muted text-xs">Lote I | {formatDate(today)}</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-text-primary text-xs">{user.nombre}</span>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT                                                     */}
      {/* ================================================================ */}
      <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 pb-20">
        <div className="max-w-[1600px] mx-auto">

          {loadingData ? (
            <div className="flex flex-col items-center gap-4 py-24">
              <Spinner className="h-8 w-8 text-cyan" />
              <p className="text-muted text-sm">Cargando datos del campo...</p>
            </div>
          ) : (
            <>
              {/* ============================================================ */}
              {/* KPI CARDS                                                     */}
              {/* ============================================================ */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
                {/* Crudo */}
                <div className="bg-navy-surface rounded-2xl p-4 lg:p-5 border border-navy-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted text-xs font-semibold uppercase tracking-wider">Crudo</span>
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                        <path d="M8 12l3 3 5-6" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-white">{fmtNum(totalCrudo)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-muted text-xs">/ {fmtNum(totalPotencial)} BLS</span>
                    <span className={cn('text-xs font-bold', kpiColor(kpiGlobal))}>{kpiGlobal}%</span>
                  </div>
                </div>

                {/* Agua */}
                <div className="bg-navy-surface rounded-2xl p-4 lg:p-5 border border-navy-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted text-xs font-semibold uppercase tracking-wider">Agua</span>
                    <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5">
                        <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-cyan">{fmtNum(totalAgua)}</p>
                  <span className="text-muted text-xs">BLS</span>
                </div>

                {/* Diferida */}
                <div className="bg-navy-surface rounded-2xl p-4 lg:p-5 border border-navy-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted text-xs font-semibold uppercase tracking-wider">Diferida</span>
                    <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-danger">{fmtNum(totalDiferida)}</p>
                  <span className="text-muted text-xs">BLS perdidos</span>
                </div>

                {/* Pozos */}
                <div className="bg-navy-surface rounded-2xl p-4 lg:p-5 border border-navy-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted text-xs font-semibold uppercase tracking-wider">Pozos</span>
                    <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-bold text-white">
                    {totalPozosBombeando}
                    <span className="text-lg text-muted font-normal">/{totalPozosActivos}</span>
                  </p>
                  <span className="text-muted text-xs">bombeando / activos</span>
                </div>
              </div>

              {/* ============================================================ */}
              {/* BATTERY TABLE                                                */}
              {/* ============================================================ */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                  Baterias — Estado del Campo
                </h3>

                {/* Desktop table */}
                <div className="hidden lg:block bg-navy-surface rounded-2xl border border-navy-light overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-light">
                        <th className="text-left px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Bateria</th>
                        <th className="text-left px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Zona</th>
                        <th className="text-right px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Crudo</th>
                        <th className="text-right px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Agua</th>
                        <th className="text-right px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Diferida</th>
                        <th className="text-right px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">KPI%</th>
                        <th className="text-center px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider">Estado</th>
                        <th className="text-center px-4 py-3 text-muted font-semibold text-xs uppercase tracking-wider w-16"></th>
                      </tr>
                    </thead>
                    {baterias.map(bat => {
                      const cierre = cierreByBat[bat._id];
                      const isExpanded = expandedBat === bat._id;
                      const estado = cierre ? cierre.estado : 'PENDIENTE';
                      const kpi = cierre ? cierre.kpiProduccion : null;

                      return (
                        <tbody key={bat._id}>
                          <tr
                            onClick={() => setExpandedBat(isExpanded ? null : bat._id)}
                            className={cn(
                              'border-b border-navy-light/50 cursor-pointer transition-colors hover:bg-navy-light/30',
                              isExpanded && 'bg-navy-light/20'
                            )}
                          >
                            <td className="px-4 py-3">
                              <span className="text-white font-bold">{bat.codigo}</span>
                              <span className="text-muted ml-2">{bat.nombre}</span>
                            </td>
                            <td className="px-4 py-3 text-text-primary">{bat.zona || '—'}</td>
                            <td className="px-4 py-3 text-right text-white font-medium">
                              {cierre ? fmtNum(cierre.totalCrudo) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-cyan">
                              {cierre ? fmtNum(cierre.totalAgua) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-danger">
                              {cierre ? fmtNum(cierre.totalDiferida) : '—'}
                            </td>
                            <td className={cn('px-4 py-3 text-right font-bold', kpi !== null ? kpiColor(kpi) : 'text-muted')}>
                              {kpi !== null ? `${kpi}%` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', estadoBadge(estado))}>
                                {estadoLabel(estado)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg">{semaforoIcon(kpi)}</span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-0">
                                <ExpandedDetail
                                  cierre={cierre}
                                  bat={bat}
                                  pozoByNumero={pozoByNumero}
                                  onApprove={handleApprove}
                                  onRejectOpen={(id) => { setRejectModal(id); setRejectComment(''); }}
                                  actionLoading={actionLoading}
                                />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      );
                    })}
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="lg:hidden space-y-3">
                  {baterias.map(bat => {
                    const cierre = cierreByBat[bat._id];
                    const isExpanded = expandedBat === bat._id;
                    const estado = cierre ? cierre.estado : 'PENDIENTE';
                    const kpi = cierre ? cierre.kpiProduccion : null;

                    return (
                      <div key={bat._id} className="bg-navy-surface rounded-2xl border border-navy-light overflow-hidden">
                        <button
                          onClick={() => setExpandedBat(isExpanded ? null : bat._id)}
                          className="w-full p-4 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold">{bat.codigo} — {bat.nombre}</p>
                              {cierre ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm">
                                  <span className="text-white">Crudo: {fmtNum(cierre.totalCrudo)}</span>
                                  <span className="text-danger">Dif: {fmtNum(cierre.totalDiferida)}</span>
                                  <span className={kpiColor(cierre.kpiProduccion)}>
                                    KPI: {cierre.kpiProduccion}%
                                  </span>
                                </div>
                              ) : (
                                <p className="text-muted text-sm mt-1">Sin cierre registrado</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              <span className="text-lg">{semaforoIcon(kpi)}</span>
                              <span className={cn('text-xs px-2 py-1 rounded-full font-bold whitespace-nowrap', estadoBadge(estado))}>
                                {estadoLabel(estado)}
                              </span>
                              <svg
                                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className={cn('text-muted transition-transform', isExpanded && 'rotate-180')}
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <ExpandedDetail
                            cierre={cierre}
                            bat={bat}
                            pozoByNumero={pozoByNumero}
                            onApprove={handleApprove}
                            onRejectOpen={(id) => { setRejectModal(id); setRejectComment(''); }}
                            actionLoading={actionLoading}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ============================================================ */}
              {/* ALERTAS                                                       */}
              {/* ============================================================ */}
              {alertas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                    Alertas ({alertas.length})
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {alertas.map((a, i) => (
                      <div key={i} className={cn(
                        'rounded-xl p-3 border flex items-start gap-3',
                        a.severity === 'danger' && 'bg-danger/10 border-danger/30',
                        a.severity === 'warning' && 'bg-warning/10 border-warning/30',
                        a.severity === 'info' && 'bg-cyan/10 border-cyan/30',
                      )}>
                        <span className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5',
                          a.severity === 'danger' && 'bg-danger/20 text-danger',
                          a.severity === 'warning' && 'bg-warning/20 text-warning',
                          a.severity === 'info' && 'bg-cyan/20 text-cyan',
                        )}>
                          {a.tipo}
                        </span>
                        <span className="text-text-primary text-sm">{a.mensaje}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ================================================================ */}
      {/* AUTO-REFRESH FOOTER                                              */}
      {/* ================================================================ */}
      <footer className="fixed bottom-0 left-0 right-0 bg-navy-surface border-t border-navy-light px-4 py-2 z-40">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2">
            {refreshing && <Spinner className="h-3 w-3 text-cyan" />}
            <span>
              Ultima actualizacion: {lastUpdate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>Actualizacion automatica cada 15s</span>
          </div>
        </div>
      </footer>

      {/* ================================================================ */}
      {/* REJECT MODAL                                                     */}
      {/* ================================================================ */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-navy-surface rounded-2xl p-6 w-full max-w-md border border-navy-light shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-2">Rechazar Cierre</h3>
            <p className="text-muted text-sm mb-4">Indique el motivo del rechazo. El operador sera notificado.</p>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="Motivo del rechazo..."
              rows={4}
              className="w-full p-3 text-base rounded-xl bg-navy border border-navy-light resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectComment(''); }}
                className="flex-1 py-3 rounded-xl font-bold text-base bg-navy-light text-muted hover:bg-navy-light/80 transition-colors min-h-[44px]"
              >
                CANCELAR
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectComment.trim() || actionLoading === rejectModal}
                className={cn(
                  'flex-1 py-3 rounded-xl font-bold text-base min-h-[44px] transition-colors',
                  rejectComment.trim() && actionLoading !== rejectModal
                    ? 'bg-danger text-white hover:bg-danger/90'
                    : 'bg-navy-light text-muted cursor-not-allowed'
                )}
              >
                {actionLoading === rejectModal ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="h-4 w-4" />
                    ENVIANDO...
                  </span>
                ) : 'RECHAZAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Expanded Detail Sub-Component
// ===========================================================================

function ExpandedDetail({
  cierre,
  bat,
  pozoByNumero,
  onApprove,
  onRejectOpen,
  actionLoading,
}: {
  cierre: CierreData | undefined;
  bat: Bateria;
  pozoByNumero: Record<string, PozoData>;
  onApprove: (id: string) => void;
  onRejectOpen: (id: string) => void;
  actionLoading: string | null;
}) {
  if (!cierre) {
    return (
      <div className="px-4 pb-4 border-t border-navy-light/50">
        <div className="py-6 text-center">
          <p className="text-muted text-sm">No hay cierre registrado para esta bateria hoy.</p>
          <p className="text-navy-light text-xs mt-1">El operador aun no ha iniciado el cierre.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 border-t border-navy-light/50">
      {/* Summary stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-4 mb-4">
        <div className="bg-navy rounded-xl p-3 text-center">
          <p className="text-muted text-xs">Crudo</p>
          <p className="text-white font-bold text-lg">{fmtNum(cierre.totalCrudo)}</p>
        </div>
        <div className="bg-navy rounded-xl p-3 text-center">
          <p className="text-muted text-xs">Agua</p>
          <p className="text-cyan font-bold text-lg">{fmtNum(cierre.totalAgua)}</p>
        </div>
        <div className="bg-navy rounded-xl p-3 text-center">
          <p className="text-muted text-xs">Diferida</p>
          <p className="text-danger font-bold text-lg">{fmtNum(cierre.totalDiferida)}</p>
        </div>
        <div className="bg-navy rounded-xl p-3 text-center">
          <p className="text-muted text-xs">Potencial</p>
          <p className="text-muted font-bold text-lg">{fmtNum(cierre.potencialTotal)}</p>
        </div>
        <div className={cn('rounded-xl p-3 text-center border', kpiBgColor(cierre.kpiProduccion))}>
          <p className="text-muted text-xs">KPI</p>
          <p className={cn('font-bold text-lg', kpiColor(cierre.kpiProduccion))}>{cierre.kpiProduccion}%</p>
        </div>
        <div className="bg-navy rounded-xl p-3 text-center">
          <p className="text-muted text-xs">Pozos</p>
          <p className="text-white font-bold text-lg">{cierre.pozosBombeando}/{cierre.totalPozos}</p>
        </div>
      </div>

      {/* Operador info */}
      <div className="text-sm text-muted mb-3">
        Operador: <span className="text-text-primary font-medium">{cierre.operadorId?.nombre || '—'}</span>
        <span className="mx-2">|</span>
        Turno: <span className="text-text-primary font-medium">{cierre.turno}</span>
        {cierre.enviadoEn && (
          <>
            <span className="mx-2">|</span>
            Enviado: <span className="text-text-primary font-medium">
              {new Date(cierre.enviadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
      </div>

      {/* Lecturas table */}
      {cierre.lecturas.length > 0 && (
        <div className="mb-4">
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
            Lecturas de Pozos ({cierre.lecturas.length})
          </p>
          <div className="bg-navy rounded-xl overflow-hidden">
            {/* Desktop lecturas table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-light/50">
                    <th className="text-left px-3 py-2 text-muted text-xs font-semibold">Pozo</th>
                    <th className="text-right px-3 py-2 text-muted text-xs font-semibold">Crudo</th>
                    <th className="text-right px-3 py-2 text-muted text-xs font-semibold">Agua</th>
                    <th className="text-right px-3 py-2 text-muted text-xs font-semibold">P.Tubos</th>
                    <th className="text-center px-3 py-2 text-muted text-xs font-semibold">Estado</th>
                    <th className="text-left px-3 py-2 text-muted text-xs font-semibold">Diferida</th>
                  </tr>
                </thead>
                <tbody>
                  {cierre.lecturas.map((l, idx) => {
                    const pozo = pozoByNumero[l.pozoId];
                    return (
                      <tr key={idx} className="border-b border-navy-light/30 last:border-b-0">
                        <td className="px-3 py-2 text-white font-medium">{pozo?.numero || l.pozoId}</td>
                        <td className="px-3 py-2 text-right text-white">{fmtNum(l.crudoBls)}</td>
                        <td className="px-3 py-2 text-right text-cyan">{fmtNum(l.aguaBls)}</td>
                        <td className="px-3 py-2 text-right text-text-primary">{l.presionTubos}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded font-bold',
                            l.estadoPozo === 'BOMBEANDO' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                          )}>
                            {l.estadoPozo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted text-xs">
                          {l.codigoDiferida || '—'}
                          {l.comentarioDiferida && (
                            <span className="ml-1 text-muted/70">({l.comentarioDiferida})</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile lecturas list */}
            <div className="lg:hidden max-h-64 overflow-y-auto divide-y divide-navy-light/30">
              {cierre.lecturas.map((l, idx) => {
                const pozo = pozoByNumero[l.pozoId];
                return (
                  <div key={idx} className={cn(
                    'px-3 py-2 text-sm flex items-center justify-between',
                    l.estadoPozo === 'BOMBEANDO' ? 'bg-success/5' : 'bg-danger/5'
                  )}>
                    <span className="text-white font-medium">{pozo?.numero || l.pozoId}</span>
                    <div className="flex items-center gap-3">
                      {l.estadoPozo === 'BOMBEANDO' ? (
                        <span className="text-success">{fmtNum(l.crudoBls)} BLS</span>
                      ) : (
                        <span className="text-danger text-xs">{l.codigoDiferida || 'PARADO'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Diferidas summary */}
      {cierre.lecturas.some(l => l.estadoPozo === 'PARADO') && (
        <div className="mb-4">
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
            Pozos con Diferida ({cierre.pozosParados})
          </p>
          <div className="flex flex-wrap gap-2">
            {cierre.lecturas.filter(l => l.estadoPozo === 'PARADO').map((l, idx) => {
              const pozo = pozoByNumero[l.pozoId];
              return (
                <div key={idx} className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-white font-medium">{pozo?.numero || l.pozoId}</span>
                  {l.codigoDiferida && (
                    <span className="text-danger ml-1.5 font-bold">{l.codigoDiferida}</span>
                  )}
                  {pozo?.potencialCrudo && (
                    <span className="text-muted ml-1.5">({fmtNum(pozo.potencialCrudo)} BLS)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tanques summary */}
      {cierre.tanques && cierre.tanques.length > 0 && (
        <div className="mb-4">
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">Tanques</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {cierre.tanques.map((t, idx) => (
              <div key={idx} className="bg-navy rounded-xl px-3 py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-white font-medium">{t.nombre}</span>
                  <span className="text-muted ml-2 text-xs">({t.producto})</span>
                </div>
                <div className="text-right">
                  <span className="text-muted text-xs">Ant: {fmtNum(t.medidaAnterior)}</span>
                  <span className="text-muted mx-1">{'\u2192'}</span>
                  <span className="text-text-primary font-medium">{fmtNum(t.medidaActual)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novedades */}
      {cierre.novedades && (
        <div className="mb-4 bg-navy rounded-xl p-3">
          <p className="text-muted text-xs font-semibold uppercase mb-1">Novedades</p>
          <p className="text-text-primary text-sm">{cierre.novedades}</p>
        </div>
      )}

      {/* Approve / Reject buttons */}
      {cierre.estado === 'ENVIADO' && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => onApprove(cierre._id)}
            disabled={actionLoading === cierre._id}
            className="flex-1 py-3 rounded-xl font-bold text-base bg-success text-white hover:bg-success/90 active:scale-98 transition-all min-h-[44px]"
          >
            {actionLoading === cierre._id ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner className="h-4 w-4" />
              </span>
            ) : (
              <>{'\u2705'} APROBAR</>
            )}
          </button>
          <button
            onClick={() => onRejectOpen(cierre._id)}
            disabled={actionLoading === cierre._id}
            className="flex-1 py-3 rounded-xl font-bold text-base bg-danger text-white hover:bg-danger/90 active:scale-98 transition-all min-h-[44px]"
          >
            {'\u274C'} RECHAZAR
          </button>
        </div>
      )}

      {cierre.estado === 'APROBADO' && (
        <div className="mt-4 bg-success/10 border border-success/30 rounded-xl p-3 flex items-center justify-center gap-2">
          <span className="text-success font-bold">{'\u2705'} Cierre Aprobado</span>
          {cierre.aprobadoEn && (
            <span className="text-muted text-xs">
              ({new Date(cierre.aprobadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })})
            </span>
          )}
        </div>
      )}

      {cierre.estado === 'RECHAZADO' && (
        <div className="mt-4 bg-danger/10 border border-danger/30 rounded-xl p-3">
          <p className="text-danger font-bold">{'\uD83D\uDD34'} Cierre Rechazado</p>
          {cierre.comentarioRechazo && (
            <p className="text-muted text-sm mt-1">&quot;{cierre.comentarioRechazo}&quot;</p>
          )}
        </div>
      )}
    </div>
  );
}
