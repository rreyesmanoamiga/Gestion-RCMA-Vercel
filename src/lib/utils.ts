import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind resolviendo conflictos.
 * @example cn('px-2 py-1', condition && 'bg-blue-500')
 */
export function cn(...inputs: unknown[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detecta si la app está corriendo dentro de un iframe.
 * Implementada como función (no constante) para:
 * - Evitar crash en SSR / entornos sin window (Node, Vitest)
 * - Garantizar el valor actual en cada llamada
 */
export const isIframe = () =>
  typeof window !== 'undefined' && window.self !== window.top;
/**
 * Hora límite de un pendiente ('14:30' o '14:30:00') en formato legible.
 * @example fmtHora('14:30:00') // '2:30 p. m.'
 */
export const fmtHora = (h?: string | null) => {
  if (!h) return '';
  const [hh, mm] = h.split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
};
