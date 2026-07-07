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
  { key: 'ver_dashboard',             label: 'Ver Dashboard',             group: 'Dashboard',             default: true  },
  { key: 'ver_proyectos',             label: 'Ver Proyectos',             group: 'Proyectos',             default: true  },
  { key: 'crear_proyectos',           label: 'Crear Proyectos',           group: 'Proyectos',             default: false },
  { key: 'editar_proyectos',          label: 'Editar Proyectos',          group: 'Proyectos',             default: false },
  { key: 'eliminar_proyectos',        label: 'Eliminar Proyectos',        group: 'Proyectos',             default: false },
  { key: 'ver_tickets',               label: 'Ver Tickets',               group: 'Tickets',               default: true  },
  { key: 'crear_tickets',             label: 'Crear Tickets',             group: 'Tickets',               default: false },
  { key: 'editar_tickets',            label: 'Editar Tickets',            group: 'Tickets',               default: false },
  { key: 'eliminar_tickets',          label: 'Eliminar Tickets',          group: 'Tickets',               default: false },
  { key: 'ver_ticket_mas',            label: 'Ver Ticket MAS',            group: 'Ticket MAS',            default: false },
  { key: 'enviar_ticket_mas',         label: 'Enviar Ticket MAS',         group: 'Ticket MAS',            default: false },
  { key: 'autorizar_ticket_mas',      label: 'Autorizar Ticket MAS',      group: 'Ticket MAS',            default: false },
  { key: 'cancelar_ticket_mas',       label: 'Cancelar Ticket MAS',       group: 'Ticket MAS',            default: false },
  { key: 'ver_anteproyectos',         label: 'Ver Anteproyectos',         group: 'Anteproyectos',         default: true  },
  { key: 'crear_anteproyectos',       label: 'Crear Anteproyectos',       group: 'Anteproyectos',         default: false },
  { key: 'editar_anteproyectos',      label: 'Editar Anteproyectos',      group: 'Anteproyectos',         default: false },
  { key: 'eliminar_anteproyectos',    label: 'Eliminar Anteproyectos',    group: 'Anteproyectos',         default: false },
  { key: 'ver_checklists',            label: 'Ver Checklists',            group: 'Checklists',            default: true  },
  { key: 'crear_checklists',          label: 'Crear Checklists',          group: 'Checklists',            default: false },
  { key: 'editar_checklists',         label: 'Editar Checklists',         group: 'Checklists',            default: false },
  { key: 'eliminar_checklists',       label: 'Eliminar Checklists',       group: 'Checklists',            default: false },
  { key: 'ver_calendario',            label: 'Ver Calendario',            group: 'Calendario',            default: true  },
  { key: 'crear_calendario',          label: 'Crear Eventos',             group: 'Calendario',            default: false },
  { key: 'editar_calendario',         label: 'Editar Eventos',            group: 'Calendario',            default: false },
  { key: 'eliminar_calendario',       label: 'Eliminar Eventos',          group: 'Calendario',            default: false },
  { key: 'ver_solicitud_proyecto',    label: 'Ver Solicitud de Proyecto', group: 'Solicitud de Proyecto', default: true  },
  { key: 'enviar_solicitud_proyecto', label: 'Enviar Solicitud',          group: 'Solicitud de Proyecto', default: true  },
  { key: 'ver_reportes',              label: 'Ver Reportes',              group: 'Reportes',              default: true  },
  { key: 'crear_reportes',            label: 'Crear Reportes',            group: 'Reportes',              default: false },
  { key: 'editar_reportes',           label: 'Editar Reportes',           group: 'Reportes',              default: false },
  { key: 'eliminar_reportes',         label: 'Eliminar Reportes',         group: 'Reportes',              default: false },
  { key: 'ver_insumos',               label: 'Ver Insumos',               group: 'Insumos',               default: false },
  { key: 'crear_insumos',             label: 'Crear/Editar Requisiciones', group: 'Insumos',              default: false },
  { key: 'vobo_insumos',              label: 'VoBo Insumos',              group: 'Insumos',               default: false },
  { key: 'eliminar_insumos',          label: 'Eliminar Requisiciones',    group: 'Insumos',               default: false },
  { key: 'ver_nexus',                 label: 'Ver NEXUS',                 group: 'NEXUS',                 default: false },
  { key: 'ver_levantamiento',         label: 'Ver Levantamiento Nacional',        group: 'Levantamiento Nacional', default: false },
  { key: 'descargar_levantamiento',   label: 'Descargar Reportes/PDFs',           group: 'Levantamiento Nacional', default: false },
  { key: 'crear_levantamiento',       label: 'Crear/Editar (Comunicados, Pagos, Planteles)', group: 'Levantamiento Nacional', default: false },
  { key: 'eliminar_levantamiento',    label: 'Eliminar Registros',                group: 'Levantamiento Nacional', default: false },
  { key: 'ver_minutas',               label: 'Ver Minutas de Reunión',            group: 'Minutas',               default: false },
  { key: 'crear_minutas',             label: 'Subir Minutas',                     group: 'Minutas',               default: false },
  { key: 'editar_minutas',            label: 'Editar Minutas',                    group: 'Minutas',               default: false },
  { key: 'eliminar_minutas',          label: 'Eliminar Minutas',                  group: 'Minutas',               default: false },
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