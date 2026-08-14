import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ShieldCheck, FileText, ShieldAlert, LayoutDashboard, Construction, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const TABS = [
  { path: '/cumplimiento',            label: 'Panel General', icon: LayoutDashboard },
  { path: '/cumplimiento/documentos', label: 'Documentos',    icon: FileText },
  { path: '/cumplimiento/alertas',    label: 'Alertas',       icon: ShieldAlert },
];

interface ComplianceDoc {
  id: string;
  colegio: string;
  territorio: string;
  materia: string | null;
  tipo_documento: string;
  estado: string;
  vigente: string | null;
  fecha_limite_recepcion: string | null;
  año: number;
}

const MATERIAS = ['Todas', 'Protección civil', 'Donatarias Autorizadas', 'Sin categoría'] as const;

function Placeholder({ label }: { label: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
      <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
        <Construction className="w-7 h-7 text-[#ED7102]" />
      </div>
      <h2 className="text-lg font-bold text-[#00295A] mb-2">Estamos armando esta sección</h2>
      <p className="text-sm text-slate-500 max-w-md mx-auto">
        {label} de Cumplimiento Normativo está en construcción. Aquí vas a ver la <strong>tabla de seguimiento</strong> de
        los documentos de Protección Civil y Donatarias Autorizadas de los 20 colegios (estado, vigencia, responsable, fecha objetivo)
        — un espejo del registro oficial de Compliance, no un lugar para subir archivos.
      </p>
      <div className="flex items-center justify-center gap-2 mt-5 text-xs text-slate-400">
        <ShieldCheck className="w-4 h-4" />
        Visible solo para ti por el momento
      </div>
    </div>
  );
}

function PanelGeneral() {
  const [materiaFiltro, setMateriaFiltro] = useState<typeof MATERIAS[number]>('Todas');

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['compliance_documentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_documentos')
        .select('id, colegio, territorio, materia, tipo_documento, estado, vigente, fecha_limite_recepcion, año')
        .eq('activo', true);
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceDoc[];
    },
  });

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const docsFiltrados = useMemo(() => {
    if (materiaFiltro === 'Todas') return docs;
    if (materiaFiltro === 'Sin categoría') return docs.filter(d => !d.materia);
    return docs.filter(d => d.materia === materiaFiltro);
  }, [docs, materiaFiltro]);

  const esRetraso = (d: ComplianceDoc) => {
    if (d.estado === 'Verificado') return false;
    if (!d.fecha_limite_recepcion) return false;
    return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
  };

  const kpis = useMemo(() => {
    const total = docsFiltrados.length;
    const retraso = docsFiltrados.filter(esRetraso).length;
    const porExpirar = docsFiltrados.filter(d => d.vigente === 'Por expirar').length;
    const verificados = docsFiltrados.filter(d => d.estado === 'Verificado').length;
    return { total, retraso, porExpirar, verificados };
  }, [docsFiltrados, hoy]);

  const porColegio = useMemo(() => {
    const mapa = new Map<string, { colegio: string; territorio: string; total: number; retraso: number; verificados: number }>();
    docsFiltrados.forEach(d => {
      const cur = mapa.get(d.colegio) ?? { colegio: d.colegio, territorio: d.territorio, total: 0, retraso: 0, verificados: 0 };
      cur.total++;
      if (esRetraso(d)) cur.retraso++;
      if (d.estado === 'Verificado') cur.verificados++;
      mapa.set(d.colegio, cur);
    });
    return Array.from(mapa.values()).sort((a, b) => b.retraso - a.retraso);
  }, [docsFiltrados, hoy]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando datos de Compliance...
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {MATERIAS.map(m => (
          <button key={m} onClick={() => setMateriaFiltro(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              materiaFiltro === m ? 'bg-[#00295A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#00295A]">{kpis.total}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Documentos</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{kpis.retraso}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">En retraso</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#ED7102]">{kpis.porExpirar}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Por expirar</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{kpis.verificados}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Verificados</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-bold text-[#00295A] uppercase tracking-wide">Cumplimiento por colegio — ordenado de mayor a menor retraso</p>
        </div>
        <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
          {porColegio.map(c => (
            <div key={c.colegio} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm text-slate-800">{c.colegio}</p>
                <p className="text-[10px] text-slate-400">{c.territorio} · {c.verificados}/{c.total} verificados</p>
              </div>
              {c.retraso > 0 ? (
                <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full">{c.retraso} en retraso</span>
              ) : (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Al día</span>
              )}
            </div>
          ))}
          {porColegio.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Sin documentos para este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CumplimientoNormativo() {
  const location = useLocation();
  const tabActivo = TABS.find(t => t.path === location.pathname) ?? TABS[0];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Cumplimiento Normativo" subtitle="Protección Civil, Donatarias y documentación regulatoria — motor de ejecución sobre el registro oficial de Compliance" />

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const activo = t.path === tabActivo.path;
          return (
            <a key={t.path} href={t.path}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activo ? 'border-[#ED7102] text-[#00295A]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </a>
          );
        })}
      </div>

      {tabActivo.path === '/cumplimiento' ? <PanelGeneral /> : <Placeholder label={tabActivo.label} />}
    </div>
  );
}
