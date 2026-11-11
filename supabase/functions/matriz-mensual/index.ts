// ============================================================================
// matriz-mensual — Foto mensual de la Matriz RCMA en OneDrive
//
// La llama pg_cron el día 1 de cada mes a las 7:00 (hora de Monterrey).
// Arma la misma Matriz del botón de Reportes (mismas hojas, columnas y diseño)
// y la guarda en:
//   Sistema RCMA Doc/Reportes/Matriz Mensual/{AAAA}/{AAAA-MM} Matriz RCMA.xlsx
// El mes del archivo es el que acaba de cerrar (el 1 de noviembre se guarda
// "2026-10"). No borra nada: cada mes queda como historial.
//
// Quién la puede llamar:
//   · pg_cron, con el encabezado x-matriz-secret (secreto guardado en Vault)
//   · el administrador con su sesión (para probar o regenerar un mes)
// Cuerpo opcional: { "mes": "2026-10" }  → regenera ese mes
//                  { "muestra": true }   → regresa el Excel, no lo sube
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ExcelJS from 'npm:exceljs@4.4.0';

const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const CARPETA_BASE = 'Reportes/Matriz Mensual';
const TZ = 'America/Monterrey';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-matriz-secret' };

// Logo horizontal Mano Amiga (ya recortado, sin espacio vacío)
const LOGO_B64 = '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';
const LOGO_RATIO = 3.3645;

// ─── Catálogos copiados del sistema (no cambian seguido) ─────────────────────
const COLEGIOS: { colegio: string; territorio: string }[] = [
  ['MA AGS','NORTE'],['MA GDL','NORTE'],['MA CIM','NORTE'],['MA LEO','NORTE'],['MA MTY','NORTE'],['MA PIE','NORTE'],
  ['MA SCA','NORTE'],['MA TIJ','NORTE'],['MA TOR','NORTE'],['MA VSJ','NORTE'],['MA ACA','MEXICO'],['MA CAN','MEXICO'],
  ['MA CHA','MEXICO'],['MA CON','MEXICO'],['MA LER','MEXICO'],['MA MOR','MEXICO'],['MA PUE','MEXICO'],['MA QRO','MEXICO'],
  ['MA TAP','MEXICO'],['MA ZOM','MEXICO'],['CLIN COT','MEXICO'],['CLIN LER','MEXICO'],['OF. MTY','FMA'],['OF. CDMX','FMA'],['GENERAL','FMA'],
].map(([colegio, territorio]) => ({ colegio, territorio }));

interface Actividad { id: number | string; frecuenciaDias: number; base_id?: number; eliminado?: boolean }
// Calendario de Mantenimiento: id y frecuencia en días de ACTIVIDADES_BASE
const ACTIVIDADES_BASE: Actividad[] = ([
  [1,180],[2,180],[3,730],[4,1825],[5,7],[6,180],[7,7],[8,90],[9,90],[10,120],[11,365],[12,30],[13,90],[14,180],
  [15,365],[16,365],[17,1],[18,1825],[19,180],[20,365],[21,180],[22,365],[23,180],[24,1095],[25,180],[26,365],
  [27,30],[28,30],[29,90],[30,365],[31,30],[32,7],[33,180],[34,180],[35,90],[36,30],[37,90],
] as [number, number][]).map(([id, frecuenciaDias]) => ({ id, frecuenciaDias }));
const FECHA_BASE = new Date(2025, 0, 1);

/** Igual que mergeActividadesConCustom de CalendarioMantenimiento.tsx */
function todasLasActividades(customRaw: any[]): Actividad[] {
  const custom: Actividad[] = (customRaw ?? []).map((r: any) => ({
    id: r.base_id ?? r.id, frecuenciaDias: r.frecuencia_dias, base_id: r.base_id ?? undefined, eliminado: !!r.eliminado,
  }));
  const overrides: Record<number, Actividad> = {};
  custom.filter(a => a.base_id != null).forEach(a => { overrides[a.base_id!] = a; });
  const base = ACTIVIDADES_BASE.filter(a => !overrides[a.id as number]?.eliminado).map(a => overrides[a.id as number] ?? a);
  return [...base, ...custom.filter(a => a.base_id == null)];
}

/** Igual que calcularFechasEnMes de CalendarioMantenimiento.tsx */
function fechasEnMes(act: Actividad, año: number, mes: number): number {
  let n = 0;
  const inicioMes = new Date(año, mes, 1), finMes = new Date(año, mes + 1, 0);
  let fecha = new Date(FECHA_BASE);
  while (fecha <= finMes) {
    const esDomingo = fecha.getDay() === 0;
    if (!(esDomingo && act.frecuenciaDias === 1)) {
      const mostrar = esDomingo ? new Date(fecha.getTime() + 86400000) : fecha;
      if (mostrar >= inicioMes && mostrar <= finMes) n++;
    }
    fecha = new Date(fecha.getTime() + act.frecuenciaDias * 86400000);
  }
  return n;
}

// ─── Datos ───────────────────────────────────────────────────────────────────
export interface DatosMatriz {
  projects: any[]; checklists: any[]; tickets: any[]; anteproyectos: any[]; solicitudes: any[];
  minimos: any[]; ticketsMas: any[]; customMaintenance: any[]; completions: { colegio: string }[];
  requisiciones: any[]; planteles: any[]; pagosLev: any[]; reportesLev: any[];
  nexusNotas: any[]; nexusPendientes: any[];
  complianceDocs: any[]; compliancePendientes: any[]; complianceNotas: any[]; complianceSeguimientos: any[];
}

async function leerDatos(db: any, año: number, mes: number): Promise<DatosMatriz> {
  // Trae todas las filas por bloques de 1000 (Supabase corta en 1000 por default)
  const todo = async (tabla: string, cols = '*', orden?: [string, boolean], filtro?: (q: any) => any) => {
    let filas: any[] = [];
    for (let desde = 0; ; desde += 1000) {
      let q = db.from(tabla).select(cols);
      if (filtro) q = filtro(q);
      if (orden) q = q.order(orden[0], { ascending: orden[1] });
      const { data, error } = await q.range(desde, desde + 999);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      filas = filas.concat(data ?? []);
      if (!data || data.length < 1000) break;
    }
    return filas;
  };
  const ini = `${año}-${String(mes + 1).padStart(2, '0')}-01`;
  const fin = `${año}-${String(mes + 1).padStart(2, '0')}-${String(new Date(año, mes + 1, 0).getDate()).padStart(2, '0')}`;
  const desc: [string, boolean] = ['created_at', false];
  const [projects, checklists, tickets, anteproyectos, solicitudes, minimos, ticketsMas, customMaintenance, completions,
    requisiciones, planteles, pagosLev, reportesLev, nexusNotas, nexusPendientes,
    complianceDocs, compliancePendientes, complianceNotas, complianceSeguimientos] = await Promise.all([
    todo('projects', '*', desc), todo('checklists', '*', desc), todo('tickets', '*', desc),
    todo('anteproyectos', '*', desc), todo('solicitudes', '*', desc), todo('minimos_indispensables', '*', desc),
    todo('tickets_mas', '*', desc), todo('custom_maintenance'),
    todo('maintenance_completions', 'colegio', undefined, q => q.gte('fecha_programada', ini).lte('fecha_programada', fin)),
    todo('insumos_requisiciones', '*', desc), todo('levantamiento_planteles', '*', ['colegio_nombre', true]),
    todo('levantamiento_pagos'), todo('levantamiento_reportes', '*', ['fecha_reporte', false]),
    todo('nexus_notas', '*', ['updated_at', false]), todo('nexus_pendientes', '*', desc),
    todo('compliance_documentos', 'colegio, territorio, materia, tipo_documento, estado, vigente, fecha_limite_recepcion, vigente_hasta, responsable', undefined, q => q.eq('activo', true)),
    todo('compliance_pendientes', '*', desc), todo('compliance_notas', '*', ['updated_at', false]),
    todo('compliance_seguimientos', '*', desc),
  ]);
  return { projects, checklists, tickets, anteproyectos, solicitudes, minimos, ticketsMas, customMaintenance, completions,
    requisiciones, planteles, pagosLev, reportesLev, nexusNotas, nexusPendientes,
    complianceDocs, compliancePendientes, complianceNotas, complianceSeguimientos };
}

// ─── Hojas (mismo contenido que exportMatrizExcel de Reports.tsx) ────────────
type Celda = string | number | null | undefined;
interface Hoja { name: string; title: string; headers: string[]; rows: Celda[][]; widths: number[]; moneyCol?: number | number[] }
const ORDEN_MATRIZ = [
  '📊 Resumen Ejecutivo', '📁 Proyectos', '💰 Presupuesto vs Real', '🎫 Tickets TCMM', '🎫 Ticket MAS',
  '📐 Anteproyectos', '✅ Inspecciones', '📩 Solicitudes',
  'Minimos Indispensables', 'Minimos Detalle',
  '🔧 Cumplimiento Mtto.', '📦 Requisiciones', '🏫 Levant. Planteles', '💵 Levant. Pagos', '📄 Levant. Reportes',
  '📝 Nexus Notas', '✅ Nexus Pendientes',
  '📋 Cumpl. Documentos', '✅ Cumpl. Pendientes', '📝 Cumpl. Notas', '📌 Cumpl. Seguim.',
];

/** Fecha corta como en el sistema; las fechas sin hora no se recorren de día */
const fmt = (d?: string | null) => {
  if (!d) return '—';
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00Z').toLocaleDateString('es-MX', { timeZone: 'UTC' });
  const f = new Date(s);
  return isNaN(f.getTime()) ? '—' : f.toLocaleDateString('es-MX', { timeZone: TZ });
};
const num = (n?: number | null) => (n != null ? Number(n) : 0);

function construirHojas(data: DatosMatriz, año: number, mes: number) {
  const hojas: Hoja[] = [];
  const buildSheet = (name: string, title: string, headers: string[], rows: Celda[][], widths: number[], moneyCol?: number | number[]) =>
    hojas.push({ name, title, headers, rows, widths, moneyCol });

  buildSheet('📁 Proyectos', 'Proyectos — Sistema RCMA', ['Folio', 'Nombre del Proyecto', 'Estatus', 'Avance %', 'Territorio', 'Colegio', 'Responsable', 'Tipo', 'Prioridad', 'Fecha Inicio'],
    data.projects.map(p => [p.folio ?? '—', p.name ?? '—', p.status ?? '—', p.progress ?? 0, p.territorio ?? '—', p.colegio ?? '—', p.responsible ?? '—', p.tipo_proyecto ?? '—', p.priority ?? '—', fmt(p.start_date)]),
    [12, 36, 14, 10, 12, 14, 26, 22, 12, 14]);

  buildSheet('🎫 Tickets TCMM', 'Tickets TCMM — Sistema RCMA', ['Folio', 'Territorio', 'Colegio', 'ECO', 'Tipo', 'Estatus', 'Proveedor', 'Presupuesto', 'Plan Financ.', 'Ticket Físico', 'Fecha'],
    data.tickets.map(t => [t.folio ?? '—', t.territorio ?? '—', t.colegio ?? '—', t.eco ?? '—', t.tipo_proyecto ?? '—', t.estatus ?? '—', t.nombre_proveedor ?? '—', num(t.presupuesto), t.plan_financiamiento ?? '—', t.ticket_fisico ? 'Sí' : 'No', fmt(t.fecha)]),
    [14, 12, 14, 26, 18, 12, 24, 16, 16, 13, 14], 7);

  buildSheet('📐 Anteproyectos', 'Anteproyectos — Sistema RCMA', ['Territorio', 'Colegio', 'Proyecto', 'ECO', 'Tipo', 'Prioridad', 'Estatus', 'Asignación', 'Presupuesto', 'Última Actualiz.'],
    data.anteproyectos.map(a => [a.territorio ?? '—', a.colegio ?? '—', a.nombre_proyecto ?? '—', a.eco ?? '—', a.tipo_proyecto ?? '—', a.prioridad ?? '—', a.estatus ?? '—', a.asignacion ?? '—', num(a.presupuesto), fmt(a.fecha_actualizacion)]),
    [12, 14, 34, 26, 18, 12, 14, 24, 16, 18], 8);

  buildSheet('💰 Presupuesto vs Real', 'Presupuesto vs Real — Sistema RCMA',
    ['Folio', 'Proyecto', 'Territorio', 'Colegio', 'Estatus', 'Presupuesto Inicial', 'Costo Real', 'Diferencia', '% Ahorro/Sobrecosto'],
    data.projects.map(p => {
      const budget = Number(p.budget ?? 0), real = Number(p.costo_real ?? 0), diff = budget - real;
      const pct = budget > 0 ? (((diff / budget) * 100).toFixed(1) + '%') : '—';
      return [String(p.folio ?? '—'), String(p.name ?? '—'), String(p.territorio ?? '—'), String(p.colegio ?? '—'), String(p.status ?? '—'), num(budget), num(real), num(diff), pct];
    }),
    [12, 36, 14, 16, 14, 20, 18, 18, 20], [5, 6, 7]);

  buildSheet('✅ Inspecciones', 'Checklists de Inspección — Sistema RCMA', ['Título', 'Colegio', 'Territorio', 'Inspector', 'Material', 'Estado General', 'Núm. Ítems', 'Fecha'],
    data.checklists.map(c => [c.titulo ?? '—', c.colegio ?? '—', c.territorio ?? '—', c.inspector ?? 'Sin asignar', c.material ?? '—', c.overall_status ?? '—', Array.isArray(c.items) ? c.items.length : 0, fmt(c.fecha ?? c.created_at)]),
    [38, 14, 12, 24, 32, 16, 12, 14]);

  buildSheet('📩 Solicitudes', 'Solicitudes de Proyecto — Sistema RCMA', ['Centro', 'Proyecto', 'Solicitante', 'Puesto', 'Tipo Iniciativa', 'Costo Aprox.', 'Estatus', 'Fecha Solicitud', 'Fecha Inicio Prop.'],
    data.solicitudes.map(s => [s.nombre_centro ?? '—', s.nombre_proyecto ?? '—', s.nombre_solicitante ?? '—', s.puesto_solicitante ?? '—', s.tipo_iniciativa ?? '—', num(s.costo_aproximado), s.estatus ?? '—', fmt(s.created_at), fmt(s.fecha_inicio_propuesta)]),
    [22, 34, 24, 20, 22, 16, 14, 18, 20], 5);

  // ── Mínimos Indispensables ──
  const ITEM_PRIO: Record<string, string> = {
    puertas_ancho:'P1',pasillos:'P1',tablero:'P1',circuitos:'P1',polo_tierra:'P1',
    agua_red:'P1',gas:'P1',pasillos_libres:'P1',const_pc:'P1',pipc:'P1',
    seg_estr:'P1',extintores:'P1',senal_emerg:'P1',cisterna_limp:'P1',cert_extinct:'P1',
    aulas_m2:'P2',sanitarios:'P2',bebederos:'P2',iluminacion:'P2',drenaje:'P2',
    rampa_acceso:'P2',sia:'P2',sanitario_adapt:'P2',escalones:'P2',poliza_rc:'P2',
    simulacros:'P2',brigadas:'P2',cronograma:'P2',bitacora:'P2',fumigacion:'P2',
  };
  const resLabelMin: Record<string, string> = { completo: 'Si Cumple', en_proceso: 'En Proceso', incompleto: 'No Cumple' };
  const secNomMin: Record<string, string> = { construccion:'01 Construccion', instalaciones:'02 Instalaciones', accesibilidad:'03 Accesibilidad', seguridad:'04 Seguridad y PC', mantenimiento:'05 Mantenimiento' };
  const estadoLblMin: Record<string, string> = { cumple:'Cumple', no_cumple:'No Cumple', en_proceso:'En Proceso', na:'N/A' };
  const prio = (i: any) => ITEM_PRIO[i.id as string] ?? 'P3';

  buildSheet('Minimos Indispensables', 'Minimos Indispensables — Sistema RCMA',
    ['Colegio','Territorio','Inspector','Fecha Evaluacion','Resultado','% Cumplimiento','% Criticos P1','% Urgentes P2','Items Cumple','Items No Cumple','Items En Proceso','Pendientes Criticos','Pendientes Urgentes','Verificaciones','Fecha Registro'],
    data.minimos.map(m => {
      const its: any[] = Array.isArray(m.items) ? m.items : [];
      const activos = its.filter(i => i.estado !== 'na');
      const cumpleN = its.filter(i => i.estado === 'cumple').length;
      const p1 = its.filter(i => prio(i) === 'P1' && i.estado !== 'na');
      const p2 = its.filter(i => prio(i) === 'P2' && i.estado !== 'na');
      return [
        String(m.colegio ?? '—'), String(m.territorio ?? '—'), String(m.inspector ?? 'Sin asignar'),
        fmt(m.fecha), resLabelMin[m.resultado] ?? String(m.resultado ?? '—'),
        activos.length > 0 ? Math.round(cumpleN / activos.length * 100) : 0,
        p1.length > 0 ? Math.round(p1.filter(i => i.estado === 'cumple').length / p1.length * 100) : 100,
        p2.length > 0 ? Math.round(p2.filter(i => i.estado === 'cumple').length / p2.length * 100) : 100,
        cumpleN, its.filter(i => i.estado === 'no_cumple').length, its.filter(i => i.estado === 'en_proceso').length,
        its.filter(i => prio(i) === 'P1' && i.estado === 'no_cumple').length,
        its.filter(i => prio(i) === 'P2' && i.estado === 'no_cumple').length,
        its.filter(i => i.verificado_por).length, fmt(m.created_at),
      ];
    }),
    [22, 14, 22, 18, 16, 14, 14, 14, 12, 14, 14, 16, 16, 14, 18]);

  buildSheet('Minimos Detalle', 'Detalle de Items por Evaluacion — Sistema RCMA',
    ['Colegio','Territorio','Fecha Evaluacion','Seccion','Item','Prioridad','Estado','Observacion','Verificado Por','Fecha Verificacion'],
    data.minimos.flatMap(m => (Array.isArray(m.items) ? m.items : []).map((it: any) => [
      String(m.colegio ?? '—'), String(m.territorio ?? '—'), fmt(m.fecha),
      secNomMin[it.seccion] ?? String(it.seccion ?? '—'), String(it.nombre ?? it.id ?? '—'), prio(it),
      estadoLblMin[it.estado] ?? String(it.estado ?? '—'), it.observacion ? String(it.observacion) : '—',
      it.verificado_por ? String(it.verificado_por) : '—', it.fecha_verificacion ? fmt(String(it.fecha_verificacion)) : '—',
    ])),
    [22, 14, 18, 22, 48, 12, 14, 32, 22, 18]);

  // ── Ticket MAS ──
  const tmasLbl: Record<string, string> = { autorizado:'Autorizado', pendiente:'Pendiente', en_revision:'En Revisión', cancelado:'Cancelado' };
  buildSheet('🎫 Ticket MAS', 'Ticket MAS — Sistema RCMA',
    ['Folio', 'Colegio', 'Territorio', 'Clasificación', 'Solicitante', 'Estatus', 'Fecha'],
    data.ticketsMas.map(t => [t.folio ?? '—', t.colegio ?? '—', t.territorio ?? '—', t.clasificacion ?? '—', t.nombre_solicitante ?? '—', tmasLbl[t.estatus] ?? (t.estatus ?? '—'), fmt(t.created_at)]),
    [14, 24, 12, 18, 22, 14, 14]);

  // ── Cumplimiento de Mantenimiento (del mes que cerró) ──
  let totalInstancias = 0;
  todasLasActividades(data.customMaintenance).forEach(a => { totalInstancias += fechasEnMes(a, año, mes); });
  const cumplimiento = COLEGIOS.map(c => {
    const completados = data.completions.filter(r => r.colegio === c.colegio).length;
    const pct = totalInstancias > 0 ? Math.round((completados / totalInstancias) * 100) : 0;
    return { ...c, completados, total: totalInstancias, pct };
  });
  buildSheet('🔧 Cumplimiento Mtto.', 'Cumplimiento de Mantenimiento por Colegio — Sistema RCMA',
    ['Colegio', 'Territorio', 'Completados', 'Total Programado', '% Cumplimiento'],
    cumplimiento.slice().sort((a, b) => a.pct - b.pct).map(c => [c.colegio, c.territorio, c.completados, c.total, `${c.pct}%`]),
    [16, 12, 14, 18, 16]);

  // ── Insumos — Requisiciones ──
  const reqLbl: Record<string, string> = { pendiente_cotizacion:'Pend. Cotización', cotizacion_recibida:'Cotización Recibida', en_autorizacion:'En Autorización', autorizado:'Autorizado', surtido:'Surtido' };
  buildSheet('📦 Requisiciones', 'Insumos — Requisiciones — Sistema RCMA',
    ['Folio', 'Proveedor(es)', 'Departamento', 'Prioridad', 'Estatus', 'Total (s/IVA)', 'Total (c/IVA)', 'Fecha'],
    data.requisiciones.map(r => [r.folio ?? '—', (r.proveedores_nombres ?? []).join(', ') || 'Sin proveedor', r.departamento ?? '—', r.prioridad ?? '—', reqLbl[r.estatus] ?? (r.estatus ?? '—'), num(r.total_cotizado), num(r.total_con_iva), fmt(r.created_at)]),
    [14, 30, 18, 12, 18, 16, 16, 14], [5, 6]);

  // ── Levantamiento Nacional ──
  buildSheet('🏫 Levant. Planteles', 'Levantamiento Nacional — Planteles — Sistema RCMA',
    ['Colegio', 'Zona', 'ECO', 'Asignación', 'Fase', 'Fecha Inicio', 'Fecha Término'],
    data.planteles.map(p => [p.colegio_nombre ?? '—', p.zona ?? '—', p.eco_nombre ?? '—', p.asignacion ?? '—', p.fase ?? '—', fmt(p.fecha_inicio), fmt(p.fecha_termino)]),
    [30, 12, 22, 18, 16, 16, 16]);

  const plantelNombre: Record<string, string> = Object.fromEntries(data.planteles.map(p => [p.id, p.colegio_nombre]));
  buildSheet('💵 Levant. Pagos', 'Levantamiento Nacional — Pagos — Sistema RCMA',
    ['Colegio', 'Mes', 'Concepto', 'Monto Programado', 'Monto Pagado', 'Pagado', 'Fecha de Pago'],
    data.pagosLev.map(p => [plantelNombre[p.plantel_id] ?? '—', p.mes_etiqueta ?? '—', p.concepto ?? '—', num(p.monto_programado), num(p.monto_pagado), p.pagado ? 'Sí' : 'No', fmt(p.fecha_pago)]),
    [28, 14, 22, 18, 16, 10, 16], [3, 4]);

  buildSheet('📄 Levant. Reportes', 'Levantamiento Nacional — Reportes Diarios — Sistema RCMA',
    ['Colegio', 'Colegio 2', 'Fecha del Reporte', 'Archivo', 'Notas'],
    data.reportesLev.map(r => [plantelNombre[r.plantel_id] ?? 'General', r.plantel_id_2 ? (plantelNombre[r.plantel_id_2] ?? '—') : '—', fmt(r.fecha_reporte), r.archivo_nombre ?? '—', r.notas ?? '—']),
    [26, 26, 16, 30, 36]);

  // ── NEXUS ──
  buildSheet('📝 Nexus Notas', 'NEXUS — Notas — Sistema RCMA',
    ['Título', 'Categoría', 'Colegio', 'Territorio', 'Fijada', 'Última Actualización'],
    data.nexusNotas.map(n => [n.titulo ?? '—', n.categoria ?? '—', n.colegio ?? '—', n.territorio ?? '—', n.fijada ? 'Sí' : 'No', fmt(n.updated_at)]),
    [32, 16, 22, 14, 10, 18]);

  buildSheet('✅ Nexus Pendientes', 'NEXUS — Pendientes — Sistema RCMA',
    ['Título', 'Tipo', 'Asignado a', 'Compartido con', 'Prioridad', 'Estatus', 'Fecha Límite', 'Colegio', 'Territorio'],
    data.nexusPendientes.map(p => [p.titulo ?? '—', p.tipo ?? '—', p.asignado_nombre ?? '—', p.asignado_cc_nombre ?? (p.asignado_cc ? 'Sí' : '—'), p.prioridad ?? '—', p.estatus ?? '—', fmt(p.fecha_limite), p.colegio ?? '—', p.territorio ?? '—']),
    [32, 14, 22, 22, 12, 14, 16, 18, 12]);

  // ── Cumplimiento Normativo ──
  const sinMA = (c?: string | null) => (c ? c.replace('Mano Amiga ', '') : '');
  buildSheet('📋 Cumpl. Documentos', 'Cumplimiento Normativo — Documentos — Sistema RCMA',
    ['Colegio', 'Territorio', 'Materia', 'Documento', 'Estado', 'Vigente', 'Fecha Límite', 'Vigente Hasta', 'Responsable'],
    data.complianceDocs.map(d => [sinMA(d.colegio), d.territorio, d.materia ?? 'Sin categoría', d.tipo_documento, d.estado, d.vigente ?? '—', fmt(d.fecha_limite_recepcion), fmt(d.vigente_hasta), d.responsable ?? 'Sin asignar']),
    [22, 12, 20, 34, 14, 12, 14, 14, 20]);

  buildSheet('✅ Cumpl. Pendientes', 'Cumplimiento Normativo — Pendientes — Sistema RCMA',
    ['Título', 'Colegio', 'Territorio', 'Tipo', 'Prioridad', 'Estatus', 'Fecha Límite', 'Asignado a'],
    data.compliancePendientes.map(p => [p.titulo ?? '—', p.colegio ? sinMA(p.colegio) : 'General', p.territorio ?? '—', p.tipo === 'compartido' ? 'Compartido' : 'Personal', p.prioridad ?? '—', p.estatus ?? '—', fmt(p.fecha_limite), p.asignado_a ?? '—']),
    [30, 20, 12, 14, 12, 14, 16, 24]);

  buildSheet('📝 Cumpl. Notas', 'Cumplimiento Normativo — Notas — Sistema RCMA',
    ['Título', 'Categoría', 'Colegio', 'Territorio', 'Fijada', 'Última Actualización'],
    data.complianceNotas.map(n => [n.titulo ?? '—', n.categoria ?? '—', n.colegio ? sinMA(n.colegio) : '—', n.territorio ?? '—', n.fijada ? 'Sí' : 'No', fmt(n.updated_at)]),
    [32, 16, 20, 14, 10, 18]);

  buildSheet('📌 Cumpl. Seguim.', 'Cumplimiento Normativo — Seguimientos — Sistema RCMA',
    ['Colegio', 'Territorio', 'Resumen', 'Estatus', 'Fecha Inicio'],
    data.complianceSeguimientos.map(s => [s.colegio ? sinMA(s.colegio) : '—', s.territorio ?? '—', s.resumen ?? '—', s.estatus === 'activo' ? 'Activo' : 'Completado', fmt(s.created_at)]),
    [20, 12, 44, 14, 16]);

  const resRows = [
    { label: 'Proyectos', count: data.projects.length },
    { label: 'Tickets Registrados (TCMM + TMAS)', count: data.tickets.length + data.ticketsMas.length },
    { label: 'Presupuesto vs Real', count: data.projects.filter(p => p.budget != null).length },
    { label: 'Anteproyectos', count: data.anteproyectos.length },
    { label: 'Inspecciones', count: data.checklists.length }, { label: 'Solicitudes', count: data.solicitudes.length },
    { label: 'Mínimos Indispensables', count: data.minimos.length },
    { label: 'Mantenimiento — Colegios al Día', count: cumplimiento.filter(c => c.pct >= 80).length },
    { label: 'Requisiciones (Insumos)', count: data.requisiciones.length },
    { label: 'Planteles Levantamiento Nacional', count: data.planteles.length },
    { label: 'Pagos Levantamiento Nacional', count: data.pagosLev.length },
    { label: 'Reportes Diarios Levantamiento Nacional', count: data.reportesLev.length },
    { label: 'NEXUS — Notas', count: data.nexusNotas.length },
    { label: 'NEXUS — Pendientes', count: data.nexusPendientes.length },
    { label: 'NEXUS — Pendientes Compartidos', count: data.nexusPendientes.filter(p => !!p.asignado_cc).length },
    { label: 'Cumplimiento Normativo — Documentos', count: data.complianceDocs.length },
    { label: 'Cumplimiento Normativo — Pendientes', count: data.compliancePendientes.length },
    { label: 'Cumplimiento Normativo — Notas', count: data.complianceNotas.length },
    { label: 'Cumplimiento Normativo — Seguimientos', count: data.complianceSeguimientos.length },
  ];
  const totalGeneral = resRows.filter(r => r.label !== 'NEXUS — Pendientes Compartidos').reduce((a, r) => a + r.count, 0);
  return { hojas, resRows, totalGeneral };
}

// ─── Diseño (mismo que renderMatrizPro de Reports.tsx) ───────────────────────
export async function construirMatriz(data: DatosMatriz, año: number, mes: number, corte: string): Promise<Uint8Array> {
  const { hojas, resRows, totalGeneral } = construirHojas(data, año, mes);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA'; wb.created = new Date();
  const logoId = wb.addImage({ base64: LOGO_B64, extension: 'png' });

  const NAVY = 'FF00295A', NAVY2 = 'FF1F4E79', ORANGE = 'FFED7102', ZEBRA = 'FFF3F7FC', LINEA = 'FFE2E8F0';
  const relleno = (argb: string): any => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const borde: any = { top: { style: 'thin', color: { argb: LINEA } }, bottom: { style: 'thin', color: { argb: LINEA } }, left: { style: 'thin', color: { argb: LINEA } }, right: { style: 'thin', color: { argb: LINEA } } };
  const colorEstatus = (v: string): [string, string] | null => {
    const t = v.toLowerCase();
    if (/autoriz|aprob|complet|surtid|verific|sí cumple|si cumple|^cumple|entregad|^sí$|activo/.test(t)) return ['FFDCFCE7', 'FF15803D'];
    if (/cancel|rechaz|no cumple|retraso|vencid|^no$/.test(t)) return ['FFFEE2E2', 'FFB91C1C'];
    if (/pend|revisi|proceso|espera|pausad|recibid|por expirar|cotiz/.test(t)) return ['FFFEF3C7', 'FFB45309'];
    return null;
  };

  const hojaDe: Record<string, any> = {};
  ORDEN_MATRIZ.forEach(n => { hojaDe[n] = wb.addWorksheet(n, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] }); });

  const encabezado = (ws: any, nCols: number, titulo: string, detalle: string) => {
    ws.getRow(1).height = 46; ws.getRow(2).height = 20; ws.getRow(3).height = 5;
    const desde = nCols >= 4 ? 3 : 2;
    ws.mergeCells(1, desde, 1, nCols);
    const t = ws.getCell(1, desde);
    t.value = titulo; t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: NAVY } };
    t.alignment = { horizontal: 'right', vertical: 'middle' };
    const corteCol = Math.max(1, Math.ceil(nCols * 0.55));
    ws.mergeCells(2, 1, 2, corteCol);
    const iz = ws.getCell(2, 1);
    iz.value = detalle; iz.font = { name: 'Calibri', size: 10, color: { argb: 'FFFFFFFF' } };
    iz.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    if (corteCol < nCols) {
      ws.mergeCells(2, corteCol + 1, 2, nCols);
      const de = ws.getCell(2, corteCol + 1);
      de.value = 'Matriz Sistema RCMA  ·  Coordinación de Obras y Mantenimiento';
      de.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFCBD5E1' } };
      de.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    for (let c = 1; c <= nCols; c++) { ws.getCell(2, c).fill = relleno(NAVY); ws.getCell(3, c).fill = relleno(ORANGE); }
    const alto = 44;
    ws.addImage(logoId, { tl: { col: 0.12, row: 0.12 }, ext: { width: Math.round(alto * LOGO_RATIO), height: alto }, editAs: 'oneCell' });
  };

  hojas.forEach(h => {
    const ws = hojaDe[h.name] ?? wb.addWorksheet(h.name);
    const nCols = h.headers.length;
    const money = h.moneyCol === undefined ? [] : Array.isArray(h.moneyCol) ? h.moneyCol : [h.moneyCol];
    ws.properties.tabColor = { argb: NAVY2 };
    ws.columns = h.widths.map(w => ({ width: w + 2 }));
    encabezado(ws, nCols, h.title.replace(/\s+—\s+Sistema RCMA$/, ''), `Corte al ${corte}  ·  ${h.rows.length} registro${h.rows.length !== 1 ? 's' : ''}`);

    const hr = ws.getRow(4); hr.height = 26;
    h.headers.forEach((t, c) => {
      const cell = hr.getCell(c + 1);
      cell.value = t; cell.fill = relleno(NAVY2);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { left: { style: 'thin', color: { argb: 'FF3B6A97' } }, right: { style: 'thin', color: { argb: 'FF3B6A97' } } };
    });
    const iFolio = h.headers.findIndex(x => /^folio$/i.test(x));
    const iEstatus = h.headers.findIndex(x => /^(estatus|estado|resultado|estado general|pagado)$/i.test(x));

    h.rows.forEach((row, ri) => {
      const r = ws.getRow(ri + 5); r.height = 19;
      row.forEach((val, ci) => {
        const cell = r.getCell(ci + 1);
        const esMoneda = money.includes(ci);
        cell.value = val === null || val === undefined ? '—' : val;
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
        cell.border = borde;
        cell.alignment = { vertical: 'middle', horizontal: esMoneda ? 'right' : typeof val === 'number' ? 'center' : 'left' };
        if (ri % 2 === 1) cell.fill = relleno(ZEBRA);
        if (esMoneda) cell.numFmt = '"$"#,##0.00';
        if (ci === iFolio && typeof val === 'string' && val !== '—') cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        if (ci === iEstatus && typeof val === 'string') {
          const col = colorEstatus(val);
          if (col) { cell.fill = relleno(col[0]); cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: col[1] } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
        }
      });
    });

    const tr = ws.getRow(h.rows.length + 5); tr.height = 22;
    for (let c = 1; c <= nCols; c++) {
      const cell = tr.getCell(c);
      cell.fill = relleno('FFFFF3E8');
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC2410C' } };
      cell.border = { top: { style: 'medium', color: { argb: ORANGE } } };
      cell.alignment = { vertical: 'middle', horizontal: money.includes(c - 1) ? 'right' : 'left', indent: c === 1 ? 1 : 0 };
      if (money.includes(c - 1)) {
        cell.value = h.rows.reduce((s, row) => s + (typeof row[c - 1] === 'number' ? (row[c - 1] as number) : 0), 0);
        cell.numFmt = '"$"#,##0.00';
      }
    }
    tr.getCell(1).value = `TOTAL  ·  ${h.rows.length} registro${h.rows.length !== 1 ? 's' : ''}`;
    if (nCols > 0) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } };
  });

  // Resumen ejecutivo
  const ws = hojaDe['📊 Resumen Ejecutivo'];
  ws.properties.tabColor = { argb: ORANGE };
  ws.columns = [{ width: 46 }, { width: 22 }];
  encabezado(ws, 2, 'Resumen Ejecutivo', `Corte al ${corte}`);
  const hr = ws.getRow(4); hr.height = 24;
  ([['MÓDULO', 'left'], ['TOTAL DE REGISTROS', 'right']] as [string, string][]).forEach(([t, al], i) => {
    const c = hr.getCell(i + 1); c.value = t; c.fill = relleno(NAVY2);
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: al, vertical: 'middle', indent: i === 0 ? 1 : 0 };
  });
  resRows.forEach((row, i) => {
    const r = ws.getRow(i + 5); r.height = 21;
    const a = r.getCell(1), b = r.getCell(2);
    a.value = row.label; b.value = row.count;
    a.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } }; a.alignment = { vertical: 'middle', indent: 1 };
    b.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } }; b.alignment = { horizontal: 'right', vertical: 'middle' };
    [a, b].forEach(c => { c.border = borde; if (i % 2 === 1) c.fill = relleno(ZEBRA); });
  });
  const tr = ws.getRow(resRows.length + 5); tr.height = 26;
  const ta = tr.getCell(1), tb = tr.getCell(2);
  ta.value = 'TOTAL GENERAL'; tb.value = totalGeneral;
  [ta, tb].forEach(c => { c.fill = relleno(NAVY); c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }; c.border = { top: { style: 'medium', color: { argb: ORANGE } } }; });
  ta.alignment = { vertical: 'middle', indent: 1 }; tb.alignment = { horizontal: 'right', vertical: 'middle' };

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ─── OneDrive ────────────────────────────────────────────────────────────────
async function tokenGraph(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get('AZURE_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '', scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se obtuvo token de Microsoft: ' + JSON.stringify(data));
  return data.access_token;
}

/** Sube (o reemplaza si ya existe ese mes) el archivo; Graph crea las carpetas que falten */
async function subirOneDrive(ruta: string, bytes: Uint8Array): Promise<string> {
  const token = await tokenGraph();
  const path = ('Sistema RCMA Doc/' + ruta).split('/').map(encodeURIComponent).join('/');
  const base = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${path}`;
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (bytes.length < 4 * 1024 * 1024) {
    const r = await fetch(`${base}:/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo }, body: bytes });
    if (!r.ok) throw new Error(`OneDrive ${r.status}: ${await r.text()}`);
    return (await r.json()).webUrl ?? '';
  }
  // Más de 4 MB: sesión de carga en partes de 5 MB
  const s = await fetch(`${base}:/createUploadSession`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
  });
  if (!s.ok) throw new Error(`OneDrive sesión ${s.status}: ${await s.text()}`);
  const { uploadUrl } = await s.json();
  const parte = 5 * 320 * 1024 * 3;
  let ultimo: any = null;
  for (let i = 0; i < bytes.length; i += parte) {
    const trozo = bytes.subarray(i, Math.min(i + parte, bytes.length));
    const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${i}-${i + trozo.length - 1}/${bytes.length}` }, body: trozo });
    if (!r.ok && r.status !== 202) throw new Error(`OneDrive parte ${r.status}: ${await r.text()}`);
    ultimo = r;
  }
  return ultimo ? ((await ultimo.json().catch(() => ({}))).webUrl ?? '') : '';
}

// ─── Servidor ────────────────────────────────────────────────────────────────
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function atender(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  let periodo = '';
  try {
    // Permiso: secreto de pg_cron o sesión del administrador
    const secreto = req.headers.get('x-matriz-secret') ?? '';
    let permitido = false;
    if (secreto) {
      const { data } = await db.rpc('rcma_matriz_secreto_ok', { p_secreto: secreto });
      permitido = data === true;
    }
    if (!permitido) {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await db.auth.getUser(jwt);
      permitido = (u?.user?.email ?? '').toLowerCase() === ADMIN_EMAIL;
    }
    if (!permitido) return json({ error: 'Sin permiso' }, 403);

    // Mes a guardar: el pedido, o el que acaba de cerrar (hora de Monterrey)
    let año: number, mes: number;
    if (typeof body?.mes === 'string' && /^\d{4}-\d{2}$/.test(body.mes)) {
      año = Number(body.mes.slice(0, 4)); mes = Number(body.mes.slice(5, 7)) - 1;
    } else {
      const ahora = new Date(Date.now() - 6 * 3600e3);
      const ant = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1));
      año = ant.getUTCFullYear(); mes = ant.getUTCMonth();
    }
    periodo = `${año}-${String(mes + 1).padStart(2, '0')}`;
    const corte = `${new Date(año, mes + 1, 0).getDate()} de ${MESES[mes]} de ${año}`;

    const datos = await leerDatos(db, año, mes);
    const bytes = await construirMatriz(datos, año, mes, corte);
    const nombre = `${periodo} Matriz RCMA.xlsx`;

    if (body?.muestra === true) {
      return new Response(bytes, { headers: { ...cors, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
    }

    const webUrl = await subirOneDrive(`${CARPETA_BASE}/${año}/${nombre}`, bytes);
    await db.from('matriz_mensual_log').insert({ periodo, ok: true, archivo: nombre, web_url: webUrl, kb: Math.round(bytes.length / 1024) });
    return json({ ok: true, periodo, archivo: nombre, webUrl });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await db.from('matriz_mensual_log').insert({ periodo: periodo || null, ok: false, mensaje }).then(() => {}, () => {});
    return json({ ok: false, error: mensaje }, 500);
  }
}

if (!Deno.env.get('MATRIZ_LOCAL')) Deno.serve(atender);
