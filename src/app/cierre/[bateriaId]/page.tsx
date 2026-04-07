'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, getTodayStr, cn } from '@/lib/utils';

interface PozoInfo {
  _id: string;
  numero: string;
  sistema: string;
  potencialCrudo: number;
  potencialAgua?: number;
  carrera: number;
  estado: string;
  categoria?: string;
}

interface LecturaInfo {
  pozoId: string;
  estadoPozo: 'BOMBEANDO' | 'PARADO';
  crudoBls: number;
  aguaBls: number;
  presionTubos: number;
  codigoDiferida?: string;
  diferidaBls?: number;
}

interface CierreInfo {
  _id: string;
  bateriaId: string;
  fecha: string;
  turno: string;
  estado: string;
  lecturas: LecturaInfo[];
  totalCrudo: number;
  totalAgua: number;
  totalDiferida: number;
  pozosRegistrados: number;
  totalPozos: number;
}

interface BateriaInfo {
  _id: string;
  codigo: string;
  nombre: string;
}

export default function CierrePozosPage({
  params,
}: {
  params: Promise<{ bateriaId: string }>;
}) {
  const { bateriaId: rawBateriaId } = use(params);
  const bateriaId = decodeURIComponent(rawBateriaId);
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [bateria, setBateria] = useState<BateriaInfo | null>(null);
  const [pozos, setPozos] = useState<PozoInfo[]>([]);
  const [cierre, setCierre] = useState<CierreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      // Fetch battery info
      const batRes = await authFetch('/api/baterias');
      if (batRes.ok) {
        const batJson = await batRes.json();
        const allBats = batJson.data || batJson;
        const found = (Array.isArray(allBats) ? allBats : []).find((b: any) => b._id === bateriaId || b.codigo === bateriaId);
        if (found) setBateria(found);
      }

      // Fetch pozos for this battery
      const pozRes = await authFetch(`/api/pozos?bateria=${encodeURIComponent(bateriaId)}`);
      if (pozRes.ok) {
        const pozJson = await pozRes.json();
        const pozData = pozJson.data || pozJson;
        setPozos(Array.isArray(pozData) ? pozData : []);
      }

      // Check for existing cierre today
      const today = getTodayStr();
      const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bateriaId)}`);
      let cierreData: CierreInfo | null = null;

      if (cierreRes.ok) {
        const cierreJson = await cierreRes.json();
        const cierreList = cierreJson.data || cierreJson;
        if (Array.isArray(cierreList) && cierreList.length > 0) {
          cierreData = cierreList[0];
        } else if (!Array.isArray(cierreList) && cierreList._id) {
          cierreData = cierreList;
        }
      }

      // If no cierre exists, create one
      if (!cierreData) {
        const hour = new Date().getHours();
        const turno = hour >= 6 && hour < 18 ? 'DIA' : 'NOCHE';
        const createRes = await authFetch('/api/cierres', {
          method: 'POST',
          body: JSON.stringify({ bateriaId, turno }),
        });
        if (createRes.ok) {
          const createJson = await createRes.json();
          cierreData = createJson.data || createJson;
        }
      }

      if (cierreData) setCierre(cierreData);
    } catch {
      setError('Error cargando datos. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [user, bateriaId, authFetch]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-cyan" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-muted text-sm">Cargando cierre...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-navy px-6">
        <div className="bg-danger/20 border border-danger/40 rounded-xl p-4 text-center max-w-sm">
          <p className="text-danger font-medium mb-3">{error}</p>
          <button
            onClick={loadData}
            className="px-6 py-2 rounded-xl bg-cyan text-navy font-bold"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const bateriaLabel = bateria?.codigo || bateriaId;
  const lecturas = cierre?.lecturas ?? [];
  const pozosRegistrados = lecturas.length;
  const totalPozos = pozos.length;
  const allRegistered = pozosRegistrados >= totalPozos && totalPozos > 0;
  const faltantes = totalPozos - pozosRegistrados;

  const totalCrudo = cierre?.totalCrudo ?? lecturas.reduce((s, l) => s + (l.crudoBls || 0), 0);
  const totalAgua = cierre?.totalAgua ?? lecturas.reduce((s, l) => s + (l.aguaBls || 0), 0);
  const totalDiferida = cierre?.totalDiferida ?? 0;

  function getLectura(pozoId: string): LecturaInfo | undefined {
    return lecturas.find(l => l.pozoId === pozoId);
  }

  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* Header */}
      <header className="bg-navy-mid border-b border-navy-light px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/home')}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-navy-light"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">
              {bateriaLabel} — Cierre
            </h1>
            <p className="text-muted text-sm">{formatDate(new Date())} &middot; Turno {cierre?.turno === 'DIA' ? 'Dia' : 'Noche'}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted">Pozos registrados</span>
            <span className={cn('font-bold', allRegistered ? 'text-success' : 'text-cyan')}>
              {pozosRegistrados}/{totalPozos}
            </span>
          </div>
          <div className="w-full h-2.5 bg-navy rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                allRegistered ? 'bg-success' : 'bg-cyan'
              )}
              style={{ width: `${totalPozos > 0 ? (pozosRegistrados / totalPozos) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Running totals */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-navy rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-muted">Crudo</p>
            <p className="text-lg font-bold text-white">{totalCrudo}</p>
            <p className="text-xs text-muted">BLS</p>
          </div>
          <div className="bg-navy rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-muted">Agua</p>
            <p className="text-lg font-bold text-cyan">{totalAgua}</p>
            <p className="text-xs text-muted">BLS</p>
          </div>
          <div className="bg-navy rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-muted">Diferida</p>
            <p className="text-lg font-bold text-danger">{totalDiferida}</p>
            <p className="text-xs text-muted">BLS</p>
          </div>
        </div>
      </header>

      {/* Well list */}
      <main className="flex-1 px-4 py-4 overflow-y-auto pb-32">
        <div className="space-y-3">
          {pozos.map(pozo => {
            const lectura = getLectura(pozo.numero);
            const isRegistered = !!lectura;
            const isBombeando = lectura?.estadoPozo === 'BOMBEANDO';
            const isParado = lectura?.estadoPozo === 'PARADO';

            return (
              <button
                key={pozo._id}
                onClick={() => router.push(`/cierre/${encodeURIComponent(bateriaId)}/pozo/${encodeURIComponent(pozo.numero)}`)}
                className={cn(
                  'w-full text-left rounded-2xl p-4 border transition-all active:scale-98',
                  isRegistered && isBombeando && 'bg-success/10 border-success/30',
                  isRegistered && isParado && 'bg-danger/10 border-danger/30',
                  !isRegistered && 'bg-navy-light border-navy-light/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-lg',
                      isRegistered && isBombeando && 'bg-success/20',
                      isRegistered && isParado && 'bg-danger/20',
                      !isRegistered && 'bg-navy-mid'
                    )}>
                      {isRegistered && isBombeando && '\u2705'}
                      {isRegistered && isParado && '\uD83D\uDED1'}
                      {!isRegistered && '\u26AA'}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">Pozo {pozo.numero}</p>
                      <p className="text-muted text-sm">{pozo.sistema} &middot; Pot: {pozo.potencialCrudo || 0} BLS</p>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

                {/* Detail row */}
                {isRegistered && isBombeando && lectura && (
                  <div className="mt-2 ml-13 flex gap-4 text-sm">
                    <span className="text-success">Crudo: {lectura.crudoBls} BLS</span>
                    <span className="text-cyan">Agua: {lectura.aguaBls} BLS</span>
                    <span className="text-muted">P: {lectura.presionTubos} PSI</span>
                  </div>
                )}
                {isRegistered && isParado && lectura && (
                  <div className="mt-2 ml-13">
                    <span className="text-danger text-sm">
                      PARADO | {lectura.codigoDiferida || 'Sin codigo'} | Diferida: {lectura.diferidaBls ?? (pozo.potencialCrudo || 0)} BLS
                    </span>
                  </div>
                )}
                {!isRegistered && (
                  <div className="mt-2 ml-13">
                    <span className="text-muted text-sm">Sin registrar | Pot: {pozo.potencialCrudo || 0} BLS</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </main>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-navy-mid border-t border-navy-light z-40">
        {allRegistered && (
          <div className="flex items-center gap-2 justify-center mb-3 text-success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span className="text-sm font-medium">Todos los pozos registrados</span>
          </div>
        )}
        <button
          onClick={() => {
            if (allRegistered) router.push(`/cierre/${encodeURIComponent(bateriaId)}/tanques`);
          }}
          disabled={!allRegistered}
          className={cn(
            'w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-98',
            allRegistered
              ? 'bg-cyan text-navy'
              : 'bg-navy-light text-muted cursor-not-allowed'
          )}
        >
          {allRegistered ? 'TANQUES Y BOMBEOS' : `TANQUES Y BOMBEOS — Faltan ${faltantes} pozos`}
        </button>
        {!allRegistered && (
          <button
            onClick={() => router.push(`/cierre/${encodeURIComponent(bateriaId)}/tanques`)}
            className="w-full mt-2 text-center text-cyan text-sm underline py-2"
          >
            Continuar sin completar todos
          </button>
        )}
      </div>
    </div>
  );
}
