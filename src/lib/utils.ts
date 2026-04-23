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