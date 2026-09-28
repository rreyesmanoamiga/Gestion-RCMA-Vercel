// Mis Documentos de Cumplimiento — pantalla para el administrador de CADA
// colegio: solo ve los documentos de su colegio y sube los archivos que le
// faltan. La Coordinación RCMA los revisa y los verifica o rechaza.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import ArchivosDocumento from '@/components/cumplimiento/ArchivosDocumento';
import { useConteoArchivos } from '@/lib/cumplimientoArchivos';
import { formatFecha, LoadingBlock, DetalleModal, type ComplianceDoc } from '@/lib/complianceShared';
import { COLEGIOS } from '@/lib/colegios';

const COLEGIOS_PC = COLEGIOS.filter(c => c.territorio !== 'FMA' && !c.colegio.startsWith('CLIN'));
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
  // El administrador ve el expediente de CUALQUIER colegio (selector); el
  // usuario de colegio, solo el suyo.
  const puede = isAdmin || can('subir_cumplimiento');
  const [colegioAdmin, setColegioAdmin] = useState(COLEGIOS_PC[0]?.colegio ?? '');
  const colegio = isAdmin ? colegioAdmin : ((permsRecord as any)?.colegio as string | undefined);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [abierto, setAbierto] = useState<MiDoc | null>(null);
  const [filtro, setFiltro] = useState<'todos' | Situacion>('todos');
  const [busqueda, setBusqueda] = useState('');

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ['cumplimiento_mis_documentos', anio, isAdmin ? colegio : 'propio'],
    enabled: puede && !!colegio,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from('compliance_documentos')
          .select('id, colegio, territorio, materia, tipo_documento, norma, estado, vigente, fecha_limite_recepcion, fecha_presentacion, vigente_desde, vigente_hasta, responsable, año, revision, revision_motivo')
          .eq('colegio', colegio!).eq('activo', true).eq('año', anio)
          .order('materia').order('tipo_documento');
        if (error) throw error;
        return (data ?? []) as unknown as MiDoc[];
      }
      const { data, error } = await supabase.rpc('cumplimiento_mis_documentos', { p_anio: anio });
      if (error) throw error;
      return (data ?? []) as MiDoc[];
    },
  });
  const { data: conteo = {} } = useConteoArchivos(puede);
  const qc = useQueryClient();

  // Periodicidad de cada concepto (y excepción del colegio) — para que el
  // formulario calcule el vencimiento a partir de la fecha del documento.
  const { data: periodicidades } = useQuery({
    queryKey: ['expediente_periodicidades'],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('compliance_conceptos').select('id, nombre, periodicidad'),
        supabase.from('compliance_periodicidad_colegio').select('colegio, concepto_id, periodicidad'),
      ]);
      return { conceptos: (c ?? []) as any[], porColegio: (p ?? []) as any[] };
    },
  });
  const periodicidadDe = (col: string, nombre: string) => {
    const c = periodicidades?.conceptos.find(x => x.nombre === nombre);
    if (!c) return undefined;
    return periodicidades?.porColegio.find(x => x.colegio === col && x.concepto_id === c.id)?.periodicidad ?? c.periodicidad;
  };
  const refrescarLista = () => { qc.invalidateQueries({ queryKey: ['cumplimiento_mis_documentos'] }); qc.invalidateQueries({ queryKey: ['compliance_archivos_conteo'] }); };

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
      {isAdmin ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader title="Expediente por Colegio" subtitle={`Documentos de Cumplimiento ${anio} · ${colegio}`} />
          <div className="flex items-center gap-2">
            <select value={colegioAdmin} onChange={e => { setColegioAdmin(e.target.value); setAbierto(null); }}
              className="text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white">
              {COLEGIOS_PC.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio} — {c.territorio}</option>)}
            </select>
            <input type="number" value={anio} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setAnio(v); }}
              className="w-24 text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white" />
          </div>
        </div>
      ) : (
        <PageHeader title="Mis Documentos de Cumplimiento" subtitle={`Expediente ${anio} · ${colegio}`} />
      )}

      <div className={`rounded-xl border px-5 py-4 ${faltan ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <p className={`text-sm font-bold ${faltan ? 'text-orange-800' : 'text-emerald-800'}`}>
          {isAdmin
            ? (faltan ? `A ${colegio} le faltan ${faltan} documento${faltan !== 1 ? 's' : ''} por enviar` : `El expediente de ${colegio} está al día`)
            : (faltan ? `Te faltan ${faltan} documento${faltan !== 1 ? 's' : ''} por enviar` : '¡Tu expediente está al día!')}
          {isAdmin && (conteoSit.por_revisar ?? 0) > 0 && <span className="ml-2 text-sky-700">· {conteoSit.por_revisar} por revisar</span>}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          {isAdmin
            ? 'Esta es la misma vista que tiene el administrador del colegio. Abre cualquier documento para subir archivos, verificarlo o rechazarlo.'
            : 'Abre cada documento y sube su archivo (PDF, imagen o Word; puedes subir varios). La Coordinación RCMA lo revisa y te avisa por correo cuando quede verificado o si hay que corregir algo.'}
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

      {abierto && isAdmin && (
        <DetalleModal
          doc={abierto as unknown as ComplianceDoc}
          periodicidad={periodicidadDe(abierto.colegio, abierto.tipo_documento)}
          onClose={() => { setAbierto(null); refrescarLista(); }}
          onSaved={() => { setAbierto(null); refrescarLista(); }}
        />
      )}

      {abierto && !isAdmin && (
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
                esAdmin={isAdmin}
                bloqueado={isAdmin ? false : situacion(abierto) === 'verificado'}
                onCambio={() => setAbierto(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
