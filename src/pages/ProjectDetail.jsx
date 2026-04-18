import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import ProjectForm from '@/components/projects/ProjectForm';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';

export default function ProjectDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = window.location.pathname.split('/').pop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const project = projects.find(p => p.id === projectId);

  const updateMutation = useMutation({
    mutationFn: (data) => db.Project.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/proyectos');
    },
  });

  if (!project) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/proyectos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
      </Link>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 bg-muted rounded-md">
              {project.type === 'construccion' ? 'Construcción' : 'Mantenimiento'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <h1 className="text-xl font-bold text-foreground mb-2">{project.name}</h1>
        {project.description && <p className="text-sm text-muted-foreground mb-4">{project.description}</p>}

        {project.progress > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Avance del proyecto</span>
              <span className="font-semibold">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          {project.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" /> <span>{project.location}</span>
            </div>
          )}
          {project.responsible && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" /> <span>{project.responsible}</span>
            </div>
          )}
          {project.start_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" /> <span>Inicio: {format(new Date(project.start_date), 'dd MMM yyyy', { locale: es })}</span>
            </div>
          )}
          {project.end_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" /> <span>Fin: {format(new Date(project.end_date), 'dd MMM yyyy', { locale: es })}</span>
            </div>
          )}
          {project.budget && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="w-4 h-4" /> <span>${Number(project.budget).toLocaleString()}</span>
            </div>
          )}
        </div>

        {project.notes && (
          <div className="mt-5 pt-5 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-1">Notas</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.notes}</p>
          </div>
        )}
      </div>

      <ProjectForm open={editing} onClose={() => setEditing(false)} onSubmit={data => updateMutation.mutate(data)} project={project} />
    </div>
  );
}