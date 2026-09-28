// Mis Documentos de Cumplimiento — pantalla para el administrador de CADA
// colegio: solo ve los documentos de su colegio y sube los archivos que le
// faltan. La Coordinación RCMA los revisa y los verifica o rechaza.
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import ArchivosDocumento from '@/components/cumplimiento/ArchivosDocumento';
import { useConteoArchivos } from '@/lib/cumplimientoArchivos';
import { formatFecha, LoadingBlock } from '@/lib/complianceShared';
import { FolderOpen, CheckCircle2, Clock, XCircle, Upload, ChevronRight, X, Search, AlertTriangle } from 'lucide-react';

interface MiDoc {
  id: string; colegio: string; materia: string | null; tipo_documento: string; norma: string | null;
  estado: string; vigente: string | null; vigente_desde: string | null; vigente_hasta: string | null; año: number;
  revision: string | null; revision_motivo: string | null;
}

type Situacion = 'falta' | 'rechazado' | 'por_revisar' | 'verificado' | 'por_vencer';
const SIT: Record<Situacion, { label: string; cls: string; Icon: React.ElementType }> = {
  falta:       { label: 'Falta enviar',        cls: 'bg-orange-50 text-orange-700 border-orange-200',   Icon: Upload },
  rechazado:   { label: 'Rechazado',           cls: 'bg-red-50 text-red-700 border-red-200',            Icon: XCircle },
  por_revisar: { label: 'En revisión RCMA',    cls: 'bg-sky-50 text-sky-700 border-sky-200',            Icon: Clock },
  por_vencer:  { label: 'Por vencer',          cls: 'bg-amber-50 text-amber-700 border-amber-200',      Icon: AlertTriangle },
  verificado:  { label: 'Verificado',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
};

export default function CumplimientoMisDocumentos() {
  const { isAdmin, can, permsRecord } = usePermissions();
  const puede = can('subir_cumplimiento');
  const colegio = (permsRecord as any)?.colegio as string | undefined;
  const [anio] = useState(new Date().getFullYear());
  const [abierto, setAbierto] = useState<MiDoc | null>(null);
  const [filtro, setFiltro] = useState<'todos' | Situacion>('todos');
  const [busqueda, setBusqueda] = useState('');

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ['cumplimiento_mis_documentos', anio],
    enabled: puede && !isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cumplimiento_mis_documentos', { p_anio: anio });
      if (error) throw error;
      return (data ?? []) as MiDoc[];
    },
  });
  const { data: conteo = {} } = useConteoArchivos(puede && !isAdmin);

  // Días para que venza, calculado hoy (no depende del campo guardado)
  const diasParaVencer = (d: MiDoc) => d.vigente_hasta
    ? Math.round((new Date(String(d.vigente_hasta).slice(0, 10) + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400e3)
    : null;

  const situacion = (d: MiDoc): Situacion => {
    if (d.revision === 'rechazado') return 'rechazado';
    if (d.revision === 'por_revisar') return 'por_revisar';
    const dias = diasParaVencer(d);
    if (dias !== null && dias < 0) return 'falta'; // venció: hay que renovarlo
    if (d.estado === 'Verificado' || d.revision === 'verificado') return dias !== null && dias <= 90 ? 'por_vencer' : 'verificado';
    return 'falta';
  };

  const conteoSit = useMemo(() => {
    const c: Record<string, number> = { todos: docs.length };
    docs.forEach(d => { const s = situacion(d); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [docs]);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const out = new Map<string, MiDoc[]>();
    docs.filter(d => (filtro === 'todos' || situacion(d) === filtro) && (!q || d.tipo_documento.toLowerCase().includes(q)))
      .forEach(d => { const k = d.materia ?? 'Sin materia'; out.set(k, [...(out.get(k) ?? []), d]); });
    return Array.from(out.entries());
  }, [docs, filtro, busqueda]);

  if (isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
        <PageHeader title="Mis Documentos de Cumplimiento" subtitle="Vista del administrador de cada colegio" />
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Esta pantalla es la que ven los administradores de colegio. Tú revisas y subes documentos desde <b>Validación de Vigencias</b>.
        </div>
      </div>
    );
  }
  if (!puede || !colegio) {
    return (
      <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
        <PageHeader title="Mis Documentos de Cumplimiento" subtitle="Expediente de Cumplimiento de tu colegio" />
        <AccesoRestringido />
      </div>
    );
  }

  const faltan = (conteoSit.falta ?? 0) + (conteoSit.rechazado ?? 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <PageHeader title="Mis Documentos de Cumplimiento" subtitle={`Expediente ${anio} · ${colegio}`} />

      <div className={`rounded-xl border px-5 py-4 ${faltan ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <p className={`text-sm font-bold ${faltan ? 'text-orange-800' : 'text-emerald-800'}`}>
          {faltan ? `Te faltan ${faltan} documento${faltan !== 1 ? 's' : ''} por enviar` : '¡Tu expediente está al día!'}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Abre cada documento y sube su archivo (PDF, imagen o Word; puedes subir varios). La Coordinación RCMA lo revisa y te avisa por correo cuando quede verificado o si hay que corregir algo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['todos', 'falta', 'rechazado', 'por_revisar', 'por_vencer', 'verificado'] as const).map(k => (
          <button key={k} type="button" onClick={() => setFiltro(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${filtro === k ? 'bg-[#00295A] text-white border-[#00295A]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            {k === 'todos' ? 'Todos' : SIT[k].label} <span className="opacity-70">({conteoSit[k] ?? 0})</span>
          </button>
        ))}
        <div className="relative ml-auto min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar documento…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00295A]/20" />
        </div>
      </div>

      {isLoading ? <LoadingBlock /> : error ? (
        <p className="text-sm text-red-600">No se pudieron cargar tus documentos: {(error as any).message}</p>
      ) : grupos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" /> Sin documentos para este filtro.
        </div>
      ) : grupos.map(([materia, items]) => (
        <div key={materia} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
            {materia} · {items.length}
          </div>
          <div className="divide-y divide-slate-100">
            {items.map(d => {
              const s = SIT[situacion(d)];
              return (
                <button key={d.id} type="button" onClick={() => setAbierto(d)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition">
                  <s.Icon className={`w-4 h-4 shrink-0 ${s.cls.split(' ').find(c => c.startsWith('text-'))}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{d.tipo_documento}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {d.vigente_hasta ? `Vence ${formatFecha(d.vigente_hasta)}` : d.norma ?? ''}
                      {conteo[d.id] ? ` · ${conteo[d.id]} archivo${conteo[d.id] !== 1 ? 's' : ''}` : ''}
                    </p>
                    {d.revision === 'rechazado' && d.revision_motivo && (
                      <p className="text-[11px] text-red-600 mt-0.5 truncate">Motivo: {d.revision_motivo}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${s.cls}`}>{s.label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {abierto && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => setAbierto(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl sticky top-0 z-10">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{colegio} · {abierto.materia}</p>
                <h3 className="text-base font-bold text-[#00295A] mt-0.5">{abierto.tipo_documento}</h3>
                {abierto.norma && <p className="text-xs text-slate-500 mt-1">{abierto.norma}</p>}
              </div>
              <button onClick={() => setAbierto(null)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {abierto.vigente_hasta && (
                <p className="text-xs text-slate-500">Vigente hasta: <b>{formatFecha(abierto.vigente_hasta)}</b></p>
              )}
              <ArchivosDocumento
                documentoId={abierto.id}
                revision={abierto.revision}
                revisionMotivo={abierto.revision_motivo}
                esAdmin={false}
                bloqueado={situacion(abierto) === 'verificado'}
                onCambio={() => setAbierto(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
