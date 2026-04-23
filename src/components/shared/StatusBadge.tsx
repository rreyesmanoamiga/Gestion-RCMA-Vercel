import { cn } from '@/lib/utils';

// Fuera del componente — se definen una sola vez
const STATUS_CONFIGS: Record<string, { label: string; class: string }> = {
  // Estados activos de proyecto
  no_iniciado:       { label: 'No Se Ha Iniciado',    class: 'bg-slate-100  text-slate-600  border-slate-200'     },
  en_curso:          { label: 'En Curso',             class: 'bg-lime-100   text-lime-700   border-lime-200'      },
  necesita_revision: { label: 'Necesita Revisión',    class: 'bg-yellow-100 text-yellow-700 border-yellow-200'    },
  aprobado:          { label: 'Aprobado',             class: 'bg-cyan-100   text-cyan-700   border-cyan-200'      },
  atrasado:          { label: 'Atrasado',             class: 'bg-sky-100    text-sky-700    border-sky-200'       },
  en_espera:         { label: 'En Espera',            class: 'bg-blue-100   text-blue-600   border-blue-200'      },
  en_proceso_cierre: { label: 'En Proceso de Cierre', class: 'bg-yellow-200 text-yellow-800 border-yellow-300'    },

  // Estados legado
  planificado:       { label: 'Planificado',          class: 'bg-blue-100   text-blue-700   border-blue-200'      },
  en_progreso:       { label: 'En Progreso',          class: 'bg-amber-100  text-amber-700  border-amber-200'     },
  completado:        { label: 'Completado',           class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pausado:           { label: 'Pausado',              class: 'bg-slate-100  text-slate-600  border-slate-200'     },
  pendiente:         { label: 'Pendiente',            class: 'bg-orange-100 text-orange-700 border-orange-200'    },

  // Estados de checklist
  bueno:             { label: 'Bueno',                class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  regular:           { label: 'Regular',              class: 'bg-amber-100  text-amber-700  border-amber-200'     },
  malo:              { label: 'Malo',                 class: 'bg-red-100    text-red-700    border-red-200'       },
  critico:           { label: 'Crítico',              class: 'bg-red-200    text-red-800    border-red-300'       },

  // Estados de mantenimiento
  preventivo:        { label: 'Preventivo',           class: 'bg-blue-100   text-blue-700   border-blue-200'      },
  correctivo:        { label: 'Correctivo',           class: 'bg-orange-100 text-orange-700 border-orange-200'    },

  // Estados de reporte
  borrador:          { label: 'Borrador',             class: 'bg-slate-100  text-slate-600  border-slate-200'     },
  finalizado:        { label: 'Finalizado',           class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const FALLBACK_CLASS = 'bg-slate-50 text-slate-400 border-slate-200';

interface StatusBadgeProps {
  status?: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = status ? STATUS_CONFIGS[status] : undefined;

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors',
      config?.class ?? FALLBACK_CLASS
    )}>
      {config?.label ?? status}
    </span>
  );
}