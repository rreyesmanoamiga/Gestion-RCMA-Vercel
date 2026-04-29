import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ClipboardCheck, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { TERRITORIOS, COLEGIOS } from '@/lib/colegios';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import ChecklistForm, { MATERIALES } from '@/components/checklists/ChecklistForm';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  bueno:   { label: 'Bueno',   className: 'bg-green-100 text-green-700 border border-green-200' },
  regular: { label: 'Regular', className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  malo:    { label: 'Malo',    className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  critico: { label: 'Crítico', className: 'bg-red-100 text-red-700 border border-red-200' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status ?? 'bueno'] ?? STATUS_CONFIG.bueno;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

const abreviarMaterial = (m: string) => {
  const match = m.match(/^([^(]+)/);
  return match ? match[1].trim() : m;
};

const formatFecha = (fecha?: string) => {
  if (!fecha) return null;
  try { return format(parseISO(fecha), "d MMM yyyy", { locale: es }); }
  catch { return fecha; }
};

interface ChecklistRecord {
  id: string; titulo?: string; inspector?: string; fecha?: string;
  territorio?: string; colegio?: string; material?: string;
  overall_status?: string; created_at?: string;
}

export default function Checklists() {
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [search,     setSearch]     = useState('');
  const [filterTerr, setFilterTerr] = useState('');
  const [filterCol,  setFilterCol]  = useState('');
  const [filterMat,  setFilterMat]  = useState('');
  const [formOpen,   setFormOpen]   = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn:  () => db.Checklist.list('-created_at', 500),
  });

  const checklists = useMemo(() => (data ?? []) as unknown as ChecklistRecord[], [data]);

  const colegiosFiltrados = useMemo(() =>
    filterTerr ? COLEGIOS.filter(c => c.territorio === filterTerr) : COLEGIOS, [filterTerr]);

  const filtered = useMemo(() => {
    let list = checklists;
    if (search)     list = list.filter(c => (c.titulo ?? '').toLowerCase().includes(search.toLowerCase()));
    if (filterTerr) list = list.filter(c => c.territorio === filterTerr);
    if (filterCol)  list = list.filter(c => c.colegio === filterCol);
    if (filterMat)  list = list.filter(c => c.material === filterMat);
    return list;
  }, [checklists, search, filterTerr, filterCol, filterMat]);

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => db.Checklist.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['checklists'] }); setFormOpen(false); toast.success('Inspección creada'); },
    onError:    () => toast.error('Error al crear la inspección'),
  });

  const selectClass = "px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700 focus:ring-2 focus:ring-slate-900 focus:outline-none";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Checklists de Inspección"
        subtitle="Validación visual de infraestructuras"
        action={
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nueva Inspección
          </button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mt-6 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="Buscar inspección..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className={selectClass} value={filterTerr} onChange={e => { setFilterTerr(e.target.value); setFilterCol(''); }}>
          <option value="">Todos los Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filterCol} onChange={e => setFilterCol(e.target.value)}>
          <option value="">Todos los Colegios</option>
          {colegiosFiltrados.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
        </select>
        <select className={selectClass} value={filterMat} onChange={e => setFilterMat(e.target.value)}>
          <option value="">Todos los Materiales</option>
          {MATERIALES.map(m => <option key={m} value={m}>{abreviarMaterial(m)}</option>)}
        </select>
        <span className="text-sm text-slate-500 font-medium">
          {filtered.length} {filtered.length === 1 ? 'inspección' : 'inspecciones'}
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No hay inspecciones" description="Crea tu primera inspección con el botón Nueva Inspección" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/checklists/${c.id}`)}
              className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <StatusBadge status={c.overall_status} />
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-500">{c.colegio}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {c.material ? abreviarMaterial(c.material) : ''}
                  </p>
                </div>
              </div>
              <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                {c.titulo ?? 'Sin título'}
              </p>
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100 mt-auto">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {c.inspector || 'Sin inspector'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatFecha(c.fecha ?? c.created_at) ?? '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ChecklistForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={d => createMutation.mutate(d)}
      />
    </div>
  );
}
