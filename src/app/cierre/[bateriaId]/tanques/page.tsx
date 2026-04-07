'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface TanqueInfo {
  id: string;
  nombre: string;
  producto: string;
  capacidadBls: number;
}

interface MedidaTanque {
  tanqueId: string;
  medidaAnterior: number;
  medidaActual: number;
  aguaLibre: number;
}

interface BombeoData {
  id: string;
  producto: string;
  volumen: number;
  horaInicio: string;
  horaFin: string;
  destino: string;
}

interface CierreData {
  _id: string;
  totalCrudo: number;
  tanques: MedidaTanque[];
  bombeos: BombeoData[];
  presionCierre: number;
}

interface BateriaData {
  _id: string;
  codigo: string;
  nombre: string;
  tanques: TanqueInfo[];
}

export default function TanquesPage({
  params,
}: {
  params: Promise<{ bateriaId: string }>;
}) {
  const { bateriaId: rawBateriaId } = use(params);
  const bateriaId = decodeURIComponent(rawBateriaId);
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [bateria, setBateria] = useState<BateriaData | null>(null);
  const [cierre, setCierre] = useState<CierreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tank measurements
  const [medidas, setMedidas] = useState<MedidaTanque[]>([]);

  // Bombeos
  const [showBombeos, setShowBombeos] = useState(false);
  const [bombeos, setBombeos] = useState<BombeoData[]>([]);

  const [presionCierre, setPresionCierre] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch battery info
      const batRes = await authFetch('/api/baterias');
      let bateriaData: BateriaData | null = null;
      if (batRes.ok) {
        const allBats = await batRes.json();
        bateriaData = allBats.find((b: any) => b._id === bateriaId || b.codigo === bateriaId) ?? null;
        if (bateriaData) setBateria(bateriaData);
      }

      // Fetch cierre
      const today = new Date().toISOString().slice(0, 10);
      const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bateriaId)}`);
      if (cierreRes.ok) {
        const cierreList = await cierreRes.json();
        const cierreData = Array.isArray(cierreList) ? cierreList[0] : cierreList;
        if (cierreData?._id) {
          setCierre(cierreData);

          // Pre-fill from existing data
          if (cierreData.tanques?.length) {
            setMedidas(cierreData.tanques);
          } else if (bateriaData?.tanques) {
            setMedidas(bateriaData.tanques.map((t: TanqueInfo) => ({
              tanqueId: t.id,
              medidaAnterior: 0,
              medidaActual: 0,
              aguaLibre: 0,
            })));
          }

          if (cierreData.bombeos?.length) {
            setBombeos(cierreData.bombeos);
            setShowBombeos(true);
          }

          if (cierreData.presionCierre) {
            setPresionCierre(cierreData.presionCierre);
          }
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

  // Initialize medidas if bateria loads after cierre
  useEffect(() => {
    if (bateria?.tanques && medidas.length === 0) {
      setMedidas(bateria.tanques.map(t => ({
        tanqueId: t.id,
        medidaAnterior: 0,
        medidaActual: 0,
        aguaLibre: 0,
      })));
    }
  }, [bateria, medidas.length]);

  function updateMedida(tanqueId: string, field: keyof MedidaTanque, value: number) {
    setMedidas(prev =>
      prev.map(m => m.tanqueId === tanqueId ? { ...m, [field]: value } : m)
    );
  }

  function addBombeo() {
    setBombeos(prev => [...prev, {
      id: `bom-${Date.now()}`,
      producto: 'PETROLEO',
      volumen: 0,
      horaInicio: '',
      horaFin: '',
      destino: 'Sub Estacion',
    }]);
  }

  function updateBombeo(id: string, field: keyof BombeoData, value: string | number) {
    setBombeos(prev =>
      prev.map(b => b.id === id ? { ...b, [field]: value } : b)
    );
  }

  function removeBombeo(id: string) {
    setBombeos(prev => prev.filter(b => b.id !== id));
  }

  // Cuadre calculation
  const cuadre = useMemo(() => {
    if (!bateria || !cierre) return { produccionTanque: 0, produccionPozos: 0, diferencia: 0, porcentaje: 0, estado: 'OK' as const };

    const petrolTanks = bateria.tanques.filter(t => t.producto === 'PETROLEO');
    let produccionTanque = 0;
    petrolTanks.forEach(t => {
      const m = medidas.find(md => md.tanqueId === t.id);
      if (m) {
        produccionTanque += (m.medidaActual - m.medidaAnterior) - m.aguaLibre;
      }
    });

    const totalBombeado = bombeos.reduce((s, b) => s + b.volumen, 0);
    produccionTanque += totalBombeado;

    const produccionPozos = cierre.totalCrudo ?? 0;
    const diferencia = Math.abs(produccionPozos - produccionTanque);
    const porcentaje = produccionPozos > 0 ? (diferencia / produccionPozos) * 100 : 0;

    let estado: 'OK' | 'ALERTA' | 'CRITICO' = 'OK';
    if (porcentaje > 15) estado = 'CRITICO';
    else if (porcentaje > 5) estado = 'ALERTA';

    return { produccionTanque, produccionPozos, diferencia, porcentaje: Math.round(porcentaje * 10) / 10, estado };
  }, [medidas, bombeos, cierre, bateria]);

  async function handleSave() {
    if (!cierre) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/cierres/${cierre._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          tanques: medidas,
          bombeos: showBombeos ? bombeos : [],
          presionCierre,
        }),
      });

      if (res.ok) {
        router.push(`/cierre/${encodeURIComponent(bateriaId)}/novedades`);
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
          <p className="text-muted text-sm">Cargando tanques...</p>
        </div>
      </div>
    );
  }

  if (!user || !bateria || !cierre) return null;

  return (
    <div className="flex flex-col min-h-screen bg-navy">
      {/* Header */}
      <header className="bg-navy-mid border-b border-navy-light px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/cierre/${encodeURIComponent(bateriaId)}`)}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-navy-light"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">{bateria.codigo} — Tanques</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 overflow-y-auto pb-28">
        {/* Tank measurements */}
        {bateria.tanques.map(tanque => {
          const m = medidas.find(md => md.tanqueId === tanque.id);
          if (!m) return null;
          const isPetrol = tanque.producto === 'PETROLEO';
          const produccion = (m.medidaActual - m.medidaAnterior) - (isPetrol ? m.aguaLibre : 0);

          return (
            <div key={tanque.id} className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold">{tanque.nombre}</h3>
                  <p className="text-muted text-sm">{tanque.producto} &middot; Cap: {tanque.capacidadBls} BLS</p>
                </div>
                <div className={cn(
                  'px-3 py-1 rounded-full text-xs font-bold',
                  isPetrol ? 'bg-warning/20 text-warning' : 'bg-cyan/20 text-cyan'
                )}>
                  {tanque.producto}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-muted text-xs mb-1">Medida Anterior (plg)</label>
                  <input
                    type="number"
                    value={m.medidaAnterior || ''}
                    onChange={e => updateMedida(tanque.id, 'medidaAnterior', Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
                  />
                </div>
                <div>
                  <label className="block text-muted text-xs mb-1">Medida Actual (plg)</label>
                  <input
                    type="number"
                    value={m.medidaActual || ''}
                    onChange={e => updateMedida(tanque.id, 'medidaActual', Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
                  />
                </div>
                {isPetrol && (
                  <div>
                    <label className="block text-muted text-xs mb-1">Agua Libre (plg)</label>
                    <input
                      type="number"
                      value={m.aguaLibre || ''}
                      onChange={e => updateMedida(tanque.id, 'aguaLibre', Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
                    />
                  </div>
                )}
              </div>

              {/* Calculated */}
              <div className="mt-3 pt-3 border-t border-navy/50 flex justify-between">
                <span className="text-muted text-sm">Produccion: {m.medidaActual - m.medidaAnterior} plg</span>
                <span className={cn('font-bold', produccion >= 0 ? 'text-success' : 'text-danger')}>
                  {produccion} plg neto
                </span>
              </div>
            </div>
          );
        })}

        {/* Bombeos section */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold">Se realizo bombeo?</h3>
            <button
              onClick={() => {
                setShowBombeos(!showBombeos);
                if (!showBombeos && bombeos.length === 0) addBombeo();
              }}
              className={cn(
                'w-16 h-9 rounded-full transition-all relative',
                showBombeos ? 'bg-cyan' : 'bg-navy-mid border border-navy-light'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full bg-white absolute top-1 transition-all',
                showBombeos ? 'right-1' : 'left-1'
              )} />
            </button>
          </div>

          {showBombeos && (
            <div className="space-y-4">
              {bombeos.map((bom, idx) => (
                <div key={bom.id} className="bg-navy rounded-xl p-3 border border-navy-light/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-medium text-sm">Bombeo #{idx + 1}</p>
                    {bombeos.length > 1 && (
                      <button
                        onClick={() => removeBombeo(bom.id)}
                        className="text-danger text-sm"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-muted text-xs mb-1">Producto</label>
                      <select
                        value={bom.producto}
                        onChange={e => updateBombeo(bom.id, 'producto', e.target.value)}
                        className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light"
                      >
                        <option value="PETROLEO">Petroleo</option>
                        <option value="AGUA">Agua</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-muted text-xs mb-1">Volumen (BLS)</label>
                      <input
                        type="number"
                        value={bom.volumen || ''}
                        onChange={e => updateBombeo(bom.id, 'volumen', Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-muted text-xs mb-1">Hora Inicio</label>
                        <input
                          type="time"
                          value={bom.horaInicio}
                          onChange={e => updateBombeo(bom.id, 'horaInicio', e.target.value)}
                          className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light"
                        />
                      </div>
                      <div>
                        <label className="block text-muted text-xs mb-1">Hora Fin</label>
                        <input
                          type="time"
                          value={bom.horaFin}
                          onChange={e => updateBombeo(bom.id, 'horaFin', e.target.value)}
                          className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-muted text-xs mb-1">Destino</label>
                      <select
                        value={bom.destino}
                        onChange={e => updateBombeo(bom.id, 'destino', e.target.value)}
                        className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light"
                      >
                        <option value="Sub Estacion">Sub Estacion</option>
                        <option value="E-14">E-14</option>
                        <option value="Cisterna">Cisterna</option>
                        <option value="Poza">Poza</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addBombeo}
                className="w-full py-3 rounded-xl border-2 border-dashed border-navy-light text-cyan font-medium text-sm hover:border-cyan transition-all"
              >
                + Agregar otro bombeo
              </button>
            </div>
          )}
        </div>

        {/* Presion de cierre */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-3">Presion de Cierre</h3>
          <div>
            <label className="block text-muted text-xs mb-1">PSI</label>
            <input
              type="number"
              value={presionCierre || ''}
              onChange={e => setPresionCierre(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
            />
          </div>
        </div>

        {/* Cuadre automatico */}
        <div className={cn(
          'rounded-2xl p-4 mb-4 border',
          cuadre.estado === 'OK' && 'bg-success/10 border-success/30',
          cuadre.estado === 'ALERTA' && 'bg-warning/10 border-warning/30',
          cuadre.estado === 'CRITICO' && 'bg-danger/10 border-danger/30',
        )}>
          <h3 className="text-white font-bold mb-3">Cuadre Automatico</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted">Produccion pozos:</span>
              <span className="text-white font-bold">{cuadre.produccionPozos} BLS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Produccion tanque:</span>
              <span className="text-white font-bold">{cuadre.produccionTanque} plg</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/10">
              <span className="text-muted">Diferencia:</span>
              <span className={cn(
                'font-bold flex items-center gap-2',
                cuadre.estado === 'OK' && 'text-success',
                cuadre.estado === 'ALERTA' && 'text-warning',
                cuadre.estado === 'CRITICO' && 'text-danger',
              )}>
                {cuadre.diferencia} ({cuadre.porcentaje}%)
                {cuadre.estado === 'OK' && ' \u2705'}
                {cuadre.estado === 'ALERTA' && ' \u26A0\uFE0F'}
                {cuadre.estado === 'CRITICO' && ' \uD83D\uDD34'}
              </span>
            </div>
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
