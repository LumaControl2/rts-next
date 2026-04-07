// ============================================================
// RT NEXT — Zustand Store
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usuarios } from '@/data/lote-i';
import { getTodayStr, calcularKPI } from '@/lib/utils';
import { pozos as masterPozos } from '@/data/lote-i';

// --- Types ---

export interface LecturaPozo {
  id: string;
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
  codigoDiferida: string;
  comentarioDiferida: string;
  comentarios: string;
  horaRegistro: string;
}

export interface MedidaTanque {
  tanqueId: string;
  medidaAnterior: number;
  medidaActual: number;
  aguaLibre: number;
}

export interface Bombeo {
  id: string;
  volumen: number;
  horaInicio: string;
  horaFin: string;
  destino: string;
  producto: string;
}

export interface CierreBateria {
  id: string;
  bateriaId: string;
  fecha: string;
  turno: 'DIA' | 'NOCHE';
  operadorId: string;
  estado: 'EN_PROGRESO' | 'ENVIADO' | 'APROBADO' | 'RECHAZADO';
  lecturas: LecturaPozo[];
  tanques: MedidaTanque[];
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
  comentarioRechazo?: string;
}

interface AppState {
  // Auth
  currentUser: typeof usuarios[0] | null;
  login: (userId: string, pin: string) => boolean;
  logout: () => void;

  // Cierres
  cierres: CierreBateria[];
  iniciarCierre: (bateriaId: string) => string;
  guardarLectura: (cierreId: string, lectura: LecturaPozo) => void;
  eliminarLectura: (cierreId: string, pozoId: string) => void;
  guardarTanques: (cierreId: string, tanques: MedidaTanque[], bombeos: Bombeo[], presionCierre: number) => void;
  guardarNovedades: (cierreId: string, novedades: string) => void;
  enviarCierre: (cierreId: string) => void;
  aprobarCierre: (cierreId: string) => void;
  rechazarCierre: (cierreId: string, comentario: string) => void;

  // Helpers
  getCierreActivo: (bateriaId: string) => CierreBateria | undefined;
  getCierresDelDia: () => CierreBateria[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function recalcTotals(cierre: CierreBateria): CierreBateria {
  const bateriaPozo = masterPozos.filter(p => p.bateriaId === cierre.bateriaId && p.estado === 'ACTIVO');
  const totalCrudo = cierre.lecturas.reduce((s, l) => s + l.crudoBls, 0);
  const totalAgua = cierre.lecturas.reduce((s, l) => s + l.aguaBls, 0);
  const pozosBombeando = cierre.lecturas.filter(l => l.estadoPozo === 'BOMBEANDO').length;
  const pozosParados = cierre.lecturas.filter(l => l.estadoPozo === 'PARADO').length;
  const potencialTotal = bateriaPozo.reduce((s, p) => s + p.potencialBls, 0);
  const totalDiferida = cierre.lecturas
    .filter(l => l.estadoPozo === 'PARADO')
    .reduce((s, l) => {
      const pozo = masterPozos.find(p => p.id === l.pozoId);
      return s + (pozo?.potencialBls ?? 0);
    }, 0);

  return {
    ...cierre,
    totalCrudo,
    totalAgua,
    totalDiferida,
    pozosRegistrados: cierre.lecturas.length,
    pozosBombeando,
    pozosParados,
    totalPozos: bateriaPozo.length,
    potencialTotal,
    kpiProduccion: calcularKPI(totalCrudo, potencialTotal),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Auth ---
      currentUser: null,

      login: (userId: string, pin: string): boolean => {
        const user = usuarios.find(u => u.id === userId && u.pin === pin);
        if (user) {
          set({ currentUser: user });
          return true;
        }
        return false;
      },

      logout: () => set({ currentUser: null }),

      // --- Cierres ---
      cierres: [],

      iniciarCierre: (bateriaId: string): string => {
        const state = get();
        const existing = state.cierres.find(
          c => c.bateriaId === bateriaId && c.fecha === getTodayStr() && c.estado === 'EN_PROGRESO'
        );
        if (existing) return existing.id;

        const bateriaPozo = masterPozos.filter(p => p.bateriaId === bateriaId && p.estado === 'ACTIVO');
        const hour = new Date().getHours();
        const turno: 'DIA' | 'NOCHE' = hour >= 6 && hour < 18 ? 'DIA' : 'NOCHE';

        const cierre: CierreBateria = {
          id: generateId(),
          bateriaId,
          fecha: getTodayStr(),
          turno,
          operadorId: state.currentUser?.id ?? '',
          estado: 'EN_PROGRESO',
          lecturas: [],
          tanques: [],
          bombeos: [],
          presionCierre: 0,
          novedades: '',
          totalCrudo: 0,
          totalAgua: 0,
          totalDiferida: 0,
          pozosRegistrados: 0,
          pozosBombeando: 0,
          pozosParados: 0,
          totalPozos: bateriaPozo.length,
          potencialTotal: bateriaPozo.reduce((s, p) => s + p.potencialBls, 0),
          kpiProduccion: 0,
        };

        set({ cierres: [...state.cierres, cierre] });
        return cierre.id;
      },

      guardarLectura: (cierreId: string, lectura: LecturaPozo) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            const lecturas = c.lecturas.filter(l => l.pozoId !== lectura.pozoId);
            lecturas.push(lectura);
            return recalcTotals({ ...c, lecturas });
          });
          return { cierres };
        });
      },

      eliminarLectura: (cierreId: string, pozoId: string) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            const lecturas = c.lecturas.filter(l => l.pozoId !== pozoId);
            return recalcTotals({ ...c, lecturas });
          });
          return { cierres };
        });
      },

      guardarTanques: (cierreId: string, tanques: MedidaTanque[], bombeos: Bombeo[], presionCierre: number) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            return { ...c, tanques, bombeos, presionCierre };
          });
          return { cierres };
        });
      },

      guardarNovedades: (cierreId: string, novedades: string) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            return { ...c, novedades };
          });
          return { cierres };
        });
      },

      enviarCierre: (cierreId: string) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            return { ...c, estado: 'ENVIADO' as const };
          });
          return { cierres };
        });
      },

      aprobarCierre: (cierreId: string) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            return { ...c, estado: 'APROBADO' as const };
          });
          return { cierres };
        });
      },

      rechazarCierre: (cierreId: string, comentario: string) => {
        set(state => {
          const cierres = state.cierres.map(c => {
            if (c.id !== cierreId) return c;
            return { ...c, estado: 'RECHAZADO' as const, comentarioRechazo: comentario };
          });
          return { cierres };
        });
      },

      // --- Helpers ---
      getCierreActivo: (bateriaId: string) => {
        return get().cierres.find(
          c => c.bateriaId === bateriaId && c.fecha === getTodayStr() && c.estado === 'EN_PROGRESO'
        );
      },

      getCierresDelDia: () => {
        return get().cierres.filter(c => c.fecha === getTodayStr());
      },
    }),
    {
      name: 'rts-next-storage',
    }
  )
);
