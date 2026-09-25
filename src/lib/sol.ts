// src/lib/sol.ts
// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA SOL (Seguridad · Orden · Limpieza) — lógica compartida del módulo.
//
//   · Constantes del Manual SOL-M01 (áreas, tipos de inspección, semáforo).
//   · Cálculo del Índice SOL (idéntico a la hoja "Resultado" del SOL-F01).
//   · Ciclo escolar / trimestre de una fecha.
//   · Importador del Excel SOL-F01 (hojas Inspección, Hallazgos, Tarjeta Roja).
//   · Generadores HTML imprimibles (Resultado, Reporte trimestral, Diplomas).
//
// Regla de datos: `colegio` se guarda SIEMPRE con el código corto de
// Directorio ("MA MTY"), igual que Proyectos/Tickets; en pantalla y en
// documentos oficiales se muestra el nombre completo ("Mano Amiga Monterrey").
// ─────────────────────────────────────────────────────────────────────────────
import type { WorkSheet, WorkBook, CellObject } from 'xlsx';
import type { DirectorioColegio } from '@/lib/directorio';

// ── Constantes ───────────────────────────────────────────────────────────────
export const SOL_AREAS = [
  'Aulas',
  'Baños',
  'Cocina y cafetería',
  'Bodegas',
  'Cuarto eléctrico y subestación',
  'Patios y rutas de evacuación',
  'Oficinas',
  'Laboratorios y talleres',
] as const;
export type SolArea = typeof SOL_AREAS[number];

export type SolComponente = 'S' | 'O' | 'L';
export const SOL_COMPONENTES: { key: SolComponente; label: string; color: string }[] = [
  { key: 'S', label: 'Seguridad', color: '#C95F14' },
  { key: 'O', label: 'Orden',     color: '#1F4E79' },
  { key: 'L', label: 'Limpieza',  color: '#2F6DB5' },
];

export type SolTipoInspeccion = 'linea_base' | 'semanal' | 'mensual' | 'trimestral' | 'anual';
export const SOL_TIPOS: { key: SolTipoInspeccion; label: string; corto: string; excel: string }[] = [
  { key: 'linea_base', label: 'Línea base',                        corto: 'Línea base', excel: 'Línea base' },
  { key: 'semanal',    label: 'Semanal · Comité SOL',              corto: 'Semanal',    excel: 'Semanal · Comité SOL' },
  { key: 'mensual',    label: 'Mensual · Director de campus',      corto: 'Mensual',    excel: 'Mensual · Director de campus' },
  { key: 'trimestral', label: 'Trimestral · Auditoría cruzada',    corto: 'Trimestral', excel: 'Trimestral · Auditoría cruzada' },
  { key: 'anual',      label: 'Anual · Verificación NOM-001-STPS', corto: 'Anual',      excel: 'Anual · Verificación NOM-001-STPS' },
];
export const tipoLabel = (k?: string | null) => SOL_TIPOS.find(t => t.key === k)?.label ?? (k ?? '—');
export const tipoCorto = (k?: string | null) => SOL_TIPOS.find(t => t.key === k)?.corto ?? (k ?? '—');

export const SOL_NIVELES = ['Preescolar', 'Primaria', 'Secundaria', 'Preparatoria'];

/** Roles del Comité SOL (SOL-F02) — el orden es el del organigrama. */
export const SOL_ROLES_COMITE = [
  { rol: 'Presidente',            puesto: 'Director(a) del campus', areas: 'Todo el campus' },
  { rol: 'Coordinador(a) SOL',    puesto: 'Administrador(a)',       areas: 'Recorridos y seguimiento' },
  { rol: 'Líder de Seguridad',    puesto: 'Jefe(a) de brigada PC',  areas: 'Rutas, extintores, botiquines' },
  { rol: 'Líder de Orden',        puesto: 'Mantenimiento',          areas: 'Bodegas, cuartos técnicos' },
  { rol: 'Líder de Limpieza',     puesto: 'Intendencia',            areas: 'Baños, cocina, áreas comunes' },
  { rol: 'Representante docente', puesto: 'Docente',                areas: '' },
  { rol: 'Representante docente', puesto: 'Docente',                areas: '' },
  { rol: 'Asesoría',              puesto: 'Coordinación RCMA / ECO', areas: 'Auditoría cruzada' },
];

export const PALOMITAS_SEMANA = 45; // 9 renglones × 5 días (SOL-F07)
export const SEMANAS_TRIMESTRE = 13;

// ── Semáforo (Manual 8.2) ────────────────────────────────────────────────────
export type SolNivel = 'verde' | 'ambar' | 'rojo' | 'na';
export function nivelSOL(v: number | null | undefined): SolNivel {
  if (v === null || v === undefined || Number.isNaN(v)) return 'na';
  if (v >= 85) return 'verde';
  if (v >= 70) return 'ambar';
  return 'rojo';
}
export const NIVEL_META: Record<SolNivel, { label: string; corto: string; hex: string; chip: string; dot: string; texto: string }> = {
  verde: { label: 'Verde · Campus SOL',    corto: 'Verde', hex: '#2E7D32', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', texto: 'text-emerald-700' },
  ambar: { label: 'Ámbar · En mejora',     corto: 'Ámbar', hex: '#C98A00', chip: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',   texto: 'text-amber-700' },
  rojo:  { label: 'Rojo · Plan de acción', corto: 'Rojo',  hex: '#C62828', chip: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500',     texto: 'text-red-700' },
  na:    { label: 'Sin calificar',         corto: '—',     hex: '#94A3B8', chip: 'bg-slate-50 text-slate-500 border-slate-200',       dot: 'bg-slate-300',   texto: 'text-slate-400' },
};
export const fmtIndice = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1);

// ── Ciclo escolar y trimestre ────────────────────────────────────────────────
// Ciclo: agosto a julio. Trimestres alineados a los periodos de evaluación:
// T1 ago–nov · T2 dic–mar · T3 abr–jul.
function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}
export function cicloDe(d: string | Date): string {
  const f = toDate(d);
  const y = f.getFullYear();
  return f.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
export function trimestreDe(d: string | Date): 1 | 2 | 3 {
  const m = toDate(d).getMonth(); // 0 = ene
  if (m >= 7 && m <= 10) return 1;       // ago–nov
  if (m === 11 || m <= 2) return 2;      // dic–mar
  return 3;                              // abr–jul
}
export const cicloActual = () => cicloDe(new Date());
export const cicloLabel = (c: string) => c.replace('-', ' – ');
export function ciclosRecientes(n = 4): string[] {
  const actual = Number(cicloActual().split('-')[0]);
  return Array.from({ length: n }, (_, i) => `${actual - i}-${actual - i + 1}`);
}
export function cicloAnterior(c: string): string {
  const y = Number(c.split('-')[0]);
  return `${y - 1}-${y}`;
}
export const TRIMESTRE_LABEL: Record<number, string> = {
  1: 'Trimestre 1 (ago – nov)', 2: 'Trimestre 2 (dic – mar)', 3: 'Trimestre 3 (abr – jul)',
};
/** Rango de fechas (yyyy-mm-dd) de un trimestre dentro de un ciclo. */
export function rangoTrimestre(ciclo: string, t: number): { desde: string; hasta: string } {
  const [a, b] = ciclo.split('-').map(Number);
  if (t === 1) return { desde: `${a}-08-01`, hasta: `${a}-11-30` };
  if (t === 2) return { desde: `${a}-12-01`, hasta: `${b}-03-31` };
  return { desde: `${b}-04-01`, hasta: `${b}-07-31` };
}
export function rangoCiclo(ciclo: string): { desde: string; hasta: string } {
  const [a, b] = ciclo.split('-').map(Number);
  return { desde: `${a}-08-01`, hasta: `${b}-07-31` };
}

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function diasEntre(desde: string, hasta?: string | null): number {
  const a = toDate(desde).getTime();
  const b = hasta ? toDate(hasta).getTime() : toDate(hoyISO()).getTime();
  return Math.round((b - a) / 86400000);
}
export function sumarDias(fecha: string, dias: number): string {
  const d = toDate(fecha);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export function fechaLarga(d?: string | null): string {
  if (!d) return '—';
  const f = toDate(d);
  return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}
export function fechaCorta(d?: string | null): string {
  if (!d) return '—';
  const f = toDate(d);
  return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
}

// ── Tipos de datos ───────────────────────────────────────────────────────────
export interface SolCriterio { id: string; numero: number; area: string; tipo: SolComponente; texto: string; activo: boolean; }

export interface SolRespuesta {
  id?: string;
  inspeccion_id?: string;
  criterio_numero: number;
  area: string;
  tipo: SolComponente;
  texto: string;
  calificacion: 0 | 1 | 2 | null;
  na: boolean;
  observacion: string | null;
  foto: boolean | null;
}

export interface SolInspeccion {
  id: string;
  colegio: string;
  territorio: string | null;
  fecha: string;
  tipo: SolTipoInspeccion;
  ciclo: string;
  trimestre: number | null;
  inspectores: string | null;
  director: string | null;
  duenos: Record<string, string>;
  indice: number | null;
  indice_s: number | null;
  indice_o: number | null;
  indice_l: number | null;
  por_area: Record<string, number | null>;
  criterios_calificados: number;
  criterios_na: number;
  origen: 'excel' | 'manual';
  version_formato: string | null;
  archivo_url: string | null;
  pdf_url: string | null;
  evidencia_url: string | null;
  observaciones: string | null;
  created_at: string;
}

export interface SolHallazgo {
  id: string;
  folio: string | null;
  colegio: string;
  territorio: string | null;
  inspeccion_id: string | null;
  criterio_numero: number | null;
  fecha: string;
  area: string | null;
  tipo: SolComponente | null;
  hallazgo: string;
  accion: string | null;
  responsable: string | null;
  fecha_compromiso: string | null;
  estatus: 'abierto' | 'en_proceso' | 'cerrado';
  fecha_cierre: string | null;
  riesgo_grave: boolean;
  folio_ticket_excel: string | null;
  ticket_mas_id: string | null;
  foto_cierre_url: string | null;
  notas: string | null;
  created_at: string;
}

export interface SolTarjetaRoja {
  id: string;
  folio: string | null;
  folio_excel: string | null;
  colegio: string;
  territorio: string | null;
  inspeccion_id: string | null;
  fecha: string;
  area: string | null;
  articulo: string;
  cantidad: number | null;
  motivo: string | null;
  destino: string | null;
  responsable: string | null;
  fecha_limite: string | null;
  estatus: 'pendiente' | 'en_proceso' | 'resuelto';
  fecha_resolucion: string | null;
  observaciones: string | null;
  ticket_mas_id: string | null;
  created_at: string;
}

export interface SolIntegrante { rol: string; nombre: string; puesto: string; correo: string; telefono: string; areas: string; }
export interface SolComite {
  id: string; colegio: string; ciclo: string;
  integrantes: SolIntegrante[];
  duenos: Record<string, string>;
  acta_url: string | null; acta_fecha: string | null; notas: string | null;
}

export interface SolSemana { semana: number; palomitas: number | null; s: string; o: string; l: string; }
export interface SolGuardianGrupo {
  id: string; colegio: string; ciclo: string; trimestre: number; nivel: string; grupo: string;
  semanas: SolSemana[]; promedio: number | null; porcentaje: number | null;
  guardian_propuesto: string | null; sin_seguridad_cero: boolean; participo_recorridos: boolean;
  notas: string | null; created_at: string;
}

export interface SolReconocimiento {
  id: string; tipo: 'campus' | 'guardian' | 'grupo'; colegio: string; ciclo: string;
  trimestre: number | null; nivel: string | null; grupo: string | null;
  beneficiarios: string | null; detalle: Record<string, unknown>; fecha_emision: string; created_at: string;
}

export interface SolResumenCampus {
  colegio: string;
  hallazgos_total: number; hallazgos_abiertos: number; hallazgos_vencidos: number;
  hallazgos_cerrados: number; hallazgos_cerrados_30: number; riesgos_graves: number;
  tarjetas_total: number; tarjetas_pendientes: number; tarjetas_vencidas: number; tarjetas_con_ticket: number;
  areas_con_dueno: number; comite_con_acta: boolean; distintivos: string | null;
}

// ── Índice SOL (igual que la hoja Resultado) ─────────────────────────────────
export interface SolCalculo {
  indice: number | null;
  s: number | null; o: number | null; l: number | null;
  porArea: Record<string, number | null>;
  calificados: number;
  na: number;
  sinCalificar: number;
}
const pct = (obt: number, pos: number) => (pos > 0 ? Math.round((obt / pos) * 1000) / 10 : null);

export function calcularIndice(resps: Pick<SolRespuesta, 'area' | 'tipo' | 'calificacion' | 'na'>[]): SolCalculo {
  let obt = 0, pos = 0, na = 0, sinCal = 0;
  const comp: Record<string, [number, number]> = { S: [0, 0], O: [0, 0], L: [0, 0] };
  const area: Record<string, [number, number]> = {};
  for (const r of resps) {
    if (r.na) { na++; continue; }
    if (r.calificacion === null || r.calificacion === undefined) { sinCal++; continue; }
    obt += r.calificacion; pos += 2;
    comp[r.tipo] ??= [0, 0];
    comp[r.tipo][0] += r.calificacion; comp[r.tipo][1] += 2;
    area[r.area] ??= [0, 0];
    area[r.area][0] += r.calificacion; area[r.area][1] += 2;
  }
  const porArea: Record<string, number | null> = {};
  for (const a of SOL_AREAS) porArea[a] = area[a] ? pct(area[a][0], area[a][1]) : null;
  return {
    indice: pct(obt, pos),
    s: pct(comp.S[0], comp.S[1]), o: pct(comp.O[0], comp.O[1]), l: pct(comp.L[0], comp.L[1]),
    porArea, calificados: pos / 2, na, sinCalificar: sinCal,
  };
}

// ── Colegios / folios ────────────────────────────────────────────────────────
export const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "MA MTY" → "MTY" (prefijo de folios). */
export const codigoCorto = (colegio: string) => colegio.replace(/^MA\s+/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Los 20 campus de la red, en vivo desde Directorio. */
export function campusSOL(rows: DirectorioColegio[]): DirectorioColegio[] {
  return rows
    .filter(r => r.territorio === 'NORTE' || r.territorio === 'MEXICO')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function nombreCampus(rows: DirectorioColegio[], codigo: string): string {
  return rows.find(r => r.codigo === codigo)?.nombre ?? codigo;
}

/** Siguiente folio consecutivo con el prefijo dado ("MTY-TR-" → "MTY-TR-004"). */
export function siguienteFolio(existentes: (string | null)[], prefijo: string): string {
  let max = 0;
  for (const f of existentes) {
    if (!f || !f.startsWith(prefijo)) continue;
    const n = parseInt(f.slice(prefijo.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(3, '0')}`;
}

// ── Importador del Excel SOL-F01 ─────────────────────────────────────────────
export interface ParsedHallazgo {
  fecha: string | null; area: string | null; tipo: SolComponente | null; hallazgo: string;
  accion: string | null; responsable: string | null; fecha_compromiso: string | null;
  requiere_ticket: boolean; folio_ticket: string | null;
  estatus: 'abierto' | 'en_proceso' | 'cerrado'; fecha_cierre: string | null;
}
export interface ParsedTarjeta {
  folio_excel: string | null; fecha: string | null; area: string | null; articulo: string;
  cantidad: number | null; motivo: string | null; destino: string | null; responsable: string | null;
  fecha_limite: string | null; estatus: 'pendiente' | 'resuelto'; observaciones: string | null;
}
export interface ParsedSOL {
  campusTexto: string;
  colegio: string | null;       // código de Directorio
  territorio: string | null;
  fecha: string | null;
  tipo: SolTipoInspeccion | null;
  tipoTexto: string;
  inspectores: string;
  director: string;
  version: string;
  duenos: Record<string, string>;
  respuestas: SolRespuesta[];
  hallazgos: ParsedHallazgo[];
  tarjetas: ParsedTarjeta[];
  errores: string[];
  avisos: string[];
}

// Se lee con SheetJS (xlsx): a diferencia de ExcelJS, no falla cuando el
// archivo trae imágenes/logos que Excel u otras apps guardaron de forma distinta.
type Hoja = WorkSheet;
// SheetJS se carga solo al importar un archivo (no engorda la carga inicial del sistema).
let XLSX: typeof import('xlsx');
function celda(ws: Hoja, fila: number, col: number): CellObject | undefined {
  return ws[XLSX.utils.encode_cell({ r: fila - 1, c: col - 1 })] as CellObject | undefined;
}
function texto(ws: Hoja, fila: number, col: number): string {
  const c = celda(ws, fila, col);
  if (!c || c.v === undefined || c.v === null) return '';
  if (c.t === 'e') return '';
  return String(c.w ?? c.v).trim();
}
function isoDeSerial(n: number): string | null {
  const p = XLSX.SSF.parse_date_code(n);
  if (!p || !p.y) return null;
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
function fechaISO(x: unknown): string | null {
  if (x === null || x === undefined || x === '') return null;
  if (x instanceof Date) return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (typeof x === 'number') return x > 20000 && x < 80000 ? isoDeSerial(x) : null;
  const s = String(x).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function fecha(ws: Hoja, fila: number, col: number): string | null {
  const c = celda(ws, fila, col);
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  return fechaISO(c.v);
}
function numero(ws: Hoja, fila: number, col: number): number | null {
  const c = celda(ws, fila, col);
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  const n = Number(c.v);
  return Number.isNaN(n) ? null : n;
}
const ultimaFila = (ws: Hoja) => (ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0);

function hoja(wb: WorkBook, nombre: string): Hoja | undefined {
  const n = normalizar(nombre);
  const real = wb.SheetNames.find(x => normalizar(x) === n);
  return real ? wb.Sheets[real] : undefined;
}

/** Busca una etiqueta en las primeras filas y regresa la posición de la primera celda con valor a su derecha. */
function junto(ws: Hoja, etiqueta: string, maxFila = 12): [number, number] | null {
  const et = normalizar(etiqueta);
  for (let r = 1; r <= maxFila; r++) {
    for (let c = 1; c <= 10; c++) {
      if (normalizar(texto(ws, r, c)) !== et) continue;
      for (let k = c + 1; k <= c + 4; k++) {
        const t = texto(ws, r, k);
        if (t && normalizar(t) !== et) return [r, k];
      }
      return null;
    }
  }
  return null;
}
const textoJunto = (ws: Hoja, et: string) => { const p = junto(ws, et); return p ? texto(ws, p[0], p[1]) : ''; };
const fechaJunto = (ws: Hoja, et: string) => { const p = junto(ws, et); return p ? fecha(ws, p[0], p[1]) : null; };

const areaCanonica = (s: string): string | null => {
  const n = normalizar(s);
  return SOL_AREAS.find(a => normalizar(a) === n) ?? null;
};
const tipoComp = (s: string): SolComponente | null => {
  const t = s.trim().toUpperCase().charAt(0);
  return t === 'S' || t === 'O' || t === 'L' ? t : null;
};

export async function parseSolExcel(file: File | ArrayBuffer, directorio: DirectorioColegio[]): Promise<ParsedSOL> {
  const out: ParsedSOL = {
    campusTexto: '', colegio: null, territorio: null, fecha: null, tipo: null, tipoTexto: '',
    inspectores: '', director: '', version: '', duenos: {}, respuestas: [], hallazgos: [], tarjetas: [],
    errores: [], avisos: [],
  };
  let wb: WorkBook;
  try {
    XLSX = await import('xlsx');
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    out.errores.push('No se pudo leer el archivo. Verifica que sea el formato SOL-F01 en Excel (.xlsx).');
    return out;
  }

  const insp = hoja(wb, 'Inspección');
  if (!insp) {
    out.errores.push('El archivo no tiene la hoja "Inspección". No corresponde al formato SOL-F01.');
    return out;
  }

  // Versión del formato (encabezado: "… Clave: SOL-F01 · Versión 1.x")
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 7; c++) {
      const m = texto(insp, r, c).match(/SOL-F01.*?Versi[oó]n\s*([\d.]+)/i);
      if (m) out.version = m[1];
    }
  }
  if (!out.version) out.avisos.push('No se encontró la clave "SOL-F01 · Versión" en el encabezado; revisa que sea el formato oficial.');
  else if (!out.version.startsWith('1.')) out.avisos.push(`El formato es la versión ${out.version}; el sistema está hecho para la versión 1.x.`);

  // Encabezado
  out.campusTexto = textoJunto(insp, 'Campus');
  out.fecha       = fechaJunto(insp, 'Fecha de inspección');
  out.tipoTexto   = textoJunto(insp, 'Tipo de inspección');
  out.inspectores = textoJunto(insp, 'Inspector(es)');
  out.director    = textoJunto(insp, 'Director de campus');

  if (!out.campusTexto) out.errores.push('No se capturó el Campus en la hoja Inspección.');
  else {
    const n = normalizar(out.campusTexto);
    const red = directorio.filter(d => d.territorio === 'NORTE' || d.territorio === 'MEXICO');
    const fila = directorio.find(d => normalizar(d.nombre) === n || normalizar(d.codigo) === n)
      ?? red.find(d => n.includes(normalizar(d.nombre.replace(/^Mano Amiga\s+/i, ''))));
    if (fila) { out.colegio = fila.codigo; out.territorio = fila.territorio; }
    else out.errores.push(`El campus "${out.campusTexto}" no coincide con ningún colegio del Directorio.`);
  }
  if (!out.fecha) out.errores.push('Falta la Fecha de inspección (o no es una fecha válida).');
  if (!out.tipoTexto) out.errores.push('Falta el Tipo de inspección.');
  else {
    const n = normalizar(out.tipoTexto);
    out.tipo = SOL_TIPOS.find(t => normalizar(t.excel) === n || normalizar(t.label) === n)?.key
      ?? SOL_TIPOS.find(t => n.startsWith(normalizar(t.corto)))?.key ?? null;
    if (!out.tipo) out.errores.push(`Tipo de inspección no reconocido: "${out.tipoTexto}".`);
  }

  // Criterios y dueños de área
  const nInsp = ultimaFila(insp);
  for (let r = 1; r <= nInsp; r++) {
    const aTxt = texto(insp, r, 1);
    if (/due[ñn]o del [áa]rea/i.test(aTxt)) {
      const [izq, der = ''] = aTxt.split(/due[ñn]o del [áa]rea\s*:?/i);
      const area = areaCanonica(izq.replace(/[·•|]/g, ' '));
      const nombre = der.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
      if (area && nombre) out.duenos[area] = nombre;
      continue;
    }
    const num = numero(insp, r, 1);
    if (num === null || !Number.isInteger(num) || num < 1 || num > 200) continue;
    const criterio = texto(insp, r, 4);
    if (!criterio) continue;
    const area = areaCanonica(texto(insp, r, 2)) ?? texto(insp, r, 2);
    const tipo = tipoComp(texto(insp, r, 3)) ?? 'S';
    const calRaw = texto(insp, r, 5).toUpperCase();
    let calificacion: 0 | 1 | 2 | null = null;
    let na = false;
    if (calRaw === 'NA' || calRaw === 'N/A') na = true;
    else if (calRaw === '0' || calRaw === '1' || calRaw === '2') calificacion = Number(calRaw) as 0 | 1 | 2;
    else if (calRaw !== '') out.avisos.push(`Criterio ${num}: calificación "${calRaw}" no válida; se deja sin calificar.`);
    const fotoTxt = normalizar(texto(insp, r, 7));
    out.respuestas.push({
      criterio_numero: num, area, tipo, texto: criterio, calificacion, na,
      observacion: texto(insp, r, 6) || null,
      foto: fotoTxt === 'si' ? true : fotoTxt === 'no' ? false : null,
    });
  }

  if (out.respuestas.length === 0) out.errores.push('No se encontraron criterios en la hoja Inspección.');
  else if (out.respuestas.length !== 40) out.avisos.push(`Se encontraron ${out.respuestas.length} criterios (el formato oficial tiene 40).`);
  const sinCal = out.respuestas.filter(r => !r.na && r.calificacion === null).length;
  if (sinCal > 0) out.avisos.push(`${sinCal} criterio(s) sin calificar; no cuentan para el Índice.`);
  const sinObs = out.respuestas.filter(r => (r.calificacion === 0 || r.calificacion === 1) && !r.observacion).length;
  if (sinObs > 0) out.avisos.push(`${sinObs} criterio(s) con 0 o 1 no traen observación.`);

  // Hallazgos
  const hh = hoja(wb, 'Hallazgos');
  if (hh) {
    let header = 0;
    for (let r = 1; r <= 15; r++) if (normalizar(texto(hh, r, 5)) === 'hallazgo') { header = r; break; }
    const n = ultimaFila(hh);
    if (header) for (let r = header + 1; r <= n; r++) {
      const hallazgo = texto(hh, r, 5);
      if (!hallazgo) continue;
      const est = normalizar(texto(hh, r, 11));
      out.hallazgos.push({
        fecha: fecha(hh, r, 2),
        area: areaCanonica(texto(hh, r, 3)) ?? (texto(hh, r, 3) || null),
        tipo: tipoComp(texto(hh, r, 4)),
        hallazgo,
        accion: texto(hh, r, 6) || null,
        responsable: texto(hh, r, 7) || null,
        fecha_compromiso: fecha(hh, r, 8),
        requiere_ticket: normalizar(texto(hh, r, 9)) === 'si',
        folio_ticket: texto(hh, r, 10) || null,
        estatus: est === 'cerrado' ? 'cerrado' : est === 'en proceso' ? 'en_proceso' : 'abierto',
        fecha_cierre: fecha(hh, r, 12),
      });
    }
  } else out.avisos.push('El archivo no trae la hoja "Hallazgos".');

  // Tarjetas rojas
  const tr = hoja(wb, 'Tarjeta Roja');
  if (tr) {
    let header = 0;
    for (let r = 1; r <= 15; r++) if (normalizar(texto(tr, r, 4)).startsWith('articulo')) { header = r; break; }
    const n = ultimaFila(tr);
    if (header) for (let r = header + 1; r <= n; r++) {
      const articulo = texto(tr, r, 4);
      if (!articulo) continue;
      out.tarjetas.push({
        folio_excel: texto(tr, r, 1) || null,
        fecha: fecha(tr, r, 2),
        area: areaCanonica(texto(tr, r, 3)) ?? (texto(tr, r, 3) || null),
        articulo,
        cantidad: numero(tr, r, 5),
        motivo: texto(tr, r, 6) || null,
        destino: texto(tr, r, 7) || null,
        responsable: texto(tr, r, 8) || null,
        fecha_limite: fecha(tr, r, 9),
        estatus: normalizar(texto(tr, r, 10)) === 'resuelto' ? 'resuelto' : 'pendiente',
        observaciones: texto(tr, r, 11) || null,
      });
    }
  } else out.avisos.push('El archivo no trae la hoja "Tarjeta Roja".');

  return out;
}

// ── Impresión (mismo patrón que el resto del sistema: ventana + print) ───────
export function imprimirHTML(html: string) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 700);
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escHTML = esc;

const NAVY = '#00295A', ORANGE = '#ED7102', INK = '#1B2A3F', MUTED = '#5B6B7F', LINE = '#D8DEE6';

const baseCSS = (orientacion: 'portrait' | 'landscape') => `
  @page { size: letter ${orientacion}; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: ${INK}; margin: 0; font-size: 11px; }
  .hdr { display:flex; align-items:center; gap:14px; border-bottom:3px solid ${ORANGE}; padding-bottom:8px; margin-bottom:12px; }
  .hdr img { height:46px; }
  .hdr .t1 { font-size:10px; letter-spacing:2px; font-weight:700; color:${ORANGE}; }
  .hdr .t2 { font-size:17px; font-weight:800; color:${NAVY}; }
  .hdr .t3 { font-size:10px; color:${MUTED}; }
  table { width:100%; border-collapse:collapse; margin:6px 0 12px; }
  th { background:${NAVY}; color:#fff; font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; padding:5px 6px; text-align:left; }
  td { border-bottom:1px solid ${LINE}; padding:5px 6px; vertical-align:top; }
  .num { text-align:right; font-variant-numeric: tabular-nums; }
  .chip { display:inline-block; padding:2px 8px; border-radius:10px; font-weight:700; font-size:9.5px; color:#fff; }
  h3 { color:${NAVY}; font-size:12.5px; margin:14px 0 4px; }
  .muted { color:${MUTED}; }
  .firmas { display:flex; gap:24px; margin-top:34px; }
  .firmas div { flex:1; border-top:1px solid ${INK}; padding-top:4px; text-align:center; font-size:10px; }
  .foot { margin-top:14px; font-size:9px; color:${MUTED}; border-top:1px solid ${LINE}; padding-top:6px; }
`;
const chip = (v: number | null | undefined) => {
  const n = nivelSOL(v ?? null);
  return `<span class="chip" style="background:${NIVEL_META[n].hex}">${n === 'na' ? '—' : fmtIndice(v)}</span>`;
};
const logo = () => `${window.location.origin}/colegio-mano-amiga.png`;

/** Hoja Resultado + criterios observados de una inspección (para firma). */
export function htmlResultadoInspeccion(i: SolInspeccion, resp: SolRespuesta[], campusNombre: string): string {
  const n = nivelSOL(i.indice);
  const obs = resp.filter(r => !r.na && (r.calificacion === 0 || r.calificacion === 1)).sort((a, b) => a.criterio_numero - b.criterio_numero);
  const areas = SOL_AREAS.map(a => `<tr><td>${esc(a)}</td><td>${esc(i.duenos?.[a] ?? '')}</td><td class="num">${chip(i.por_area?.[a] ?? null)}</td></tr>`).join('');
  const comps = SOL_COMPONENTES.map(c => {
    const v = c.key === 'S' ? i.indice_s : c.key === 'O' ? i.indice_o : i.indice_l;
    return `<tr><td><b style="color:${c.color}">${c.key}</b> · ${c.label}</td><td class="num">${chip(v)}</td></tr>`;
  }).join('');
  const filasObs = obs.map(r => `<tr><td class="num">${r.criterio_numero}</td><td>${esc(r.area)}</td><td>${r.tipo}</td><td>${esc(r.texto)}</td><td class="num"><b>${r.calificacion}</b></td><td>${esc(r.observacion ?? '')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Resultado SOL · ${esc(campusNombre)} · ${fechaCorta(i.fecha)}</title>
  <style>${baseCSS('portrait')}
   .big { display:flex; align-items:center; gap:18px; border:1px solid ${LINE}; border-left:10px solid ${NIVEL_META[n].hex}; border-radius:8px; padding:12px 16px; margin:8px 0 12px; }
   .big .v { font-size:40px; font-weight:800; color:${NIVEL_META[n].hex}; }
   .grid2 { display:flex; gap:16px; } .grid2 > div { flex:1; }
   .meta td { border:none; padding:2px 6px; } .meta td:first-child { color:${MUTED}; width:130px; }
  </style></head><body>
  <div class="hdr"><img src="${logo()}"/><div><div class="t1">COLEGIOS MANO AMIGA · PROGRAMA SOL</div>
  <div class="t2">Resultado de la Inspección · Índice SOL</div><div class="t3">Formato SOL-F01 · Seguridad · Orden · Limpieza</div></div></div>
  <table class="meta"><tr><td>Campus</td><td><b>${esc(campusNombre)}</b></td><td>Territorio</td><td>${esc(i.territorio ?? '')}</td></tr>
  <tr><td>Fecha</td><td>${fechaLarga(i.fecha)}</td><td>Tipo</td><td>${esc(tipoLabel(i.tipo))}</td></tr>
  <tr><td>Inspector(es)</td><td>${esc(i.inspectores ?? '')}</td><td>Ciclo</td><td>${cicloLabel(i.ciclo)}${i.trimestre ? ` · T${i.trimestre}` : ''}</td></tr></table>
  <div class="big"><div class="v">${fmtIndice(i.indice)}</div><div><div style="font-weight:800;font-size:14px;color:${NIVEL_META[n].hex}">${NIVEL_META[n].label}</div>
  <div class="muted">${i.criterios_calificados} criterios calificados · ${i.criterios_na} no aplican · Índice = puntos obtenidos ÷ puntos posibles × 100</div></div></div>
  <div class="grid2"><div><h3>Por área</h3><table><tr><th>Área</th><th>Dueño del área</th><th class="num">%</th></tr>${areas}</table></div>
  <div><h3>Por componente</h3><table><tr><th>Componente</th><th class="num">%</th></tr>${comps}</table>
  <p class="muted" style="font-size:9.5px">Verde 85–100 (Campus SOL) · Ámbar 70–84 (En mejora) · Rojo 0–69 (Plan de acción). NA no suma ni resta.</p></div></div>
  <h3>Criterios con observación (calificados 0 o 1)</h3>
  ${obs.length ? `<table><tr><th>No.</th><th>Área</th><th>Tipo</th><th>Criterio</th><th class="num">Cal.</th><th>Observación</th></tr>${filasObs}</table>` : '<p class="muted">Sin criterios observados.</p>'}
  <div class="firmas"><div>Nombre y firma del inspector</div><div>Nombre y firma del Director de campus<br/>${esc(i.director ?? '')}</div><div>Nombre y firma del Coordinador del Comité SOL</div></div>
  <div class="foot">Sistema RCMA · Programa SOL · Generado el ${fechaLarga(hoyISO())}</div>
  </body></html>`;
}

export interface FilaReporte {
  colegio: string; nombre: string; territorio: string; inspecciones: number;
  indice: number | null; s: number | null; o: number | null; l: number | null;
  hallazgosAbiertos: number; hallazgosVencidos: number; cerrados30: number; cerradosTotal: number;
  tarjetasPendientes: number; tarjetasVencidas: number; tarjetasConTicket: number;
}

/** Reporte trimestral a la Dirección Nacional. */
export function htmlReporteTrimestral(ciclo: string, trimestre: number, filas: FilaReporte[], notas: string): string {
  const conDato = filas.filter(f => f.indice !== null);
  const prom = conDato.length ? conDato.reduce((s, f) => s + (f.indice ?? 0), 0) / conDato.length : null;
  const cuenta = (n: SolNivel) => conDato.filter(f => nivelSOL(f.indice) === n).length;
  const ranking = [...filas].sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
  const sinInsp = filas.filter(f => f.inspecciones === 0);
  const tot = (k: keyof FilaReporte) => filas.reduce((s, f) => s + (Number(f[k]) || 0), 0);
  const kpi = (v: string, l: string, c = NAVY) => `<div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:8px 10px"><div style="font-size:22px;font-weight:800;color:${c}">${v}</div><div class="muted" style="font-size:9.5px;text-transform:uppercase;letter-spacing:.5px">${l}</div></div>`;
  const rows = ranking.map((f, i) => `<tr><td class="num">${f.indice === null ? '—' : i + 1}</td><td><b>${esc(f.nombre)}</b><br/><span class="muted">${esc(f.territorio === 'MEXICO' ? 'MÉXICO' : f.territorio)}</span></td>
    <td class="num">${f.inspecciones}</td><td class="num">${chip(f.indice)}</td><td class="num">${fmtIndice(f.s)}</td><td class="num">${fmtIndice(f.o)}</td><td class="num">${fmtIndice(f.l)}</td>
    <td class="num">${f.hallazgosAbiertos}${f.hallazgosVencidos ? ` <span style="color:#C62828">(${f.hallazgosVencidos} +30d)</span>` : ''}</td>
    <td class="num">${f.cerradosTotal ? Math.round((f.cerrados30 / f.cerradosTotal) * 100) + '%' : '—'}</td>
    <td class="num">${f.tarjetasPendientes}${f.tarjetasVencidas ? ` <span style="color:#C62828">(${f.tarjetasVencidas} venc.)</span>` : ''}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reporte trimestral SOL · ${cicloLabel(ciclo)} · T${trimestre}</title>
  <style>${baseCSS('landscape')} td,th{font-size:10px}</style></head><body>
  <div class="hdr"><img src="${logo()}"/><div><div class="t1">COLEGIOS MANO AMIGA · PROGRAMA SOL · REPORTE A LA DIRECCIÓN NACIONAL</div>
  <div class="t2">Reporte trimestral SOL · Ciclo ${cicloLabel(ciclo)} · ${TRIMESTRE_LABEL[trimestre]}</div>
  <div class="t3">Coordinación de Obras y Mantenimiento (RCMA) · ${fechaLarga(hoyISO())}</div></div></div>
  <div style="display:flex;gap:10px;margin-bottom:10px">
   ${kpi(fmtIndice(prom), 'Índice SOL nacional', NIVEL_META[nivelSOL(prom)].hex)}
   ${kpi(String(cuenta('verde')), 'Campus en verde', NIVEL_META.verde.hex)}
   ${kpi(String(cuenta('ambar')), 'Campus en ámbar', NIVEL_META.ambar.hex)}
   ${kpi(String(cuenta('rojo')), 'Campus en rojo', NIVEL_META.rojo.hex)}
   ${kpi(String(tot('hallazgosAbiertos')), 'Hallazgos abiertos')}
   ${kpi(String(tot('tarjetasPendientes')), 'Tarjetas rojas pendientes')}
  </div>
  <h3>Ranking de campus (promedio del trimestre)</h3>
  <table><tr><th class="num">#</th><th>Campus</th><th class="num">Insp.</th><th class="num">Índice</th><th class="num">S</th><th class="num">O</th><th class="num">L</th><th class="num">Hallazgos abiertos</th><th class="num">Cerrados &lt;30 días</th><th class="num">Tarjetas pendientes</th></tr>${rows}</table>
  ${sinInsp.length ? `<h3>Campus sin inspección registrada en el trimestre</h3><p>${sinInsp.map(f => esc(f.nombre)).join(' · ')}</p>` : ''}
  ${notas.trim() ? `<h3>Observaciones de la Coordinación</h3><p style="white-space:pre-wrap">${esc(notas)}</p>` : ''}
  <div class="firmas" style="max-width:520px"><div>Ing. Ricardo Reyes Medina<br/>Coordinador de Obras y Mantenimiento (RCMA)</div></div>
  <div class="foot">Índice SOL = puntos obtenidos ÷ puntos posibles × 100 (formato SOL-F01). Verde 85–100 · Ámbar 70–84 · Rojo 0–69. Manual del Programa SOL (SOL-M01).</div>
  </body></html>`;
}

// ── Diplomas (SOL-F03 / F04 / F06) ───────────────────────────────────────────
export interface DatosDiploma {
  tipo: 'campus' | 'guardian' | 'grupo';
  campusNombre: string;
  ciclo: string;
  ciudad: string;
  fecha: string;               // yyyy-mm-dd
  beneficiarios: string[];     // alumnos (guardian/grupo); ignorado para campus
  grupo?: string;              // "3° A"
  nivel?: string;              // "Primaria"
  directorCampus?: string;
  coordinadorComite?: string;
  directorNacional?: string;
}

// Diseño institucional (Reconocimientos_SOL.docx): el marco, el logotipo, la marca
// de agua "SOL" y el sello de cada reconocimiento vienen en una imagen de fondo
// (public/sol/diploma-*.jpg); aquí solo se escribe el texto encima, con las mismas
// tipografías, tamaños y colores del documento de Word.
const DIPLOMA = {
  campus:   { titulo: 'CAMPUS SOL',         clave: 'SOL-F03', color: '#C95F14', tam: 38, fondo: 'diploma-campus.jpg' },
  guardian: { titulo: 'GUARDIÁN SOL',       clave: 'SOL-F04', color: '#2F6DB5', tam: 38, fondo: 'diploma-guardian.jpg' },
  grupo:    { titulo: 'GRUPO GUARDIÁN SOL', clave: 'SOL-F06', color: '#A67C00', tam: 34, fondo: 'diploma-grupo.jpg' },
} as const;

export function htmlDiplomas(d: DatosDiploma): string {
  const cfg = DIPLOMA[d.tipo];
  const fondo = `${window.location.origin}/sol/${cfg.fondo}`;
  const lugar = `${esc(d.ciudad || '[Ciudad]')}, a ${fechaLarga(d.fecha)}`;
  const firma = (n: string | undefined, p: string) =>
    `<div class="f"><div class="ln"></div><b>${esc(n || '')}</b><span>${p}</span></div>`;
  const firmas = d.tipo === 'campus'
    ? firma(d.directorNacional, 'Director Nacional') + firma('Ing. Ricardo Reyes Medina', 'Coordinador de Obras y Mantenimiento (RCMA)')
    : d.tipo === 'guardian'
      ? firma(d.directorCampus, 'Director(a) del campus') + firma(d.coordinadorComite, 'Coordinador(a) del Comité SOL')
      : firma(d.directorCampus, 'Director(a) del campus') + firma(d.coordinadorComite, 'Coordinador(a) del Comité SOL')
        + firma(d.directorNacional, 'Director Nacional') + firma('Ing. Ricardo Reyes Medina', 'Coordinador RCMA');
  const pagina = (nombre: string) => {
    const quien = nombre ? esc(nombre) : '&nbsp;';
    const cuerpo = d.tipo === 'campus'
      ? `<p class="a">a</p><p class="nom">${esc(d.campusNombre)}</p>
         <p class="txt">por sostener durante el ciclo escolar ${cicloLabel(d.ciclo)} un Índice SOL de excelencia en Seguridad, Orden y Limpieza,<br/>cuidando a cada persona que forma parte de nuestra comunidad.</p>`
      : d.tipo === 'guardian'
        ? `<p class="a">a la alumna / al alumno</p><p class="nom${nombre ? '' : ' vacio'}">${quien}</p>
           <p class="txt">de ${esc(d.grupo || '______')}, campus ${esc(d.campusNombre)}, por cuidar su aula y ser ejemplo de Seguridad, Orden y Limpieza,<br/>durante el ciclo escolar ${cicloLabel(d.ciclo)}.</p>`
        : `<p class="a">a la alumna / al alumno</p><p class="nom${nombre ? '' : ' vacio'}">${quien}</p>
           <p class="txt">integrante del grupo ${esc(d.grupo || '______')} de ${esc(d.nivel || '______')}, campus ${esc(d.campusNombre)}, ganador del reconocimiento al grupo<br/>que mejor cuidó la Seguridad, el Orden y la Limpieza de su aula durante el ciclo escolar ${cicloLabel(d.ciclo)}.</p>`;
    return `<section class="pg"><img class="bg" src="${fondo}" alt=""/>
      <div class="cont">
        <p class="otorga">La Red de Colegios Mano Amiga otorga el reconocimiento</p>
        <h1>${cfg.titulo}</h1>${cuerpo}
        <p class="lugar">${lugar}</p>
        <div class="firmas ${d.tipo === 'grupo' ? 'cuatro' : ''}">${firmas}</div>
      </div></section>`;
  };
  const nombres = d.tipo === 'campus' ? [''] : (d.beneficiarios.length ? d.beneficiarios : ['']);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${cfg.titulo} · ${esc(d.campusNombre)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
   @page { size: letter landscape; margin: 0; }
   * { box-sizing:border-box; margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
   body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color:#262626; }
   .pg { position:relative; width:11in; height:8.5in; overflow:hidden; page-break-after:always; }
   .pg:last-child { page-break-after:auto; }
   .bg { position:absolute; inset:0; width:100%; height:100%; }
   .cont { position:absolute; left:0.9in; right:0.9in; top:2.45in; text-align:center; }
   p, h1 { line-height:1.18; }
   .otorga { font-size:15pt; font-style:italic; color:#595959; margin-bottom:3pt; }
   h1 { font-size:${cfg.tam}pt; font-weight:700; color:${cfg.color}; margin-bottom:3pt; letter-spacing:.3pt; }
   .a { font-size:14pt; font-style:italic; color:#595959; margin-bottom:5pt; }
   .nom { font-size:26pt; font-weight:700; color:#1F4E79; margin-bottom:6pt; }
   .nom.vacio { display:inline-block; min-width:4.5in; border-bottom:1px solid #8C8C8C; }
   .txt { font-size:13pt; color:#262626; margin-bottom:3pt; }
   .lugar { font-size:11pt; font-style:italic; color:#595959; margin-bottom:0.49in; }
   .firmas { display:flex; justify-content:center; gap:0.28in; }
   .firmas .f { width:2.25in; display:flex; flex-direction:column; align-items:center; }
   .firmas.cuatro { gap:0.2in; } .firmas.cuatro .f { width:2.1in; }
   .firmas .ln { width:100%; border-top:1px solid #404040; margin-bottom:4pt; }
   .firmas b { font-size:11pt; color:#1F4E79; }
   .firmas span { font-size:10pt; color:#595959; line-height:1.15; }
  </style></head><body>${nombres.map(pagina).join('')}</body></html>`;
}

/** Dictamen del distintivo "Campus SOL" (Manual 11.1). */
export interface DictamenCampus {
  promedioCiclo: number | null;
  inspecciones: number;
  sinRojoEnAuditorias: boolean | null;   // null = no hay 2 auditorías cruzadas
  auditoriasRevisadas: number;
  pctCerrados30: number | null;          // null = sin hallazgos cerrados
  hallazgosTotal: number;
  areasConDueno: number;
  comiteConActa: boolean;
  criterios: { c1: boolean; c2: boolean; c3: boolean; c4: boolean };
  cumple: boolean;
}

export function dictaminarCampus(
  inspCiclo: SolInspeccion[],
  hallazgosCiclo: Pick<SolHallazgo, 'estatus' | 'fecha' | 'fecha_cierre'>[],
  comite: Pick<SolComite, 'duenos' | 'acta_url'> | null,
): DictamenCampus {
  const conIndice = inspCiclo.filter(i => i.tipo !== 'linea_base' && i.indice !== null);
  const promedioCiclo = conIndice.length ? Math.round((conIndice.reduce((s, i) => s + (i.indice ?? 0), 0) / conIndice.length) * 10) / 10 : null;
  const auditorias = inspCiclo.filter(i => i.tipo === 'trimestral').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 2);
  const sinRojo = auditorias.length < 2 ? null
    : auditorias.every(a => Object.values(a.por_area ?? {}).every(v => v === null || v === undefined || v >= 70));
  // Meta del Manual: al menos 90% de los hallazgos cerrados en menos de 30 días
  const total = hallazgosCiclo.length;
  const rapidos = hallazgosCiclo.filter(h => h.estatus === 'cerrado' && h.fecha_cierre && diasEntre(h.fecha, h.fecha_cierre) <= 30).length;
  const pctCerrados30 = total ? Math.round((rapidos / total) * 1000) / 10 : null;
  const areasConDueno = comite ? SOL_AREAS.filter(a => (comite.duenos?.[a] ?? '').trim() !== '').length : 0;
  const comiteConActa = !!comite?.acta_url;
  const criterios = {
    c1: promedioCiclo !== null && promedioCiclo >= 85,
    c2: sinRojo === true,
    c3: total === 0 ? true : (pctCerrados30 ?? 0) >= 90,
    c4: areasConDueno === SOL_AREAS.length && comiteConActa,
  };
  return {
    promedioCiclo, inspecciones: conIndice.length, sinRojoEnAuditorias: sinRojo, auditoriasRevisadas: auditorias.length,
    pctCerrados30, hallazgosTotal: total, areasConDueno, comiteConActa, criterios,
    cumple: criterios.c1 && criterios.c2 && criterios.c3 && criterios.c4,
  };
}
