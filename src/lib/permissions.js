// Fuente única de verdad para todos los permisos.
// Para agregar un permiso nuevo: solo añade una línea aquí.
const PERMISSION_DEFS = [
  { key: 'ver_proyectos',          label: 'Ver Proyectos',          group: 'Proyectos',     default: true  },
  { key: 'crear_proyectos',        label: 'Crear Proyectos',        group: 'Proyectos',     default: false },
  { key: 'editar_proyectos',       label: 'Editar Proyectos',       group: 'Proyectos',     default: false },
  { key: 'eliminar_proyectos',     label: 'Eliminar Proyectos',     group: 'Proyectos',     default: false },

  { key: 'ver_checklists',         label: 'Ver Checklists',         group: 'Checklists',    default: true  },
  { key: 'crear_checklists',       label: 'Crear Checklists',       group: 'Checklists',    default: false },
  { key: 'editar_checklists',      label: 'Editar Checklists',      group: 'Checklists',    default: false },
  { key: 'eliminar_checklists',    label: 'Eliminar Checklists',    group: 'Checklists',    default: false },

  { key: 'ver_mantenimiento',      label: 'Ver Mantenimiento',      group: 'Mantenimiento', default: true  },
  { key: 'crear_mantenimiento',    label: 'Crear Mantenimiento',    group: 'Mantenimiento', default: false },
  { key: 'editar_mantenimiento',   label: 'Editar Mantenimiento',   group: 'Mantenimiento', default: false },
  { key: 'eliminar_mantenimiento', label: 'Eliminar Mantenimiento', group: 'Mantenimiento', default: false },

  { key: 'ver_reportes',           label: 'Ver Reportes',           group: 'Reportes',      default: true  },
  { key: 'crear_reportes',         label: 'Crear Reportes',         group: 'Reportes',      default: false },
  { key: 'editar_reportes',        label: 'Editar Reportes',        group: 'Reportes',      default: false }, // ← estaba ausente
  { key: 'eliminar_reportes',      label: 'Eliminar Reportes',      group: 'Reportes',      default: false },
];

// Mapa clave → label  (e.g. PERMISSIONS.ver_proyectos === 'Ver Proyectos')
export const PERMISSIONS = Object.fromEntries(
  PERMISSION_DEFS.map(({ key, label }) => [key, label])
);

// Permisos agrupados para renderizar la UI de administración
export const PERMISSION_GROUPS = Object.values(
  PERMISSION_DEFS.reduce((groups, { key, group }) => {
    if (!groups[group]) groups[group] = { label: group, permissions: [] };
    groups[group].permissions.push(key);
    return groups;
  }, {})
);

// Valores por default: solo lectura habilitada, escritura denegada
export const DEFAULT_PERMISSIONS = Object.fromEntries(
  PERMISSION_DEFS.map(({ key, default: val }) => [key, val])
);

/**
 * Verifica si un usuario tiene un permiso específico.
 * @param {Object} userPermissions - Objeto de permisos del usuario
 * @param {string} key - Clave del permiso a verificar
 * @returns {boolean}
 *
 * @example
 * const { permissions } = useAuth();
 * if (hasPermission(permissions, 'crear_proyectos')) { ... }
 */
export const hasPermission = (userPermissions, key) =>
  userPermissions?.[key] === true;