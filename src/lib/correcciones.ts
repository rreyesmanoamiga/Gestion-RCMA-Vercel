// Corrección de solicitudes por la Coordinación RCMA.
//
// Regla: solo la cuenta de la Coordinación (rreyes) corrige, solo mientras la
// solicitud no esté autorizada / cancelada, con motivo obligatorio. Cada
// corrección queda en la bitácora de Auditoría (accion "editar",
// detalle.tipo = "Corrección") con el antes y el después de cada campo.
import type { AuditModulo } from '@/lib/audit';

export const CORRECCION_EMAIL = 'rreyes@manoamiga.edu.mx';
export const TIPO_CORRECCION = 'Corrección';
export const MOTIVO_MIN = 10;

export type TipoCampo = 'texto' | 'textarea' | 'moneda' | 'fecha' | 'select';

export interface CampoCorreccion {
  key: string;
  label: string;
  tipo: TipoCampo;
  grupo: string;
  opciones?: string[];
  ancho?: 'completo';
  /** Solo se muestra si la condición se cumple con los valores actuales */
  visible?: (v: Valores) => boolean;
}

export type Valores = Record<string, string>;

export interface ConfigCorreccion {
  tabla: string;
  modulo: AuditModulo;
  titulo: string;
  campos: CampoCorreccion[];
  /** Error que impide guardar (null = válido) */
  validar?: (v: Valores) => string | null;
  /** Aviso que no impide guardar */
  avisar?: (v: Valores) => string | null;
  /** Ajusta campos dependientes cuando cambia uno (ej. Suplemento → Traspaso) */
  derivar?: (key: string, v: Valores) => Valores;
}

export interface CambioCorreccion { campo: string; antes: string; despues: string }

const num = (s: string) => (s.trim() === '' ? 0 : Number(s) || 0);
export const fmtMXN = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// ── Plan de financiamiento (Solicitud de Proyecto y Solicitud CN) ──────────
function financiamiento(costoKey: string, costoLabel: string): CampoCorreccion[] {
  const g = 'Plan de financiamiento';
  return [
    { key: costoKey, label: costoLabel, tipo: 'moneda', grupo: g },
    { key: 'monto_operacion', label: 'Operación', tipo: 'moneda', grupo: g },
    { key: 'monto_fbc', label: 'FBC (Fondo Bajo Custodia)', tipo: 'moneda', grupo: g },
    { key: 'monto_donativos', label: 'Donativos', tipo: 'moneda', grupo: g },
    { key: 'monto_otras', label: 'Otras fuentes', tipo: 'moneda', grupo: g },
    { key: 'monto_otras_detalle', label: '¿A qué se refiere? (otras fuentes)', tipo: 'texto', grupo: g, ancho: 'completo', visible: v => num(v.monto_otras) > 0 },
  ];
}
const validarOtras = (v: Valores) =>
  num(v.monto_otras) > 0 && !(v.monto_otras_detalle ?? '').trim() ? 'Hay monto en "Otras fuentes": especifica a qué se refiere.' : null;
const avisarTotal = (costoKey: string) => (v: Valores) => {
  const costo = num(v[costoKey]);
  const total = num(v.monto_operacion) + num(v.monto_fbc) + num(v.monto_donativos) + num(v.monto_otras);
  return costo > 0 && Math.abs(total - costo) > 1
    ? `El total del financiamiento (${fmtMXN(total)}) no es igual al costo (${fmtMXN(costo)}). Diferencia: ${fmtMXN(total - costo)}.`
    : null;
};

const TIPOS_PROYECTO = ['CONSTRUCCIÓN NUEVA', 'MEJORA', 'PORTAFOLIO', 'REMODELACIÓN', 'ADECUACIÓN DE ESPACIO', 'GARANTÍAS', 'AMPLIACIÓN', 'MANTENIMIENTO EXTRAORDINARIO', 'REVISIÓN'];
const CLASIFICACIONES = ['CONSTRUCCION NUEVA', 'REMODELACION', 'AMPLIACION', 'ADECUACION', 'MEJORA', 'MANTENIMIENTO ORDINARIO', 'MANTENIMIENTO EXTRAORDINARIO', 'PORTAFOLIO', 'GARANTIAS', 'REVISION'];
const SI_NO = ['SI', 'NO'];

function cotizaciones(g = 'Cotizaciones y financiamiento'): CampoCorreccion[] {
  return [
    { key: 'cot1_proveedor', label: 'Cotización 1 · proveedor', tipo: 'texto', grupo: g },
    { key: 'cot1_importe', label: 'Cotización 1 · importe', tipo: 'moneda', grupo: g },
    { key: 'cot2_proveedor', label: 'Cotización 2 · proveedor', tipo: 'texto', grupo: g },
    { key: 'cot2_importe', label: 'Cotización 2 · importe', tipo: 'moneda', grupo: g },
    { key: 'cot3_proveedor', label: 'Cotización 3 · proveedor', tipo: 'texto', grupo: g },
    { key: 'cot3_importe', label: 'Cotización 3 · importe', tipo: 'moneda', grupo: g },
    { key: 'motivo_seleccion', label: 'Motivo de selección', tipo: 'textarea', grupo: g, ancho: 'completo' },
    { key: 'forma_financiamiento', label: 'Forma de financiamiento', tipo: 'texto', grupo: g, ancho: 'completo' },
  ];
}

export const CORRECCION_SOLICITUD: ConfigCorreccion = {
  tabla: 'solicitudes',
  modulo: 'solicitudes',
  titulo: 'Solicitud de Proyecto',
  campos: [
    { key: 'nombre_proyecto', label: 'Nombre del proyecto', tipo: 'texto', grupo: 'Proyecto', ancho: 'completo' },
    { key: 'tipo_iniciativa', label: 'Tipo de iniciativa', tipo: 'select', grupo: 'Proyecto', opciones: TIPOS_PROYECTO },
    { key: 'ciclo_año_fiscal', label: 'Ciclo / año fiscal', tipo: 'texto', grupo: 'Proyecto' },
    { key: 'resumen_proyecto', label: 'Resumen / justificación', tipo: 'textarea', grupo: 'Proyecto', ancho: 'completo' },
    { key: 'fecha_inicio_propuesta', label: 'Fecha propuesta de inicio', tipo: 'fecha', grupo: 'Proyecto' },
    { key: 'fecha_fin_propuesta', label: 'Fecha propuesta de conclusión', tipo: 'fecha', grupo: 'Proyecto' },
    ...financiamiento('costo_aproximado', 'Costo aproximado total'),
  ],
  validar: validarOtras,
  avisar: avisarTotal('costo_aproximado'),
};

export const CORRECCION_SOLICITUD_CN: ConfigCorreccion = {
  tabla: 'compliance_solicitudes_cn',
  modulo: 'solicitudes_cn',
  titulo: 'Solicitud CN',
  campos: [
    { key: 'especificacion', label: 'Especificación del trámite', tipo: 'texto', grupo: 'Trámite', ancho: 'completo' },
    { key: 'descripcion', label: 'Descripción', tipo: 'textarea', grupo: 'Trámite', ancho: 'completo' },
    { key: 'fecha_requerida', label: 'Fecha requerida', tipo: 'fecha', grupo: 'Trámite' },
    ...financiamiento('costo_estimado', 'Costo estimado'),
  ],
  validar: validarOtras,
  avisar: avisarTotal('costo_estimado'),
};

export const CORRECCION_TICKET_MAS: ConfigCorreccion = {
  tabla: 'tickets_mas',
  modulo: 'tickets_mas',
  titulo: 'Ticket MAS',
  campos: [
    { key: 'nombre_proyecto', label: 'Nombre del proyecto', tipo: 'texto', grupo: 'Datos del ticket', ancho: 'completo' },
    { key: 'clasificacion', label: 'Clasificación', tipo: 'select', grupo: 'Datos del ticket', opciones: CLASIFICACIONES },
    { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', grupo: 'Datos del ticket', opciones: ['URGENTE', 'NORMAL'] },
    { key: 'tipo_mantenimiento', label: 'Tipo de mantenimiento', tipo: 'select', grupo: 'Datos del ticket', opciones: ['PREVENTIVO', 'CORRECTIVO'] },
    { key: 'numero_activo', label: 'Número de activo', tipo: 'texto', grupo: 'Datos del ticket' },
    { key: 'orden_interna', label: 'Orden interna', tipo: 'select', grupo: 'Datos del ticket', opciones: SI_NO },
    { key: 'numero_orden_interna', label: 'Número de orden interna', tipo: 'texto', grupo: 'Datos del ticket' },
    { key: 'descripcion', label: 'Descripción', tipo: 'textarea', grupo: 'Datos del ticket', ancho: 'completo' },
    ...cotizaciones(),
    { key: 'elaborar_suplemento', label: 'Elaborar suplemento', tipo: 'select', grupo: 'Cotizaciones y financiamiento', opciones: SI_NO },
    { key: 'elaborar_traspaso', label: 'Elaborar traspaso', tipo: 'select', grupo: 'Cotizaciones y financiamiento', opciones: SI_NO },
  ],
  validar: v => {
    const n = (v.numero_orden_interna ?? '').trim();
    return v.orden_interna === 'SI' && (!n || n === 'N/A') ? 'Con orden interna "SI" se necesita el número de orden interna.' : null;
  },
  // Mismas reglas que el formulario del colegio
  derivar: (key, v) => {
    if (key === 'elaborar_suplemento') return { ...v, elaborar_traspaso: v.elaborar_suplemento === 'NO' ? 'SI' : 'NO' };
    if (key === 'orden_interna' && v.orden_interna === 'NO') return { ...v, numero_orden_interna: 'N/A' };
    if (key === 'orden_interna' && v.orden_interna === 'SI' && v.numero_orden_interna === 'N/A') return { ...v, numero_orden_interna: '' };
    return v;
  },
};

export const CORRECCION_TICKET_MAS_CN: ConfigCorreccion = {
  tabla: 'compliance_tickets_mas_cn',
  modulo: 'tickets_mas_cn',
  titulo: 'Ticket MAS CN',
  campos: [
    { key: 'especificacion', label: 'Especificación', tipo: 'texto', grupo: 'Datos del ticket', ancho: 'completo' },
    { key: 'descripcion', label: 'Descripción', tipo: 'textarea', grupo: 'Datos del ticket', ancho: 'completo' },
    ...cotizaciones(),
  ],
};

/** Estatus en los que todavía se puede corregir (antes de autorizar / cancelar / rechazar). */
export const ESTATUS_CORREGIBLE: Record<string, string[]> = {
  solicitudes: ['pendiente', 'recibida'],
  solicitudes_cn: ['pendiente', 'recibida'],
  tickets_mas: ['pendiente', 'en_revision'],
  tickets_mas_cn: ['pendiente', 'en_revision'],
};
export const esCorregible = (modulo: string, estatus?: string | null) =>
  (ESTATUS_CORREGIBLE[modulo] ?? []).includes(estatus ?? 'pendiente');
