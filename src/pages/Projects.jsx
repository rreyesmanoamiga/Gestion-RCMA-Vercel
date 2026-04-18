import React, { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

export default function Projects() {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio] = useState('all');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.Project.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  const colegiosPorTerritorio = filterTerritorio !== 'all'
    ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
    : COLEGIOS;

  const filtered = projects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterType !== 'all' && p.type !== filterType) return false;
    if (filterTerritorio !== 'all' && p.territorio !== filterTerritorio) return false;
    if (filterColegio !== 'all' && p.colegio !== filterColegio) return false;
    return true;
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Proyectos" subtitle="Gestión de proyectos de construcción y mantenimiento" actionLabel="Nuevo Proyecto" onAction={() => setShowForm(true)} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={filterTerritorio} onValueChange={v => { setFilterTerritorio(v); setFilterColegio('all'); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Territorio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Territorios</SelectItem>
            {TERRITORIOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterColegio} onValueChange={setFilterColegio}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Colegio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Colegios</SelectItem>
            {colegiosPorTerritorio.map(c => <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="construccion">Construcción</SelectItem>
            <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="planificado">Planificado</SelectItem>
            <SelectItem value="en_progreso">En Progreso</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="pausado">Pausado</SelectItem>
          </SelectContent>
        </Select>
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
            <Link key={project.id} to={`/proyectos/${project.id}`} className="bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                </div>
                <div className="text-right shrink-0 ml-2">
                  {project.colegio && <p className="text-xs font-semibold text-primary">{project.colegio}</p>}
                  {project.territorio && <p className="text-[10px] text-muted-foreground">{project.territorio}</p>}
                </div>
              </div>
              <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{project.name}</h3>
              {project.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>}
              
              {project.progress > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Avance</span>
                    <span>{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-1.5" />
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {project.location && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.location}</span>
                )}
                {project.responsible && (
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{project.responsible}</span>
                )}
                {project.start_date && (
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(project.start_date), 'dd MMM', { locale: es })}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProjectForm open={showForm} onClose={() => setShowForm(false)} onSubmit={data => createMutation.mutate(data)} />
    </div>
  );
}