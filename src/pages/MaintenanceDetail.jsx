import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, MapPin, Calendar, User, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function MaintenanceDetail() {
  const recordId = window.location.pathname.split('/').pop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const record = records.find(r => r.id === recordId);

  const updateMutation = useMutation({
    mutationFn: (data) => db.MaintenanceRecord.update(recordId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.MaintenanceRecord.delete(recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      navigate('/mantenimiento');
    },
  });

  if (!record) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const projectName = projects.find(p => p.id === record.project_id)?.name;

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/mantenimiento" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver a Mantenimiento
      </Link>

      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={record.type} />
              <StatusBadge status={record.status} />
              <PriorityBadge priority={record.priority} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{record.title}</h1>
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
                  <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
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

        {record.description && <p className="text-sm text-muted-foreground">{record.description}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {record.location && (
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" />{record.location}</div>
          )}
          {record.responsible && (
            <div className="flex items-center gap-2 text-muted-foreground"><User className="w-4 h-4" />{record.responsible}</div>
          )}
          {record.scheduled_date && (
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-4 h-4" />Prog: {format(new Date(record.scheduled_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
          {record.completed_date && (
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-4 h-4" />Comp: {format(new Date(record.completed_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
          {record.cost && (
            <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="w-4 h-4" />${Number(record.cost).toLocaleString()}</div>
          )}
          {record.next_maintenance_date && (
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-4 h-4" />Próx: {format(new Date(record.next_maintenance_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
        </div>

        {record.findings && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Hallazgos</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.findings}</p>
          </div>
        )}

        {record.actions_taken && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Acciones Realizadas</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.actions_taken}</p>
          </div>
        )}

        {record.materials_used && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Materiales Usados</h3>
            <p className="text-sm text-muted-foreground">{record.materials_used}</p>
          </div>
        )}

        {/* Photos */}
        {record.photos_before?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Fotos Antes</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {record.photos_before.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {record.photos_after?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Fotos Después</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {record.photos_after.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {record.notes && (
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-foreground mb-1">Notas</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.notes}</p>
          </div>
        )}
      </div>

      <MaintenanceForm open={editing} onClose={() => setEditing(false)} onSubmit={data => updateMutation.mutate(data)} record={record} projects={projects} />
    </div>
  );
}