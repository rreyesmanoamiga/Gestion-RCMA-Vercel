export const PERMISSIONS = {
  ver_proyectos: 'Ver Proyectos',
  crear_proyectos: 'Crear Proyectos',
  editar_proyectos: 'Editar Proyectos',
  eliminar_proyectos: 'Eliminar Proyectos',
  ver_checklists: 'Ver Checklists',
  crear_checklists: 'Crear Checklists',
  editar_checklists: 'Editar Checklists',
  eliminar_checklists: 'Eliminar Checklists',
  ver_mantenimiento: 'Ver Mantenimiento',
  crear_mantenimiento: 'Crear Mantenimiento',
  editar_mantenimiento: 'Editar Mantenimiento',
  eliminar_mantenimiento: 'Eliminar Mantenimiento',
  ver_reportes: 'Ver Reportes',
  crear_reportes: 'Crear Reportes',
  eliminar_reportes: 'Eliminar Reportes',
};

export const PERMISSION_GROUPS = [
  {
    label: 'Proyectos',
    permissions: ['ver_proyectos', 'crear_proyectos', 'editar_proyectos', 'eliminar_proyectos'],
  },
  {
    label: 'Checklists',
    permissions: ['ver_checklists', 'crear_checklists', 'editar_checklists', 'eliminar_checklists'],
  },
  {
    label: 'Mantenimiento',
    permissions: ['ver_mantenimiento', 'crear_mantenimiento', 'editar_mantenimiento', 'eliminar_mantenimiento'],
  },
  {
    label: 'Reportes',
    permissions: ['ver_reportes', 'crear_reportes', 'eliminar_reportes'],
  },
];

export const DEFAULT_PERMISSIONS = {
  ver_proyectos: true,
  crear_proyectos: false,
  editar_proyectos: false,
  eliminar_proyectos: false,
  ver_checklists: true,
  crear_checklists: false,
  editar_checklists: false,
  eliminar_checklists: false,
  ver_mantenimiento: true,
  crear_mantenimiento: false,
  editar_mantenimiento: false,
  eliminar_mantenimiento: false,
  ver_reportes: true,
  crear_reportes: false,
  eliminar_reportes: false,
};