// ============================================================
// RT NEXT — Utility Functions
// ============================================================

/**
 * Conditionally join class names (like clsx/cn)
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Format a Date to dd/MM/yyyy
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get today's date as yyyy-MM-dd string
 */
export function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate KPI: (produccion real / potencial) * 100
 */
export function calcularKPI(produccionReal: number, potencial: number): number {
  if (potencial === 0) return 0;
  return Math.round((produccionReal / potencial) * 100 * 10) / 10;
}

/**
 * Calculate tank balance (cuadre de tanque)
 * Returns { produccionTanque, diferencia, porcentaje, estado }
 */
export function calcularCuadreTanque(
  produccionPozos: number,
  medidaAnterior: number,
  medidaActual: number,
  aguaLibre: number,
  bombeado: number
): { produccionTanque: number; diferencia: number; porcentaje: number; estado: 'OK' | 'ALERTA' | 'CRITICO' } {
  const produccionTanque = (medidaActual - medidaAnterior) + bombeado - aguaLibre;
  const diferencia = Math.abs(produccionPozos - produccionTanque);
  const porcentaje = produccionPozos > 0 ? (diferencia / produccionPozos) * 100 : 0;

  let estado: 'OK' | 'ALERTA' | 'CRITICO' = 'OK';
  if (porcentaje > 15) estado = 'CRITICO';
  else if (porcentaje > 5) estado = 'ALERTA';

  return { produccionTanque, diferencia, porcentaje: Math.round(porcentaje * 10) / 10, estado };
}
