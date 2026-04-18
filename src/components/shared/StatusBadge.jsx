import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles = {
  // nuevos estados proyecto
  no_iniciado: 'bg-slate-100 text-slate-600 border-slate-200',
  en_curso: 'bg-lime-100 text-lime-700 border-lime-200',
  necesita_revision: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  aprobado: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  atrasado: 'bg-sky-100 text-sky-700 border-sky-200',
  en_espera: 'bg-blue-100 text-blue-600 border-blue-200',
  en_proceso_cierre: 'bg-yellow-200 text-yellow-800 border-yellow-300',
  // legado
  planificado: 'bg-blue-100 text-blue-700 border-blue-200',
  en_progreso: 'bg-amber-100 text-amber-700 border-amber-200',
  pausado: 'bg-slate-100 text-slate-600 border-slate-200',
  pendiente: 'bg-orange-100 text-orange-700 border-orange-200',
  bueno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  regular: 'bg-amber-100 text-amber-700 border-amber-200',
  malo: 'bg-red-100 text-red-700 border-red-200',
  critico: 'bg-red-200 text-red-800 border-red-300',
  preventivo: 'bg-blue-100 text-blue-700 border-blue-200',
  correctivo: 'bg-orange-100 text-orange-700 border-orange-200',
  borrador: 'bg-slate-100 text-slate-600 border-slate-200',
  finalizado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const statusLabels = {
  no_iniciado: 'No Se Ha Iniciado',
  en_curso: 'En Curso',
  necesita_revision: 'Necesita Revisión',
  aprobado: 'Aprobado',
  atrasado: 'Atrasado',
  en_espera: 'En Espera',
  en_proceso_cierre: 'En Proceso de Cierre',
  planificado: 'Planificado',
  en_progreso: 'En Progreso',
  completado: 'Completado',
  pausado: 'Pausado',
  pendiente: 'Pendiente',
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  critico: 'Crítico',
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  borrador: 'Borrador',
  finalizado: 'Finalizado',
};

export default function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-medium border', statusStyles[status] || 'bg-muted text-muted-foreground')}>
      {statusLabels[status] || status}
    </Badge>
  );
}