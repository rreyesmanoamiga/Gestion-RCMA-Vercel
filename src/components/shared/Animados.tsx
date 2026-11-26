// Piezas visuales "vivas" del sistema: números que suben al cargar, mini
// gráficas de tendencia, barra de avance e indicador de actualización.
// Todo respeta "reducir movimiento" del equipo: si está activo, no se anima.
import React, { useEffect, useRef, useState } from 'react';

const reducirMovimiento = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cuenta de 0 (o del valor anterior) al valor nuevo en ~0.9 s. */
export function useConteo(valor: number, duracion = 900) {
  const [mostrado, setMostrado] = useState(() => (reducirMovimiento() ? valor : 0));
  const desde = useRef(mostrado);
  useEffect(() => {
    if (!Number.isFinite(valor)) return;
    if (reducirMovimiento()) { setMostrado(valor); desde.current = valor; return; }
    const inicio = desde.current;
    const t0 = performance.now();
    let id = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / duracion);
      const v = inicio + (valor - inicio) * (1 - Math.pow(1 - p, 3));
      setMostrado(v);
      if (p < 1) id = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor, duracion]);
  return mostrado;
}

/** Número animado. `formato` recibe el número ya redondeado. */
export function NumeroAnimado({ valor, formato }: { valor: number; formato?: (n: number) => string }) {
  const v = Math.round(useConteo(valor));
  return <span className="tabular-nums">{formato ? formato(v) : v.toLocaleString('es-MX')}</span>;
}

/** Si el valor es número, lo anima; si es texto (ej. "18/20"), lo muestra tal cual. */
export function ValorAnimado({ valor }: { valor: React.ReactNode }) {
  if (typeof valor === 'number') return <NumeroAnimado valor={valor} />;
  return <span className="tabular-nums">{valor}</span>;
}

/** Mini gráfica de tendencia (sin ejes). */
export function Sparkline({ datos, color = '#00295A', alto = 30 }: { datos: number[]; color?: string; alto?: number }) {
  if (datos.length < 2) return null;
  const max = Math.max(...datos), min = Math.min(...datos);
  const rango = max - min || 1;
  const pts = datos.map((d, i) => `${(i / (datos.length - 1)) * 100},${alto - 3 - ((d - min) / rango) * (alto - 6)}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" className="w-full block rcma-trazo" style={{ height: alto }} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={pts} />
    </svg>
  );
}

/** Etiqueta de cambio contra el mes anterior. `invertir` = subir es malo (ej. pendientes). */
export function CambioMes({ actual, anterior, invertir = false, formato }: { actual: number; anterior: number; invertir?: boolean; formato?: (n: number) => string }) {
  const dif = actual - anterior;
  const f = formato ?? ((n: number) => n.toLocaleString('es-MX'));
  if (dif === 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap" title="Igual que el mes anterior">=</span>;
  const bueno = invertir ? dif < 0 : dif > 0;
  return (
    <span title={`Contra el mes anterior · Este mes: ${f(actual)} · Mes anterior: ${f(anterior)}`}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${bueno ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {dif > 0 ? '▲' : '▼'} {f(Math.abs(dif))}
    </span>
  );
}

/** Barra de avance que se llena al aparecer. */
export function BarraAvance({ pct, color = '#00295A', className = 'w-16' }: { pct: number; color?: string; className?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={`inline-block h-1.5 rounded-full bg-slate-100 overflow-hidden align-middle ${className}`}>
      <span className="block h-full rounded-full rcma-llenar" style={{ width: `${p}%`, backgroundColor: color }} />
    </span>
  );
}

/** Punto verde "Actualizado hace X min" a partir de la última carga de datos. */
export function ActualizadoHace({ ts }: { ts: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30000); return () => clearInterval(id); }, []);
  if (!ts) return null;
  const min = Math.floor((Date.now() - ts) / 60000);
  const texto = min < 1 ? 'hace un momento' : min === 1 ? 'hace 1 min' : `hace ${min} min`;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
      </span>
      Actualizado {texto}
    </span>
  );
}
