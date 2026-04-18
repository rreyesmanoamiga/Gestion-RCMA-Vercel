import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/shared/StatusBadge';
import ChecklistForm from '@/components/checklists/ChecklistForm';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const conditionColors = {
  bueno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  regular: 'bg-amber-100 text-amber-700 border-amber-200',
  malo: 'bg-red-100 text-red-700 border-red-200',
  critico: 'bg-red-200 text-red-800 border-red-300',
};

export default function ChecklistDetail() {
  const checklistId = window.location.pathname.split('/').pop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const checklist = checklists.find(c => c.id === checklistId);

  const updateMutation = useMutation({
    mutationFn: (data) => db.Checklist.update(checklistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Checklist.delete(checklistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      navigate('/checklists');
    },
  });

  if (!checklist) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const projectName = projects.find(p => p.id === checklist.project_id)?.name;

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/checklists" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver a Checklists
      </Link>

      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={checklist.overall_status} />
              <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                {checklist.infrastructure_type === 'concreto' ? 'Concreto' : 'Metálica'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-foreground">{checklist.title}</h1>
            {projectName && <p className="text-sm text-muted-foreground">Proyecto: {projectName}</p>}
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
                  <AlertDialogTitle>¿Eliminar checklist?</AlertDialogTitle>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {checklist.location && <div><span className="font-medium text-foreground">Ubicación:</span> {checklist.location}</div>}
          {checklist.inspector && <div><span className="font-medium text-foreground">Inspector:</span> {checklist.inspector}</div>}
          {checklist.inspection_date && <div><span className="font-medium text-foreground">Fecha:</span> {format(new Date(checklist.inspection_date), 'dd MMM yyyy', { locale: es })}</div>}
        </div>

        {/* Items */}
        <div>
          <h2 className="font-semibold text-foreground mb-3">Elementos Inspeccionados</h2>
          <div className="space-y-2">
            {(checklist.items || []).map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <div className={cn('px-2 py-0.5 rounded text-xs font-medium border shrink-0 mt-0.5', conditionColors[item.condition])}>
                  {item.condition?.charAt(0).toUpperCase() + item.condition?.slice(1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.element}</p>
                  {item.observations && <p className="text-xs text-muted-foreground mt-0.5">{item.observations}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {checklist.general_observations && (
          <div>
            <h2 className="font-semibold text-foreground mb-2">Observaciones Generales</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{checklist.general_observations}</p>
          </div>
        )}

        {checklist.photos?.length > 0 && (
          <div>
            <h2 className="font-semibold text-foreground mb-3">Evidencia Fotográfica</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {checklist.photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <ChecklistForm open={editing} onClose={() => setEditing(false)} onSubmit={data => updateMutation.mutate(data)} checklist={checklist} projects={projects} />
    </div>
  );
}