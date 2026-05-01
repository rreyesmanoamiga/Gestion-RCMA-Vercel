import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, MapPin, Calendar, User, ChevronDown, TicketCheck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import ProjectForm from '@/components/projects/ProjectForm';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

const PAGE_SIZE   = 20;
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

interface Ticket {
  id:           string;
  folio?:       string;
  proyecto_id?: string | null;
}

interface Project {
  id:             string;
  name?:          string;
  status?:        string;
  priority?:      string;
  type?:          string;
  colegio?:       string;
  territorio?:    string;
  location?:      string;
  responsible?:   string;
  start_date?:    string;
  description?:   string;
  progress?:      number;
  folio?:         string;
  tipo_proyecto?: string;
  budget?:        number | null;
}

export default function Projects() {
  const [showForm, setShowForm]                 = useState(false);
  const [filterStatuses, setFilterStatuses]         = useState<Set<string>>(new Set());
  const [filterTipoProyecto, setFilterTipoProyecto] = useState('all');
  const [filterTerritorio, setFilterTerritorio]     = useState('all');
  const [filterColegio, setFilterColegio]           = useState('all');
  const [visibleCount, setVisibleCount]         = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const { data: rawProjects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets-vinculados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, folio, proyecto_id')
        .not('proyecto_id', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const projects = rawProjects as unknown as Project[];
  const tickets  = rawTickets  as unknown as Ticket[];

  // Mapa proyecto_id → ticket (para buscar rápido en cada tarjeta)
  const ticketByProject = useMemo(() => {
    const map: Record<string, Ticket> = {};
    tickets.forEach(t => { if (t.proyecto_id) map[t.proyecto_id] = t; });
    return map;
  }, [tickets]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => db.Project.create(data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
      if (result?._offline) {
        toast.warning('📶 Sin conexión — Proyecto guardado localmente, se sincronizará cuando haya internet');
      } else {
        toast.success('Proyecto creado correctamente');
      }
    },
    onError: () => {
      toast.error('Error al crear el proyecto');
    },
  });

  const colegiosPorTerritorio = useMemo(() =>
    filterTerritorio !== 'all'
      ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
      : COLEGIOS,
    [filterTerritorio]
  );

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setVisibleCount(PAGE_SIZE);
    };

  const filtered = useMemo(() =>
    projects.filter(p => {
      if (filterStatuses.size > 0 && !filterStatuses.has(p.status ?? '')) return false;
      if (filterTipoProyecto !== 'all' && p.tipo_proyecto !== filterTipoProyecto) return false;
      if (filterTerritorio   !== 'all' && p.territorio    !== filterTerritorio)   return false;
      if (filterColegio      !== 'all' && p.colegio       !== filterColegio)      return false;
      return true;
    }),
    [projects, filterStatuses, filterTipoProyecto, filterTerritorio, filterColegio]
  );

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const kpis = useMemo(() => ({
    total:        projects.length,
    conTicket:    projects.filter(p => p.folio && p.folio.startsWith('TCMM')).length,
    sinTicket:    projects.filter(p => !p.folio || !p.folio.startsWith('TCMM')).length,
    completados:  projects.filter(p => p.status === 'completado').length,
    presupuesto:  projects.reduce((sum, p) => sum + (p.budget ?? 0), 0),
  }), [projects]);

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
        title="Proyectos"
        subtitle="Gestión de proyectos de construcción y mantenimiento"
        actionLabel="Nuevo Proyecto"
        onAction={() => setShowForm(true)}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Proyectos', value: kpis.total,       color: 'text-slate-900'   },
          { label: 'Con Ticket',      value: kpis.conTicket,   color: 'text-red-500'     },
          { label: 'Sin Ticket',      value: kpis.sinTicket,   color: 'text-slate-400'   },
          { label: 'Completados',     value: kpis.completados, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Presupuesto Total</p>
          <p className="text-lg font-black text-blue-600">
            {kpis.presupuesto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className={selectClass}
          value={filterTerritorio}
          onChange={e => {
            handleFilterChange(setFilterTerritorio)(e);
            setFilterColegio('all');
          }}
        >
          <option value="all">Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className={selectClass}
          value={filterColegio}
          onChange={handleFilterChange(setFilterColegio)}
        >
          <option value="all">Colegios</option>
          {colegiosPorTerritorio.map(c => (
            <option key={c.colegio} value={c.colegio}>{c.colegio}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filterTipoProyecto}
          onChange={handleFilterChange(setFilterTipoProyecto)}
        >
          <option value="all">Todos los tipos</option>
          {['MEJORA','CONSTRUCCIÓN','REMODELACIÓN','ADECUACIÓN','MANTENIMIENTO','PORTAFOLIO','GARANTÍAS','REVISIÓN'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2 items-center">
          {[
            { value: 'en_espera',   label: 'En Espera',   color: 'bg-slate-100 text-slate-600 border-slate-300' },
            { value: 'en_proceso',  label: 'En Proceso',  color: 'bg-blue-50 text-blue-700 border-blue-200'     },
            { value: 'en_progreso', label: 'En Progreso', color: 'bg-blue-50 text-blue-700 border-blue-200'     },
            { value: 'pausado',     label: 'Pausado',     color: 'bg-amber-50 text-amber-700 border-amber-200'  },
            { value: 'cancelado',   label: 'Cancelado',   color: 'bg-red-50 text-red-700 border-red-200'        },
            { value: 'completado',  label: 'Completado',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          ].map(({ value, label, color }) => {
            const active = filterStatuses.has(value);
            return (
              <button
                key={value}
                onClick={() => {
                  setFilterStatuses(prev => {
                    const next = new Set(prev);
                    active ? next.delete(value) : next.add(value);
                    return next;
                  });
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  active ? color + ' ring-2 ring-offset-1 ring-current' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            );
          })}
          {filterStatuses.size > 0 && (
            <button
              onClick={() => { setFilterStatuses(new Set()); setVisibleCount(PAGE_SIZE); }}
              className="px-3 py-1.5 rounded-full text-xs font-bold border bg-slate-900 text-white border-slate-900 hover:bg-slate-700 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} proyecto{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No hay proyectos"
          description="Crea tu primer proyecto para comenzar a gestionar tus obras y mantenimientos."
          actionLabel="Crear Proyecto"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(project => (
              <Link
                key={project.id}
                to={`/proyectos/${project.id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all duration-300 group flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={project.status} />
                    <PriorityBadge priority={project.priority} />
                    {project.tipo_proyecto && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                        {project.tipo_proyecto}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {project.folio && (
                      <p className="text-xs font-black text-red-500">{project.folio}</p>
                    )}
                    {!project.folio && (
                      <p className="text-[10px] font-bold text-slate-300">Sin Ticket</p>
                    )}
                    {project.colegio    && <p className="text-xs font-bold text-slate-800">{project.colegio}</p>}
                    {project.territorio && <p className="text-[10px] text-slate-400 font-medium uppercase">{project.territorio}</p>}
                  </div>
                </div>

                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors leading-tight">
                  {project.name}
                </h3>

                {project.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4 h-8 italic">
                    {project.description}
                  </p>
                )}

                {project.progress !== undefined && (
                  <div className="mb-4 mt-auto">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">
                      <span>Avance de obra</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-slate-800 h-full transition-all duration-500"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-400 border-t border-slate-50 pt-3 uppercase font-semibold">
                  {project.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-300" />{project.location}
                    </span>
                  )}
                  {project.responsible && (
                    <span className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-slate-300" />{project.responsible}
                    </span>
                  )}
                  {project.start_date && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-300" />
                      {format(new Date(project.start_date), 'dd MMM', { locale: es })}
                    </span>
                  )}
                  {ticketByProject[project.id] && (
                    <span className="flex items-center gap-1.5 text-blue-500 font-bold normal-case">
                      <TicketCheck className="w-3 h-3" />
                      {ticketByProject[project.id].folio}
                    </span>
                  )}
                </div>
              </Link>
            ))}
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
                Mostrando {visible.length} de {filtered.length} proyectos
              </p>
            </div>
          )}
        </>
      )}

      <ProjectForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={(data: Record<string, unknown>) => createMutation.mutate(data)}
      />
    </div>
  );
}
