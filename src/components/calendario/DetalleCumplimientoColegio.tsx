// Detalle de cumplimiento de UN colegio en el mes: calendario con el estado de
// cada día (cumplido / parcial / sin cumplir / próximo), las actividades del
// día seleccionado y sus fotos de evidencia, que se ven dentro del sistema.
// Las fotos se leen del OneDrive con la función "calendario-evidencias": no se
// guarda nada en Supabase.
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, AlertTriangle, ImageOff, Images, Loader2, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { VisorFotos } from '@/components/projects/GaleriaEvidencia';

export interface InstanciaActividad {
  fecha: string;            // YYYY-MM-DD
  dia: number;
  actividad: string;
  categoria: string;
  color: string;
  completion?: { id: string; evidencia_url: string | null; realizado_por?: string | null } | null;
}

type FotoInfo = { miniatura: string | null; grande: string | null; onedrive: string | null };

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type EstadoDia = 'cumplido' | 'parcial' | 'sin_cumplir' | 'proximo';
const ESTILO_DIA: Record<EstadoDia, { celda: string; etiqueta: string; punto: string }> = {
  cumplido:    { celda: 'bg-emerald-50 border-emerald-300 text-emerald-800', etiqueta: 'Cumplido',     punto: 'bg-emerald-500' },
  parcial:     { celda: 'bg-amber-50 border-amber-300 text-amber-800',       etiqueta: 'Parcial',      punto: 'bg-amber-500' },
  sin_cumplir: { celda: 'bg-red-50 border-red-300 text-red-700',             etiqueta: 'Sin cumplir',  punto: 'bg-red-500' },
  proximo:     { celda: 'bg-white border-slate-200 text-slate-500',          etiqueta: 'Por venir',    punto: 'bg-slate-300' },
};

export default function DetalleCumplimientoColegio({ colegio, año, mes, instancias }: {
  colegio: string;
  año: number;
  mes: number;              // 0-11
  instancias: InstanciaActividad[];
}) {
  const hoyISO = (() => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`; })();
  const desde = `${año}-${String(mes + 1).padStart(2, '0')}-01`;
  const hasta = `${año}-${String(mes + 1).padStart(2, '0')}-${String(new Date(año, mes + 1, 0).getDate()).padStart(2, '0')}`;
  const conEvidencia = instancias.filter(i => i.completion?.evidencia_url).length;

  // Fotos (links temporales de Microsoft): se refrescan antes de caducar
  const { data: fotos = {}, isLoading: cargandoFotos, isError: errorFotos } = useQuery({
    queryKey: ['calendario-evidencias', colegio, desde, hasta, conEvidencia],
    enabled: conEvidencia > 0,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Record<string, FotoInfo>> => {
      const { data, error } = await supabase.functions.invoke('calendario-evidencias', { body: { colegio, desde, hasta } });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data?.fotos ?? {};
    },
  });

  // Estado de cada día con actividades
  const porDia = useMemo(() => {
    const m = new Map<number, InstanciaActividad[]>();
    instancias.forEach(i => { if (!m.has(i.dia)) m.set(i.dia, []); m.get(i.dia)!.push(i); });
    return m;
  }, [instancias]);

  const estadoDia = (dia: number): EstadoDia | null => {
    const acts = porDia.get(dia);
    if (!acts?.length) return null;
    const hechas = acts.filter(a => a.completion).length;
    if (hechas === acts.length) return 'cumplido';
    if (hechas > 0) return 'parcial';
    return acts[0].fecha < hoyISO ? 'sin_cumplir' : 'proximo';
  };

  const resumen = useMemo(() => {
    const r: Record<EstadoDia, number> = { cumplido: 0, parcial: 0, sin_cumplir: 0, proximo: 0 };
    porDia.forEach((_, d) => { const e = estadoDia(d); if (e) r[e]++; });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porDia]);

  // Día seleccionado: hoy si cae en el mes; si no, el primer día con actividades
  const [diaSel, setDiaSel] = useState<number | null>(() => {
    const h = new Date();
    if (h.getFullYear() === año && h.getMonth() === mes && porDia.has(h.getDate())) return h.getDate();
    return [...porDia.keys()].sort((a, b) => a - b)[0] ?? null;
  });

  // Todas las fotos del mes, en orden, para el visor
  const fotosMes = useMemo(() => instancias
    .filter(i => i.completion?.evidencia_url)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.actividad.localeCompare(b.actividad))
    .map(i => {
      const f = fotos[i.completion!.id];
      const d = new Date(`${i.fecha}T12:00:00`);
      return {
        id: i.completion!.id,
        nombre: i.actividad,
        miniatura: f?.miniatura ?? null,
        grande: f?.grande ?? f?.miniatura ?? null,
        onedrive: f?.onedrive ?? i.completion!.evidencia_url,
        seccion: `${DIAS[d.getDay()]} ${d.getDate()}`,
      };
    }), [instancias, fotos]);
  const [visor, setVisor] = useState<number | null>(null);
  const abrirFoto = (completionId: string) => {
    const i = fotosMes.findIndex(f => f.id === completionId);
    if (i >= 0) setVisor(i);
  };

  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const primerDia = new Date(año, mes, 1).getDay();
  const actsSel = diaSel ? (porDia.get(diaSel) ?? []) : [];
  const fechaSel = diaSel ? new Date(año, mes, diaSel) : null;

  return (
    <div className="px-5 pb-5 pt-2 bg-slate-50 space-y-4">
      {/* Resumen + leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        {(Object.keys(ESTILO_DIA) as EstadoDia[]).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`w-2.5 h-2.5 rounded-full ${ESTILO_DIA[k].punto}`} />
            {ESTILO_DIA[k].etiqueta} <b className="text-slate-800">{resumen[k]}</b>
          </span>
        ))}
        {conEvidencia > 0 && (
          <button type="button" onClick={() => setVisor(0)} disabled={cargandoFotos}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            {cargandoFotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
            Ver las {conEvidencia} fotos del mes
          </button>
        )}
      </div>
      {errorFotos && <p className="text-[11px] text-red-600">No se pudieron cargar las fotos de evidencia. Intenta de nuevo en un momento.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_1fr] gap-4">
        {/* Mini calendario */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS.map(d => <p key={d} className="text-[10px] font-bold text-slate-400 text-center uppercase">{d}</p>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: primerDia }).map((_, i) => <div key={`v${i}`} />)}
            {Array.from({ length: diasEnMes }, (_, i) => i + 1).map(dia => {
              const e = estadoDia(dia);
              const acts = porDia.get(dia) ?? [];
              const hechas = acts.filter(a => a.completion).length;
              const sel = diaSel === dia;
              if (!e) return (
                <div key={dia} className="aspect-square rounded-md flex items-start justify-start p-1 text-[10px] text-slate-300">{dia}</div>
              );
              return (
                <button key={dia} type="button" onClick={() => setDiaSel(dia)}
                  title={`${hechas} de ${acts.length} realizadas`}
                  className={`aspect-square rounded-md border flex flex-col items-start justify-between p-1 transition ${ESTILO_DIA[e].celda} ${sel ? 'ring-2 ring-[#00295A] ring-offset-1' : 'hover:brightness-95'}`}>
                  <span className="text-[11px] font-bold leading-none">{dia}</span>
                  <span className="text-[9px] font-semibold leading-none self-end">{hechas}/{acts.length}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actividades del día */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-w-0">
          {!fechaSel ? (
            <p className="p-4 text-xs text-slate-400 italic">No hay actividades programadas este mes.</p>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">{DIAS_LARGO[fechaSel.getDay()]} {fechaSel.getDate()}</p>
                <p className="text-[11px] text-slate-500">{actsSel.filter(a => a.completion).length} de {actsSel.length} realizadas</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-[22rem] overflow-y-auto">
                {actsSel.map((a, i) => {
                  const hecha = !!a.completion;
                  const vencida = !hecha && a.fecha < hoyISO;
                  const foto = a.completion ? fotos[a.completion.id] : undefined;
                  const tieneEvidencia = !!a.completion?.evidencia_url;
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate">{a.actividad}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {a.categoria}{a.completion?.realizado_por ? ` · ${a.completion.realizado_por}` : ''}
                        </p>
                      </div>
                      {hecha ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0" title="Realizada"><CheckCircle2 className="w-3 h-3" /> <span className="hidden sm:inline">Realizada</span></span>
                      ) : vencida ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0" title="No realizada"><AlertTriangle className="w-3 h-3" /> <span className="hidden sm:inline">No realizada</span></span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0" title="Pendiente"><Clock className="w-3 h-3" /> <span className="hidden sm:inline">Pendiente</span></span>
                      )}
                      {/* Miniatura de la evidencia */}
                      <div className="w-14 h-14 shrink-0">
                        {tieneEvidencia ? (
                          <button type="button" onClick={() => abrirFoto(a.completion!.id)} title="Ver foto"
                            className="w-full h-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-[#ED7102] flex items-center justify-center">
                            {foto?.miniatura ? (
                              <img src={foto.miniatura} alt={a.actividad} loading="lazy" className="w-full h-full object-cover" />
                            ) : cargandoFotos ? (
                              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                            ) : (
                              <ImageOff className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        ) : hecha ? (
                          <span className="w-full h-full rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-300" title="Sin foto">
                            <Camera className="w-4 h-4" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {visor !== null && fotosMes.length > 0 && (
        <VisorFotos fotos={fotosMes} indice={visor} onCerrar={() => setVisor(null)} onCambiar={setVisor} />
      )}
    </div>
  );
}
