'use client';

import { use, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, calcularKPI, cn } from '@/lib/utils';

interface LecturaInfo {
  pozoId: string;
  estadoPozo: 'BOMBEANDO' | 'PARADO';
  crudoBls: number;
  aguaBls: number;
  presionTubos: number;
  codigoDiferida?: string;
  comentarioDiferida?: string;
  diferidaBls?: number;
}

interface MedidaTanque {
  nombre: string;
  producto: string;
  medidaAnterior: number;
  medidaActual: number;
  aguaLibre: number;
}

interface BombeoInfo {
  id: string;
  volumen: number;
}

interface CierreData {
  _id: string;
  bateriaId: string;
  fecha: string;
  turno: string;
  operadorId: string;
  estado: string;
  lecturas: LecturaInfo[];
  tanques: MedidaTanque[];
  bombeos: BombeoInfo[];
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
}

interface PozoInfo {
  _id: string;
  numero: string;
  potencialCrudo: number;
}

interface BateriaData {
  _id: string;
  codigo: string;
  nombre: string;
  tanques: { nombre: string; producto: string }[];
}

interface CodigoInfo {
  codigo: string;
  descripcion: string;
}

export default function ResumenPage({
  params,
}: {
  params: Promise<{ bateriaId: string }>;
}) {
  const { bateriaId: rawBateriaId } = use(params);
  const bateriaId = decodeURIComponent(rawBateriaId);
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [cierre, setCierre] = useState<CierreData | null>(null);
  const [bateria, setBateria] = useState<BateriaData | null>(null);
  const [pozos, setPozos] = useState<PozoInfo[]>([]);
  const [codigos, setCodigos] = useState<CodigoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviado, setEnviado] = useState(false);
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch battery
      const batRes = await authFetch('/api/baterias');
      if (batRes.ok) {
        const batJson = await batRes.json();
        const allBats = batJson.data || batJson;
        const found = (Array.isArray(allBats) ? allBats : []).find((b: any) => b._id === bateriaId || b.codigo === bateriaId);
        if (found) setBateria(found);
      }

      // Fetch pozos
      const pozRes = await authFetch(`/api/pozos?bateria=${encodeURIComponent(bateriaId)}`);
      if (pozRes.ok) {
        const pozJson = await pozRes.json();
        const pozData = pozJson.data || pozJson;
        setPozos((Array.isArray(pozData) ? pozData : []).filter((p: any) => p.estado === 'ACTIVO'));
      }

      // Fetch codigos
      const codRes = await authFetch('/api/codigos');
      if (codRes.ok) {
        const codJson = await codRes.json();
        const codData = codJson.data || codJson;
        setCodigos(Array.isArray(codData) ? codData : []);
      }

      // Fetch cierre
      const today = new Date().toISOString().slice(0, 10);
      const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bateriaId)}`);
      if (cierreRes.ok) {
        const cierreJson = await cierreRes.json();
        const cierreList = cierreJson.data || cierreJson;
        const cierreData = Array.isArray(cierreList) ? cierreList[0] : cierreList;
        if (cierreData?._id) setCierre(cierreData);
      }
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [user, bateriaId, authFetch]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // Calculations
  const summary = useMemo(() => {
    if (!cierre) return null;

    const lecturas = cierre.lecturas ?? [];
    const totalCrudo = cierre.totalCrudo ?? lecturas.reduce((s, l) => s + (l.crudoBls || 0), 0);
    const totalAgua = cierre.totalAgua ?? lecturas.reduce((s, l) => s + (l.aguaBls || 0), 0);

    const potencialTotal = cierre.potencialTotal ?? pozos.reduce((s, p) => s + (p.potencialCrudo || 0), 0);
    const kpi = cierre.kpiProduccion ?? calcularKPI(totalCrudo, potencialTotal);

    const corteAgua = totalCrudo + totalAgua > 0
      ? Math.round((totalAgua / (totalCrudo + totalAgua)) * 100 * 10) / 10
      : 0;

    // Pozos parados
    const totalDiferida = cierre.totalDiferida ?? 0;
    const pozosParados = lecturas
      .filter(l => l.estadoPozo === 'PARADO')
      .map(l => {
        const p = pozos.find(px => px.numero === l.pozoId || px._id === l.pozoId);
        const cod = codigos.find(c => c.codigo === l.codigoDiferida);
        return {
          nombre: p?.numero || l.pozoId,
          potencial: p?.potencialCrudo || 0,
          codigo: l.codigoDiferida || '',
          descripcion: cod?.descripcion || '',
          comentario: l.comentarioDiferida || '',
        };
      });

    // Cuadre
    let produccionTanque = 0;
    if (bateria?.tanques && cierre.tanques?.length) {
      const petrolTanks = bateria.tanques.filter(t => t.producto === 'PETROLEO');
      petrolTanks.forEach(t => {
        const m = cierre.tanques.find(md => md.nombre === t.nombre);
        if (m) {
          produccionTanque += (m.medidaActual - m.medidaAnterior) - m.aguaLibre;
        }
      });
    }
    const totalBombeado = (cierre.bombeos ?? []).reduce((s, b) => s + (b.volumen || 0), 0);
    produccionTanque += totalBombeado;

    const difTanque = Math.abs(totalCrudo - produccionTanque);
    const porcTanque = totalCrudo > 0 ? (difTanque / totalCrudo) * 100 : 0;
    let estadoTanque: 'OK' | 'ALERTA' | 'CRITICO' = 'OK';
    if (porcTanque > 15) estadoTanque = 'CRITICO';
    else if (porcTanque > 5) estadoTanque = 'ALERTA';

    // Produccion no justificada
    const produccionTotal = totalCrudo + totalDiferida;
    const noJustificada = Math.max(0, potencialTotal - produccionTotal);

    const pozosBombeando = cierre.pozosBombeando ?? lecturas.filter(l => l.estadoPozo === 'BOMBEANDO').length;
    const pozosParadosCount = cierre.pozosParados ?? lecturas.filter(l => l.estadoPozo === 'PARADO').length;
    const totalPozos = cierre.totalPozos ?? pozos.length;

    return {
      totalCrudo,
      totalAgua,
      totalDiferida,
      potencialTotal,
      kpi,
      corteAgua,
      pozosParados,
      pozosParadosCount,
      pozosBombeando,
      totalPozos,
      produccionTanque,
      difTanque,
      porcTanque: Math.round(porcTanque * 10) / 10,
      estadoTanque,
      noJustificada,
    };
  }, [cierre, pozos, codigos, bateria]);

  async function handleEnviar() {
    if (!cierre) return;
    setSending(true);

    try {
      const res = await authFetch(`/api/cierres/${cierre._id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'ENVIADO' }),
      });

      if (res.ok) {
        setEnviado(true);
        setTimeout(() => {
          router.push('/home');
        }, 2000);
      } else {
        setSending(false);
      }
    } catch {
      setSending(false);
    }
  }

  function kpiColor(kpi: number) {
    if (kpi >= 85) return 'text-success';
    if (kpi >= 60) return 'text-warning';
    return 'text-danger';
  }

  function kpiBarColor(kpi: number) {
    if (kpi >= 85) return 'bg-success';
    if (kpi >= 60) return 'bg-warning';
    return 'bg-danger';
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-cyan" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-muted text-sm">Cargando resumen...</p>
        </div>
      </div>
    );
  }

  if (!user || !cierre || !summary) return null;

  if (enviado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-navy px-6">
        <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Cierre Enviado</h1>
        <p className="text-muted text-center">
          El cierre de {bateria?.codigo || bateriaId} ha sido enviado al supervisor para su aprobacion.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* Header */}
      <header className="bg-navy-mid border-b border-navy-light px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/cierre/${encodeURIComponent(bateriaId)}/novedades`)}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-navy-light"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">
            CIERRE {bateria?.codigo || bateriaId} — {formatDate(cierre.fecha)}
          </h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 overflow-y-auto pb-28">
        {/* Info header */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs">Bateria</p>
              <p className="text-white font-bold">{bateria?.codigo || bateriaId} — {bateria?.nombre || ''}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Fecha</p>
              <p className="text-white font-bold">{formatDate(cierre.fecha)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Turno</p>
              <p className="text-white font-bold">{cierre.turno === 'DIA' ? 'Dia' : 'Noche'}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Operador</p>
              <p className="text-white font-bold">{user.nombre}</p>
            </div>
          </div>
        </div>

        {/* PRODUCCION */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-3">Produccion</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-navy rounded-xl p-3 text-center">
              <p className="text-muted text-xs">Crudo Real</p>
              <p className="text-2xl font-bold text-white">{summary.totalCrudo}</p>
              <p className="text-muted text-xs">BLS</p>
            </div>
            <div className="bg-navy rounded-xl p-3 text-center">
              <p className="text-muted text-xs">Potencial</p>
              <p className="text-2xl font-bold text-muted">{summary.potencialTotal}</p>
              <p className="text-muted text-xs">BLS</p>
            </div>
            <div className="bg-navy rounded-xl p-3 text-center col-span-2">
              <p className="text-muted text-xs mb-1">KPI Produccion</p>
              <p className={cn('text-3xl font-bold', kpiColor(summary.kpi))}>{summary.kpi}%</p>
              <div className="w-full h-2 bg-navy-light rounded-full mt-2 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', kpiBarColor(summary.kpi))}
                  style={{ width: `${Math.min(100, summary.kpi)}%` }}
                />
              </div>
            </div>
            <div className="bg-navy rounded-xl p-3 text-center">
              <p className="text-muted text-xs">Agua</p>
              <p className="text-2xl font-bold text-cyan">{summary.totalAgua}</p>
              <p className="text-muted text-xs">BLS</p>
            </div>
            <div className="bg-navy rounded-xl p-3 text-center">
              <p className="text-muted text-xs">Corte de Agua</p>
              <p className="text-2xl font-bold text-white">{summary.corteAgua}%</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-navy/50 flex justify-between text-sm">
            <span className="text-muted">Pozos:</span>
            <span className="text-white">
              {summary.pozosBombeando} bombeando &middot; {summary.pozosParadosCount} parados &middot; {summary.totalPozos} total
            </span>
          </div>
        </div>

        {/* DIFERIDA */}
        {summary.pozosParados.length > 0 && (
          <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 mb-4">
            <h3 className="text-danger font-bold mb-3">
              Diferida — {summary.totalDiferida} BLS
            </h3>
            <p className="text-muted text-sm mb-3">
              Pozos parados: {summary.pozosParadosCount} de {summary.totalPozos}
            </p>
            <div className="space-y-2">
              {summary.pozosParados.map((pp, i) => (
                <div key={i} className="bg-navy/40 rounded-xl p-3">
                  <div className="flex justify-between">
                    <span className="text-white font-medium">Pozo {pp.nombre}</span>
                    <span className="text-danger font-bold">{pp.potencial} BLS</span>
                  </div>
                  <p className="text-muted text-sm">{pp.codigo} — {pp.descripcion}</p>
                  {pp.comentario && (
                    <p className="text-muted text-xs mt-1 italic">&quot;{pp.comentario}&quot;</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TANQUES */}
        {cierre.tanques?.length > 0 && (
          <div className={cn(
            'rounded-2xl p-4 mb-4 border',
            summary.estadoTanque === 'OK' && 'bg-success/10 border-success/30',
            summary.estadoTanque === 'ALERTA' && 'bg-warning/10 border-warning/30',
            summary.estadoTanque === 'CRITICO' && 'bg-danger/10 border-danger/30',
          )}>
            <h3 className="text-white font-bold mb-3">Cuadre de Tanques</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Produccion pozos:</span>
                <span className="text-white font-bold">{summary.totalCrudo} BLS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Produccion tanque:</span>
                <span className="text-white font-bold">{summary.produccionTanque} plg</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/10">
                <span className="text-muted">Diferencia:</span>
                <span className={cn(
                  'font-bold',
                  summary.estadoTanque === 'OK' && 'text-success',
                  summary.estadoTanque === 'ALERTA' && 'text-warning',
                  summary.estadoTanque === 'CRITICO' && 'text-danger',
                )}>
                  {summary.difTanque} ({summary.porcTanque}%)
                  {summary.estadoTanque === 'OK' && ' \u2705'}
                  {summary.estadoTanque === 'ALERTA' && ' \u26A0\uFE0F'}
                  {summary.estadoTanque === 'CRITICO' && ' \uD83D\uDD34'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* NOVEDADES */}
        {cierre.novedades && (
          <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
            <h3 className="text-white font-bold mb-2">Novedades</h3>
            <p className="text-muted text-sm whitespace-pre-wrap">{cierre.novedades}</p>
          </div>
        )}

        {/* NO JUSTIFICADA warning */}
        {summary.noJustificada > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{'\u26A0\uFE0F'}</span>
              <h3 className="text-warning font-bold">PRODUCCION NO JUSTIFICADA</h3>
            </div>
            <p className="text-muted text-sm">
              Real ({summary.totalCrudo} BLS) + Diferida ({summary.totalDiferida} BLS) = {summary.totalCrudo + summary.totalDiferida} BLS
            </p>
            <p className="text-muted text-sm">
              Potencial: {summary.potencialTotal} BLS
            </p>
            <p className="text-warning font-bold mt-2">
              Faltan: {summary.noJustificada} BLS sin explicar
            </p>
          </div>
        )}
      </main>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-navy-mid border-t border-navy-light z-40">
        <button
          onClick={handleEnviar}
          disabled={sending}
          className={cn(
            'w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-98',
            sending
              ? 'bg-navy-light text-muted cursor-not-allowed'
              : 'bg-cyan text-navy hover:bg-cyan-dark'
          )}
        >
          {sending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              ENVIANDO...
            </span>
          ) : 'ENVIAR AL SUPERVISOR'}
        </button>
      </div>
    </div>
  );
}
