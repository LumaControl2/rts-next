'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

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

interface CodigoDiferida {
  _id: string;
  codigo: string;
  descripcion: string;
  area: string;
  requiereComentario?: boolean;
}

export default function PozoCapturaPage({
  params,
}: {
  params: Promise<{ bateriaId: string; pozoId: string }>;
}) {
  const { bateriaId: rawBateriaId, pozoId: rawPozoId } = use(params);
  const bateriaId = decodeURIComponent(rawBateriaId);
  const pozoId = decodeURIComponent(rawPozoId);
  const router = useRouter();
  const { user, loading: authLoading, authFetch } = useAuth();

  const [pozo, setPozo] = useState<PozoInfo | null>(null);
  const [cierreId, setCierreId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [estadoPozo, setEstadoPozo] = useState<'BOMBEANDO' | 'PARADO'>('BOMBEANDO');
  const [crudoBls, setCrudoBls] = useState(0);
  const [aguaBls, setAguaBls] = useState(0);
  const [presionTubos, setPresionTubos] = useState(0);
  const [presionForros, setPresionForros] = useState(0);
  const [gpm, setGpm] = useState(0);
  const [carrera, setCarrera] = useState(0);
  const [timerOn, setTimerOn] = useState(0);
  const [timerOff, setTimerOff] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const [areaDiferida, setAreaDiferida] = useState('');
  const [codigoDif, setCodigoDif] = useState('');
  const [comentarioDif, setComentarioDif] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [codigosDiferida, setCodigosDiferida] = useState<CodigoDiferida[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice state
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFilledFields, setVoiceFilledFields] = useState<string[]>([]);

  const potencial = pozo?.potencialCrudo || 0;
  const potencialAgua = pozo?.potencialAgua || 0;

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch pozos for this battery
      const pozRes = await authFetch(`/api/pozos?bateria=${encodeURIComponent(bateriaId)}`);
      let pozoData: PozoInfo | null = null;
      if (pozRes.ok) {
        const pozJson = await pozRes.json();
        const allPozos = pozJson.data || pozJson;
        pozoData = (Array.isArray(allPozos) ? allPozos : []).find((p: any) => p._id === pozoId || p.numero === pozoId) ?? null;
        if (pozoData) setPozo(pozoData);
      }

      // Fetch current cierre
      const today = new Date().toISOString().slice(0, 10);
      const cierreRes = await authFetch(`/api/cierres?fecha=${today}&bateria=${encodeURIComponent(bateriaId)}`);
      if (cierreRes.ok) {
        const cierreJson = await cierreRes.json();
        const cierreList = cierreJson.data || cierreJson;
        const cierreData = Array.isArray(cierreList) ? cierreList[0] : cierreList;
        if (cierreData?._id) {
          setCierreId(cierreData._id);

          // Check for existing lectura
          const lecturas = cierreData.lecturas ?? [];
          const existing = lecturas.find((l: any) => l.pozoId === pozoId);
          if (existing) {
            setIsEditing(true);
            setEstadoPozo(existing.estadoPozo ?? 'BOMBEANDO');
            setCrudoBls(existing.crudoBls ?? 0);
            setAguaBls(existing.aguaBls ?? 0);
            setPresionTubos(existing.presionTubos ?? 0);
            setPresionForros(existing.presionForros ?? 0);
            setGpm(existing.gpm ?? 0);
            setCarrera(existing.carrera ?? pozoData?.carrera ?? 0);
            setTimerOn(existing.timerOn ?? 0);
            setTimerOff(existing.timerOff ?? 0);
            if (existing.timerOn || existing.timerOff) setShowTimer(true);
            setCodigoDif(existing.codigoDiferida ?? '');
            setComentarioDif(existing.comentarioDiferida ?? '');
            setComentarios(existing.comentarios ?? '');
            if (existing.areaDiferida) setAreaDiferida(existing.areaDiferida);
          } else {
            // Defaults
            setCrudoBls(pozoData?.potencialCrudo ?? 0);
            setAguaBls(pozoData?.potencialAgua ?? 0);
            setCarrera(pozoData?.carrera ?? 0);
          }
        }
      }

      // Fetch codigos diferida
      const codRes = await authFetch('/api/codigos');
      if (codRes.ok) {
        const codJson = await codRes.json();
        const codData = codJson.data || codJson;
        setCodigosDiferida(Array.isArray(codData) ? codData : []);
      }
    } catch {
      setError('Error cargando datos del pozo.');
    } finally {
      setLoading(false);
    }
  }, [user, bateriaId, pozoId, authFetch]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // When switching to PARADO, set crudo to 0
  useEffect(() => {
    if (estadoPozo === 'PARADO') {
      setCrudoBls(0);
    } else if (!isEditing && crudoBls === 0) {
      setCrudoBls(potencial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoPozo]);

  // Fetch codigos filtered by area
  useEffect(() => {
    if (areaDiferida) {
      authFetch(`/api/codigos?area=${encodeURIComponent(areaDiferida)}`)
        .then(res => res.ok ? res.json() : { data: [] })
        .then(json => { const arr = json.data || json; setCodigosDiferida(Array.isArray(arr) ? arr : []); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaDiferida]);

  const showPUEFields = pozo?.sistema === 'PUE' || pozo?.sistema === 'PUG';

  const filteredCodigos = codigosDiferida.filter(c => {
    if (areaDiferida && c.area !== areaDiferida) return false;
    if (searchCode) {
      const q = searchCode.toLowerCase();
      return c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedCodigo = codigosDiferida.find(c => c.codigo === codigoDif);

  // Voice recognition
  async function handleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Reconocimiento de voz no disponible. Use Chrome en Android.');
      return;
    }

    // Check microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Permita el acceso al micrófono para usar dictado por voz.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-PE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    setVoiceActive(true);
    setVoiceTranscript('');
    setError('');

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceActive(false);
      setVoiceTranscript(transcript);
      setVoiceProcessing(true);

      try {
        const res = await authFetch('/api/voice-parse', {
          method: 'POST',
          body: JSON.stringify({ texto: transcript }),
        });
        if (res.ok) {
          const json = await res.json();
          const parsed = json.data || json;
          const filled: string[] = [];
          if (parsed.crudoBls != null) { setCrudoBls(parsed.crudoBls); filled.push('crudoBls'); }
          if (parsed.aguaBls != null) { setAguaBls(parsed.aguaBls); filled.push('aguaBls'); }
          if (parsed.presionTubos != null) { setPresionTubos(parsed.presionTubos); filled.push('presionTubos'); }
          if (parsed.presionForros != null) { setPresionForros(parsed.presionForros); filled.push('presionForros'); }
          if (parsed.gpm != null) { setGpm(parsed.gpm); filled.push('gpm'); }
          if (parsed.carrera != null) { setCarrera(parsed.carrera); filled.push('carrera'); }
          if (parsed.estado === 'PARADO') { setEstadoPozo('PARADO'); filled.push('estadoPozo'); }
          if (parsed.estado === 'BOMBEANDO') { setEstadoPozo('BOMBEANDO'); filled.push('estadoPozo'); }
          if (parsed.codigoDiferida) { setCodigoDif(parsed.codigoDiferida); filled.push('codigoDiferida'); }
          if (parsed.comentarios) { setComentarios(parsed.comentarios); filled.push('comentarios'); }
          if (parsed.timerOn != null) { setTimerOn(parsed.timerOn); filled.push('timerOn'); }
          if (parsed.timerOff != null) { setTimerOff(parsed.timerOff); filled.push('timerOff'); }
          setVoiceFilledFields(filled);
        } else {
          setError('Error al procesar voz. Intente de nuevo.');
        }
      } catch {
        setError('Error procesando voz. Intente de nuevo.');
      } finally {
        setVoiceProcessing(false);
      }
    };

    recognition.onerror = (event: any) => {
      setVoiceActive(false);
      setVoiceProcessing(false);
      if (event.error === 'not-allowed') {
        setError('Micrófono bloqueado. Permita el acceso en la configuración del navegador.');
      } else if (event.error === 'no-speech') {
        setError('No se detectó voz. Intente de nuevo.');
      } else if (event.error === 'network') {
        setError('Sin conexión. El dictado requiere señal de internet.');
      } else {
        setError(`Error de voz: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setVoiceActive(false);
    };

    recognition.start();
  }

  // Photo capture
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setPhotoBase64(base64);
      setPhotoPreview(base64);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setError('');

    // Validation
    if (estadoPozo === 'PARADO' && !codigoDif) {
      setError('Seleccione un codigo de diferida para pozo parado.');
      return;
    }
    if (estadoPozo === 'PARADO' && selectedCodigo?.requiereComentario && !comentarioDif.trim()) {
      setError('El comentario de diferida es obligatorio para este codigo.');
      return;
    }

    setSaving(true);

    try {
      // Upload photo if any
      let fotoUrl: string | undefined;
      if (photoBase64) {
        try {
          const uploadRes = await authFetch('/api/upload', {
            method: 'POST',
            body: JSON.stringify({ image: photoBase64, type: 'lectura' }),
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            fotoUrl = uploadData.url;
          }
        } catch {
          // Photo upload failed, continue without it
        }
      }

      const lecturaData = {
        pozoId,
        crudoBls,
        aguaBls,
        presionTubos,
        presionForros,
        gpm,
        carrera,
        timerOn,
        timerOff,
        estadoPozo,
        codigoDiferida: codigoDif,
        areaDiferida,
        comentarioDiferida: comentarioDif,
        comentarios,
        horaRegistro: new Date().toTimeString().slice(0, 5),
        ...(fotoUrl ? { fotos: [fotoUrl] } : {}),
      };

      const res = await authFetch(`/api/cierres/${cierreId}/lecturas`, {
        method: 'POST',
        body: JSON.stringify(lecturaData),
      });

      if (res.ok) {
        router.push(`/cierre/${encodeURIComponent(bateriaId)}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Error guardando lectura.');
        setSaving(false);
      }
    } catch {
      setError('Error de conexion al guardar.');
      setSaving(false);
    }
  }

  // Stepper component
  function NumberStepper({
    value, onChange, label, unit, disabled = false, step = 1, min = 0, voiceFilled = false,
  }: {
    value: number; onChange: (v: number) => void; label: string; unit?: string; disabled?: boolean; step?: number; min?: number; voiceFilled?: boolean;
  }) {
    return (
      <div className={cn('mb-4', disabled && 'opacity-50')}>
        <label className="block text-muted text-sm mb-2 font-medium">
          {label}
          {voiceFilled && (
            <span className="ml-2 text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">Llenado por voz</span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
            disabled={disabled}
            className="w-12 h-12 rounded-xl bg-navy-mid border border-navy-light text-xl font-bold text-white flex items-center justify-center active:bg-navy-light disabled:opacity-30"
          >
            -
          </button>
          <div className="flex-1 relative">
            <input
              type="number"
              value={value}
              onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
              disabled={disabled}
              className="w-full p-3 text-xl text-center font-bold rounded-xl bg-navy-mid border border-navy-light disabled:opacity-50"
            />
            {unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">{unit}</span>
            )}
          </div>
          <button
            onClick={() => onChange(+(value + step).toFixed(2))}
            disabled={disabled}
            className="w-12 h-12 rounded-xl bg-navy-mid border border-navy-light text-xl font-bold text-white flex items-center justify-center active:bg-navy-light disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-navy">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-cyan" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-muted text-sm">Cargando pozo...</p>
        </div>
      </div>
    );
  }

  if (!user || !pozo) return null;

  const categoriaColor = pozo.categoria === 'A' ? 'bg-success/20 text-success' :
    pozo.categoria === 'B' ? 'bg-warning/20 text-warning' : 'bg-muted/20 text-muted';

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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Pozo {pozo.numero}</h1>
            <p className="text-muted text-sm">{bateriaId} &middot; {pozo.sistema}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 overflow-y-auto pb-28">
        {/* SECTION 1: Well info bar */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-white font-bold">Pot: {potencial} BLS</span>
              <span className="text-muted">{pozo.sistema}</span>
              {pozo.carrera > 0 && <span className="text-muted">Carrera: {pozo.carrera}&quot;</span>}
            </div>
            {pozo.categoria && (
              <span className={cn('px-3 py-1 rounded-full text-xs font-bold', categoriaColor)}>
                Cat. {pozo.categoria}
              </span>
            )}
          </div>
        </div>

        {/* SECTION 2: Status toggle */}
        <div className="mb-4">
          <label className="block text-muted text-sm mb-2 font-medium">Estado del Pozo</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setEstadoPozo('BOMBEANDO')}
              className={cn(
                'py-4 rounded-xl font-bold text-base transition-all border-2',
                estadoPozo === 'BOMBEANDO'
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-navy-mid border-navy-light text-muted'
              )}
            >
              BOMBEANDO
            </button>
            <button
              onClick={() => setEstadoPozo('PARADO')}
              className={cn(
                'py-4 rounded-xl font-bold text-base transition-all border-2',
                estadoPozo === 'PARADO'
                  ? 'bg-danger/20 border-danger text-danger'
                  : 'bg-navy-mid border-navy-light text-muted'
              )}
            >
              PARADO
            </button>
          </div>
        </div>

        {/* SECTION 3: Production */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-3">Produccion</h3>
          <NumberStepper
            label="Crudo"
            unit="BLS"
            value={crudoBls}
            onChange={setCrudoBls}
            disabled={estadoPozo === 'PARADO'}
            voiceFilled={voiceFilledFields.includes('crudoBls')}
          />
          <NumberStepper
            label="Agua"
            unit="BLS"
            value={aguaBls}
            onChange={setAguaBls}
            voiceFilled={voiceFilledFields.includes('aguaBls')}
          />
        </div>

        {/* SECTION 4: Parameters */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-3">Parametros</h3>
          <NumberStepper
            label="Presion Tubos"
            unit="PSI"
            value={presionTubos}
            onChange={setPresionTubos}
            voiceFilled={voiceFilledFields.includes('presionTubos')}
          />
          <NumberStepper
            label="Presion Forros"
            unit="PSI"
            value={presionForros}
            onChange={setPresionForros}
            voiceFilled={voiceFilledFields.includes('presionForros')}
          />
          {showPUEFields && (
            <>
              <NumberStepper
                label="GPM"
                value={gpm}
                onChange={setGpm}
                step={0.1}
                voiceFilled={voiceFilledFields.includes('gpm')}
              />
              <NumberStepper
                label="Carrera"
                unit="&quot;"
                value={carrera}
                onChange={setCarrera}
                voiceFilled={voiceFilledFields.includes('carrera')}
              />
            </>
          )}
        </div>

        {/* SECTION 5: Timer (collapsible) */}
        <div className="bg-navy-light rounded-2xl mb-4 border border-navy-light/50 overflow-hidden">
          <button
            onClick={() => setShowTimer(!showTimer)}
            className="w-full p-4 flex items-center justify-between"
          >
            <h3 className="text-white font-bold">Timer (opcional)</h3>
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={cn('text-muted transition-transform', showTimer && 'rotate-180')}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showTimer && (
            <div className="px-4 pb-4">
              <NumberStepper label="Timer On" unit="min" value={timerOn} onChange={setTimerOn} />
              <NumberStepper label="Timer Off" unit="min" value={timerOff} onChange={setTimerOff} />
            </div>
          )}
        </div>

        {/* SECTION 6: Diferida (only if PARADO) */}
        {estadoPozo === 'PARADO' && (
          <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{'\u26A0\uFE0F'}</span>
              <h3 className="text-danger font-bold">Produccion diferida: {potencial} BLS</h3>
            </div>

            {/* Area selector */}
            <div className="mb-3">
              <label className="block text-muted text-sm mb-2 font-medium">Area</label>
              <select
                value={areaDiferida}
                onChange={e => { setAreaDiferida(e.target.value); setCodigoDif(''); }}
                className="w-full p-3 text-lg rounded-xl bg-navy-mid border border-navy-light"
              >
                <option value="">Todas las areas</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="INGENIERIA">Ingenieria</option>
                <option value="PRODUCCION">Produccion</option>
                <option value="NO_OPERATIVA">No Operativa</option>
              </select>
            </div>

            {/* Code search */}
            <div className="mb-3">
              <label className="block text-muted text-sm mb-2 font-medium">Codigo Diferida</label>
              <input
                type="text"
                placeholder="Buscar codigo..."
                value={searchCode}
                onChange={e => setSearchCode(e.target.value)}
                className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light mb-2"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredCodigos.map(c => (
                  <button
                    key={c._id || c.codigo}
                    onClick={() => setCodigoDif(c.codigo)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all',
                      codigoDif === c.codigo
                        ? 'bg-danger/20 border border-danger/40 text-white'
                        : 'bg-navy-mid text-muted hover:bg-navy-light'
                    )}
                  >
                    <span className="font-bold text-white">{c.codigo}</span> — {c.descripcion}
                    {c.requiereComentario && <span className="text-warning ml-1">*</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-2">
              <label className="block text-muted text-sm mb-2 font-medium">
                Que paso?
                {selectedCodigo?.requiereComentario && (
                  <span className="text-warning ml-2 text-xs">Comentario obligatorio</span>
                )}
              </label>
              <textarea
                value={comentarioDif}
                onChange={e => setComentarioDif(e.target.value)}
                placeholder="Describa la situacion..."
                rows={3}
                className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light resize-none"
              />
            </div>
          </div>
        )}

        {/* SECTION 7: General comments */}
        <div className="bg-navy-light rounded-2xl p-4 mb-4 border border-navy-light/50">
          <h3 className="text-white font-bold mb-3">Comentarios Generales</h3>
          <textarea
            value={comentarios}
            onChange={e => setComentarios(e.target.value)}
            placeholder="Observaciones generales..."
            rows={3}
            className="w-full p-3 text-base rounded-xl bg-navy-mid border border-navy-light resize-none"
          />
        </div>

        {/* Voice transcript preview */}
        {voiceTranscript && (
          <div className="bg-cyan/10 border border-cyan/30 rounded-xl p-3 mb-4">
            <p className="text-xs text-cyan font-medium mb-1">Transcripción:</p>
            <p className="text-white text-sm italic">&ldquo;{voiceTranscript}&rdquo;</p>
          </div>
        )}

        {/* Voice + Photo buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleVoice}
            disabled={voiceActive || voiceProcessing}
            className={cn(
              'flex-1 py-3 rounded-xl font-bold text-base transition-all border-2 flex items-center justify-center gap-2',
              voiceActive
                ? 'bg-danger/20 border-danger text-danger animate-pulse'
                : voiceProcessing
                ? 'bg-cyan/20 border-cyan text-cyan'
                : 'bg-navy-mid border-navy-light text-muted hover:border-cyan hover:text-cyan'
            )}
          >
            {voiceProcessing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                Procesando con IA...
              </>
            ) : voiceActive ? (
              <>
                <span className="text-xl">{'\uD83D\uDD34'}</span>
                Escuchando... (hable ahora)
              </>
            ) : (
              <>
                <span className="text-xl">{'\uD83C\uDFA4'}</span>
                Dictar lectura
              </>
            )}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-3 rounded-xl font-bold text-base transition-all border-2 bg-navy-mid border-navy-light text-muted hover:border-cyan hover:text-cyan flex items-center justify-center gap-2"
          >
            <span className="text-xl">{'\uD83D\uDCF7'}</span>
            Foto
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            className="hidden"
          />
        </div>

        {/* Photo preview */}
        {photoPreview && (
          <div className="mb-4 relative">
            <img
              src={photoPreview}
              alt="Foto capturada"
              className="w-full h-48 object-cover rounded-xl border border-navy-light"
            />
            <button
              onClick={() => { setPhotoPreview(null); setPhotoBase64(null); }}
              className="absolute top-2 right-2 w-8 h-8 bg-danger rounded-full flex items-center justify-center text-white font-bold text-sm"
            >
              X
            </button>
          </div>
        )}

        {/* Voice filled badge */}
        {voiceFilledFields.length > 0 && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-3 mb-4 text-center">
            <p className="text-success text-sm font-medium">
              Llenado por voz — {voiceFilledFields.length} campo(s) actualizados
            </p>
          </div>
        )}
      </main>

      {/* Error + Save button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-navy-mid border-t border-navy-light z-40">
        {error && (
          <div className="bg-danger/20 border border-danger/40 rounded-xl p-3 text-center mb-3">
            <p className="text-danger text-sm font-medium">{error}</p>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-98',
            saving
              ? 'bg-navy-light text-muted cursor-not-allowed'
              : 'bg-cyan text-navy hover:bg-cyan-dark'
          )}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              GUARDANDO...
            </span>
          ) : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}
