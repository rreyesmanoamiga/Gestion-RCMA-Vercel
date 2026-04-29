import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Search, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import ChecklistForm from '@/components/checklists/ChecklistForm';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

const PAGE_SIZE          = 20;
const filterControlClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none";

interface ChecklistItem {
  condition?: string;
}

interface Checklist {
  id:                  string;
  title?:              string;
  overall_status?:     string;
  infrastructure_type?: string;
  colegio?:            string;
  territorio?:         string;
  project_id?:         string;
  inspector?:          string;
  inspection_date?:    string;
  items?:              unknown;
}

function parseItems(raw: unknown): ChecklistItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ChecklistItem[];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

interface ChecklistWithCounts extends Checklist {
  itemCounts: { bueno: number; regular: number; malo: number; critico: number };
}

interface Project {
  id:   string;
  name?: string;
}

export default function Checklists() {
  const [showForm, setShowForm]                 = useState(false);
  const [search, setSearch]                     = useState('');
  const [filterType, setFilterType]             = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio]       = useState('all');
  const [visibleCount, setVisibleCount]         = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const { data: rawChecklists = [], isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 500),
  });

  const { data: rawProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const checklists = rawChecklists as unknown as Checklist[];
  const projects   = rawProjects   as unknown as Project[];

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => db.Checklist.create(data),
    onSuccess: (result: any) => {
      if (result?._offline) {
        queryClient.setQueryData(['checklists'], (old: any) => [result, ...(old ?? [])]);
        toast.warning('📶 Sin conexión — Inspección guardada localmente, se sincronizará cuando haya internet');
      } else {
        queryClient.invalidateQueries({ queryKey: ['checklists'] });
        toast.success('Inspección creada correctamente');
      }
      setShowForm(false);
    },
    onError: () => {
      toast.error('Error al crear la inspección');
    },
  });

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name ?? ''])),
    [projects]
  );

  const checklistsWithCounts = useMemo((): ChecklistWithCounts[] =>
    checklists.map(c => {
      const counts = { bueno: 0, regular: 0, malo: 0, critico: 0 };
      parseItems(c.items).forEach(item => {
        if (item.condition && item.condition in counts) {
          counts[item.condition as keyof typeof counts]++;
        }
      });
      return { ...c, itemCounts: counts };
    }),
    [checklists]
  );

  const colegiosPorTerritorio = useMemo(() =>
    filterTerritorio !== 'all'
      ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
      : COLEGIOS,
    [filterTerritorio]
  );

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (value: string) => {
      setter(value);
      setVisibleCount(PAGE_SIZE);
    };

  const filtered = useMemo((): ChecklistWithCounts[] =>
    checklistsWithCounts.filter(c => {
      if (filterType       !== 'all' && c.infrastructure_type !== filterType)       return false;
      if (filterTerritorio !== 'all' && c.territorio          !== filterTerritorio) return false;
      if (filterColegio    !== 'all' && c.colegio             !== filterColegio)    return false;
      if (search && !c.title?.toLowerCase().includes(search.toLowerCase()))         return false;
      return true;
    }),
    [checklistsWithCounts, filterType, filterTerritorio, filterColegio, search]
  );

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Checklists de Inspección"
        subtitle="Validación visual de infraestructuras"
        actionLabel="Nueva Inspección"
        onAction={() => setShowForm(true)}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className={`${filterControlClass} pl-9 w-64`}
            value={search}
            onChange={e => handleFilterChange(setSearch)(e.target.value)}
            placeholder="Buscar inspección..."
          />
        </div>

        <select
          className={filterControlClass}
          value={filterTerritorio}
          onChange={e => {
            handleFilterChange(setFilterTerritorio)(e.target.value);
            setFilterColegio('all');
          }}
        >
          <option value="all">Todos los Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className={filterControlClass}
          value={filterColegio}
          onChange={e => handleFilterChange(setFilterColegio)(e.target.value)}
        >
          <option value="all">Todos los Colegios</option>
          {colegiosPorTerritorio.map(c => (
            <option key={c.colegio} value={c.colegio}>{c.colegio}</option>
          ))}
        </select>

        <select
          className={filterControlClass}
          value={filterType}
          onChange={e => handleFilterChange(setFilterType)(e.target.value)}
        >
          <option value="all">Todas las Estructuras</option>
          <option value="concreto">Concreto</option>
          <option value="metalica">Metálica</option>
        </select>

        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} inspección{filtered.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No hay inspecciones"
          description="Crea tu primera inspección para validar el estado de tus infraestructuras."
          actionLabel="Nueva Inspección"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(checklist => {
              const { itemCounts } = checklist;
              return (
                <Link
                  key={checklist.id}
                  to={`/checklists/${checklist.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <StatusBadge status={checklist.overall_status} />
                    <div className="text-right shrink-0 ml-2">
                      {checklist.colegio && (
                        <p className="text-xs font-bold text-slate-800">{checklist.colegio}</p>
                      )}
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        {checklist.infrastructure_type === 'concreto' ? 'Concreto' : 'Metálica'}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {checklist.title}
                  </h3>

                  {checklist.project_id && (
                    <p className="text-xs text-slate-500 mb-2 truncate">
                      Proyecto: {projectMap[checklist.project_id] || ''}
                    </p>
                  )}

                  <div className="flex gap-2 mb-3">
                    {itemCounts.bueno   > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-bold">{itemCounts.bueno} OK</span>}
                    {itemCounts.regular > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded font-bold">{itemCounts.regular} !</span>}
                    {itemCounts.malo    > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-100 rounded font-bold">{itemCounts.malo} ✗</span>}
                    {itemCounts.critico > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded font-bold">{itemCounts.critico} ⚠</span>}
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-400 border-t pt-3 mt-auto uppercase font-medium">
                    <span>{checklist.inspector || 'Sin inspector'}</span>
                    <span>
                      {checklist.inspection_date
                        ? format(new Date(checklist.inspection_date), 'dd MMM yyyy', { locale: es })
                        : ''}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex flex-col items-center gap-2 mt-8">
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
              >
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
              </button>
              <p className="text-xs text-slate-400">
                Mostrando {visible.length} de {filtered.length} inspecciones
              </p>
            </div>
          )}
        </>
      )}

      <ChecklistForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={(data: Record<string, unknown>) => createMutation.mutate(data)}
        projects={projects}
      />
    </div>
  );
}
