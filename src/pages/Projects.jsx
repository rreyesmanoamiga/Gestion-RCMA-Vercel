import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, MapPin, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import ProjectForm from '@/components/projects/ProjectForm';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

// Fuera del componente — se define una sola vez
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

export default function Projects() {
  const [showForm, setShowForm]               = useState(false);
  const [filterStatus, setFilterStatus]       = useState('all');
  const [filterType, setFilterType]           = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio]     = useState('all');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500), // límite aumentado
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.Project.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  // Colegios filtrados por territorio — se recalcula solo cuando cambia el filtro
  const colegiosPorTerritorio = useMemo(() =>
    filterTerritorio !== 'all'
      ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
      : COLEGIOS,
    [filterTerritorio]
  );

  // Proyectos filtrados — se recalcula solo cuando cambian datos o filtros
  const filtered = useMemo(() =>
    projects.filter(p => {
      if (filterStatus    !== 'all' && p.status    !== filterStatus)    return false;
      if (filterType      !== 'all' && p.type      !== filterType)      return false;
      if (filterTerritorio !== 'all' && p.territorio !== filterTerritorio) return false;
      if (filterColegio   !== 'all' && p.colegio   !== filterColegio)   return false;
      return true;
    }),
    [projects, filterStatus, filterType, filterTerritorio, filterColegio]
  );

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

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className={selectClass}
          value={filterTerritorio}
          onChange={e => { setFilterTerritorio(e.target.value); setFilterColegio('all'); }}
        >
          <option value="all">Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className={selectClass}
          value={filterColegio}
          onChange={e => setFilterColegio(e.target.value)}
        >
          <option value="all">Colegios</option>
          {colegiosPorTerritorio.map(c => (
            <option key={c.colegio} value={c.colegio}>{c.colegio}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          <option value="construccion">Construcción</option>
          <option value="mantenimiento">Mantenimiento</option>
        </select>

        <select
          className={selectClass}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">Todos los estados</option>
          <option value="planificado">Planificado</option>
          <option value="en_progreso">En Progreso</option>
          <option value="completado">Completado</option>
          <option value="pausado">Pausado</option>
        </select>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => (
            <Link
              key={project.id}
              to={`/proyectos/${project.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all duration-300 group flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                </div>
                <div className="text-right shrink-0 ml-2">
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
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProjectForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={data => createMutation.mutate(data)}
      />
    </div>
  );
}