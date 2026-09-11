import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { useComplianceDocs, formatFecha, LoadingBlock, ErrorBlock, type ComplianceDoc } from '@/lib/complianceShared';
import { AlertTriangle, DollarSign, FileWarning } from 'lucide-react';

interface Concepto { id: string; nombre: string; partida_hoja: string | null; partida_seccion: string | null; partida_linea: string | null; }
interface CostoConcepto { colegio: string; concepto_id: string; costo_total: number | null; }

const fmtMXN = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function JornadaPresupuestal() {
  const { isAdmin } = usePermissions();
  const añoActual = new Date().getFullYear();
  const [añoJornada, setAñoJornada] = useState(añoActual + 1);

  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();

  const { data: conceptos = [] } = useQuery({
    queryKey: ['compliance_conceptos_periodicidad'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos').select('id, nombre, partida_hoja, partida_seccion, partida_linea');
      if (error) throw error;
      return (data ?? []) as Concepto[];
    },
  });

  const { data: costos = [] } = useQuery({
    queryKey: ['costos_conceptos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('costos_conceptos').select('colegio, concepto_id, costo_total');
      if (error) throw error;
      return (data ?? []) as CostoConcepto[];
    },
  });

  const getCosto = (colegio: string, tipoDocumento: string): number | null => {
    const concepto = conceptos.find(c => c.nombre === tipoDocumento);
    if (!concepto) return null;
    const costo = costos.find(c => c.colegio === colegio && c.concepto_id === concepto.id);
    return costo?.costo_total ?? null;
  };

  const getPartida = (tipoDocumento: string): string | null => {
    const concepto = conceptos.find(c => c.nombre === tipoDocumento);
    if (!concepto?.partida_hoja) return null;
    const partes = [concepto.partida_hoja, concepto.partida_seccion].filter(Boolean);
    return partes.join(' → ') + (concepto.partida_linea ? ` (${concepto.partida_linea})` : '');
  };

  // Solo lo que vence JUSTO en el año elegido — ni antes ni después.
  const docsDelAño = useMemo(() => {
    return docs.filter(d => {
      if (!d.vigente_hasta) return false; // sin "Vigente desde" capturado o trámite único
      return new Date(d.vigente_hasta + 'T00:00:00').getFullYear() === añoJornada;
    });
  }, [docs, añoJornada]);

  const porColegio = useMemo(() => {
    const mapa = new Map<string, { colegio: string; territorio: string; docs: (ComplianceDoc & { costo: number | null; partida: string | null })[] }>();
    docsDelAño.forEach(d => {
      const costo = getCosto(d.colegio, d.tipo_documento);
      const partida = getPartida(d.tipo_documento);
      const cur = mapa.get(d.colegio) ?? { colegio: d.colegio, territorio: d.territorio, docs: [] };
      cur.docs.push({ ...d, costo, partida });
      mapa.set(d.colegio, cur);
    });
    return Array.from(mapa.values())
      .map(c => ({
        ...c,
        docs: c.docs.sort((a, b) => (a.vigente_hasta ?? '').localeCompare(b.vigente_hasta ?? '')),
        subtotal: c.docs.reduce((s, d) => s + (d.costo ?? 0), 0),
        sinCosto: c.docs.filter(d => d.costo === null).length,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [docsDelAño, conceptos, costos]);

  const totales = useMemo(() => ({
    documentos: docsDelAño.length,
    colegios: porColegio.length,
    presupuesto: porColegio.reduce((s, c) => s + c.subtotal, 0),
    sinCosto: porColegio.reduce((s, c) => s + c.sinCosto, 0),
  }), [docsDelAño, porColegio]);

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Jornada Presupuestal" subtitle="Vencimientos y costos por colegio para el año que se está presupuestando" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Jornada Presupuestal" subtitle="Vencimientos y costos por colegio para el año que se está presupuestando" />
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Estamos en {añoActual}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-slate-500">Jornada</span>
            <input
              type="number"
              value={añoJornada}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setAñoJornada(v);
              }}
              className="w-24 text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#00295A]">{totales.documentos}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Vencen en {añoJornada}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#00295A]">{totales.colegios}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Colegios afectados</p>
            </div>
            <div className="bg-white border border-emerald-200 rounded-xl p-4 text-center bg-emerald-50/40">
              <p className="text-2xl font-bold text-emerald-700">{fmtMXN(totales.presupuesto)}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Presupuesto estimado</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-4 text-center bg-amber-50/40">
              <p className="text-2xl font-bold text-amber-700">{totales.sinCosto}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Sin costo capturado</p>
            </div>
          </div>

          {porColegio.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <FileWarning className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">Ningún documento vence en {añoJornada}</p>
              <p className="text-xs text-slate-400 mt-1">
                Solo se muestran documentos con "Vigente desde" capturado en Validación de Vigencias.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {porColegio.map(c => (
                <div key={c.colegio} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{c.colegio}</p>
                      <p className="text-[11px] text-slate-400">{c.territorio} · {c.docs.length} documento{c.docs.length !== 1 ? 's' : ''} por vencer en {añoJornada}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-700">{fmtMXN(c.subtotal)}</p>
                      {c.sinCosto > 0 && (
                        <p className="text-[10px] font-bold text-amber-600 flex items-center gap-1 justify-end">
                          <AlertTriangle className="w-3 h-3" /> {c.sinCosto} sin costo capturado
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {c.docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-700 truncate">{d.tipo_documento}</p>
                          <p className="text-[11px] text-slate-400">Vence {formatFecha(d.vigente_hasta)}</p>
                          {d.partida ? (
                            <p className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 inline-block mt-1">
                              💰 Partida: {d.partida}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-300 italic mt-1">Sin partida asignada — captúrala en Catálogo</p>
                          )}
                        </div>
                        {d.costo !== null ? (
                          <span className="text-sm font-bold text-slate-700 shrink-0 ml-3">{fmtMXN(d.costo)}</span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full shrink-0 ml-3 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Sin costo
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
