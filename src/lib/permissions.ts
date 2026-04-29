interface PermissionDef {
  key: string;
  label: string;
  group: string;
  default: boolean;
}

interface PermissionGroup {
  label: string;
  permissions: string[];
}

const PERMISSION_DEFS: PermissionDef[] = [
  { key: 'ver_proyectos',             label: 'Ver Proyectos',             group: 'Proyectos',             default: true  },
  { key: 'crear_proyectos',           label: 'Crear Proyectos',           group: 'Proyectos',             default: false },
  { key: 'editar_proyectos',          label: 'Editar Proyectos',          group: 'Proyectos',             default: false },
  { key: 'eliminar_proyectos',        label: 'Eliminar Proyectos',        group: 'Proyectos',             default: false },
  { key: 'ver_tickets',               label: 'Ver Tickets',               group: 'Tickets',               default: true  },
  { key: 'crear_tickets',             label: 'Crear Tickets',             group: 'Tickets',               default: false },
  { key: 'editar_tickets',            label: 'Editar Tickets',            group: 'Tickets',               default: false },
  { key: 'eliminar_tickets',          label: 'Eliminar Tickets',          group: 'Tickets',               default: false },
  { key: 'ver_anteproyectos',         label: 'Ver Anteproyectos',         group: 'Anteproyectos',         default: true  },
  { key: 'crear_anteproyectos',       label: 'Crear Anteproyectos',       group: 'Anteproyectos',         default: false },
  { key: 'editar_anteproyectos',      label: 'Editar Anteproyectos',      group: 'Anteproyectos',         default: false },
  { key: 'eliminar_anteproyectos',    label: 'Eliminar Anteproyectos',    group: 'Anteproyectos',         default: false },
  { key: 'ver_calendario',            label: 'Ver Calendario',            group: 'Calendario',            default: true  },
  { key: 'crear_calendario',          label: 'Crear Eventos',             group: 'Calendario',            default: false },
  { key: 'editar_calendario',         label: 'Editar Eventos',            group: 'Calendario',            default: false },
  { key: 'eliminar_calendario',       label: 'Eliminar Eventos',          group: 'Calendario',            default: false },
  { key: 'ver_pendientes',            label: 'Ver Pendientes',            group: 'Pendientes',            default: true  },
  { key: 'crear_pendientes',          label: 'Crear Pendientes',          group: 'Pendientes',            default: false },
  { key: 'editar_pendientes',         label: 'Editar Pendientes',         group: 'Pendientes',            default: false },
  { key: 'eliminar_pendientes',       label: 'Eliminar Pendientes',       group: 'Pendientes',            default: false },
  { key: 'ver_solicitud_proyecto',    label: 'Ver Solicitud de Proyecto', group: 'Solicitud de Proyecto', default: true  },
  { key: 'enviar_solicitud_proyecto', label: 'Enviar Solicitud',          group: 'Solicitud de Proyecto', default: true  },
  { key: 'ver_reportes',              label: 'Ver Reportes',              group: 'Reportes',              default: true  },
  { key: 'crear_reportes',            label: 'Crear Reportes',            group: 'Reportes',              default: false },
  { key: 'editar_reportes',           label: 'Editar Reportes',           group: 'Reportes',              default: false },
  { key: 'eliminar_reportes',         label: 'Eliminar Reportes',         group: 'Reportes',              default: false },
];

export const PERMISSIONS: Record<string, string> = Object.fromEntries(
  PERMISSION_DEFS.map(({ key, label }) => [key, label])
);

export const PERMISSION_GROUPS: PermissionGroup[] = Object.values(
  PERMISSION_DEFS.reduce(
    (groups: Record<string, PermissionGroup>, { key, group }) => {
      if (!groups[group]) groups[group] = { label: group, permissions: [] };
      groups[group].permissions.push(key);
      return groups;
    },
    {}
  )
);

export const DEFAULT_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_DEFS.map(({ key, default: val }) => [key, val])
);

export const hasPermission = (
  userPermissions: Record<string, boolean> | null | undefined,
  key: string
): boolean => userPermissions?.[key] === true;