import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const priorityStyles = {
  baja: 'bg-slate-100 text-slate-600 border-slate-200',
  media: 'bg-blue-100 text-blue-700 border-blue-200',
  alta: 'bg-orange-100 text-orange-700 border-orange-200',
  urgente: 'bg-red-100 text-red-700 border-red-200',
};

const priorityLabels = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

export default function PriorityBadge({ priority }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-medium border', priorityStyles[priority] || 'bg-muted text-muted-foreground')}>
      {priorityLabels[priority] || priority}
    </Badge>
  );
}