// src/lib/solFormatos.ts
// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA SOL — Generador de los formatos oficiales con el diseño institucional
// "Ejecutivo" (misma línea que Ticket MAS / Solicitud de Proyecto):
//   · SOL-F01  Formato de Inspección (Excel, protegido)  ← Catálogo de criterios
//   · SOL-F07/F08/F09  Guardianes SOL (Word)             ← Renglones Guardianes
//   · SOL-V03  Registro de jornada de Voluntariado (Word)
//
// El SOL-F01 respeta lo que lee el importador (sol.ts → parseSolExcel):
// etiquetas en filas ≤ 12, criterios con No. en la columna A y
// Área/Tipo/Criterio/Calificación/Observación/Foto en B–G, renglones
// "ÁREA · Dueño del área:" en la columna A, "SOL-F01 · Versión x.y" en las
// filas 1–5, encabezado "Hallazgo" (col. E) y "Artículo" (col. D).
// ─────────────────────────────────────────────────────────────────────────────
import type ExcelJSType from 'exceljs';
import { LOGO_MANO_AMIGA } from '@/lib/formatoInstitucional';
import type { SolComponente } from '@/lib/sol';

export type SolFormato = 'SOL-F01' | 'GUARDIANES' | 'SOL-V03';
export const SOL_FORMATOS: { key: SolFormato; clave: string; nombre: string; archivo: string; ext: 'xlsx' | 'docx'; fuente: string }[] = [
  { key: 'SOL-F01',    clave: 'SOL-F01',             nombre: 'Formato de Inspección SOL',           archivo: 'Formato_Inspeccion_SOL',   ext: 'xlsx', fuente: 'Criterios de inspección' },
  { key: 'GUARDIANES', clave: 'SOL-F07 · F08 · F09', nombre: 'Formatos Guardianes SOL',             archivo: 'Formatos_Guardianes_SOL',  ext: 'docx', fuente: 'Renglones Guardianes' },
  { key: 'SOL-V03',    clave: 'SOL-V03',             nombre: 'Registro de Jornada de Voluntariado', archivo: 'Formato_Voluntariado_SOL', ext: 'docx', fuente: 'Formato fijo' },
];
export const CONTRASENA_SOL_F01 = 'SOL-RCMA';
export const nombreArchivoFormato = (f: SolFormato, version: string) => {
  const m = SOL_FORMATOS.find(x => x.key === f)!;
  return `${m.archivo}_v${version}.${m.ext}`;
};
/** Carpeta dentro de "Sistema RCMA Doc" */
export const carpetaFormatos = (f: SolFormato, version: string) => `Programa SOL/Formatos/${f} v${version}`;

/** "1.2" → "1.3" */
export function siguienteVersion(v: string | null | undefined): string {
  const [a, b] = String(v ?? '1.0').split('.').map(n => parseInt(n, 10) || 0);
  return `${a || 1}.${(b ?? 0) + 1}`;
}
/** Compara versiones: "1.10" > "1.9" */
export function compararVersion(a: string, b: string): number {
  const x = a.split('.').map(n => parseInt(n, 10) || 0), y = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}

export interface CriterioFormato { numero: number; area: string; tipo: SolComponente; texto: string }
export interface RenglonGuardian { tipo: SolComponente; texto: string }

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── Logo en tarjeta blanca con esquinas redondeadas (PNG 714×276) ───────────
let logoCache: Uint8Array | null = null;
export async function logoTarjeta(): Promise<Uint8Array> {
  if (logoCache) return logoCache;
  const img = new Image();
  img.src = LOGO_MANO_AMIGA;
  await img.decode();
  const W = 714, H = 276, pad = 42, r = 66;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r); ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r);
  ctx.closePath(); ctx.fill();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, pad, pad, W - 2 * pad, H - 2 * pad);
  const blob: Blob = await new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo dibujar el logo'))), 'image/png'));
  logoCache = new Uint8Array(await blob.arrayBuffer());
  return logoCache;
}

// ════════════════════════════════════════════════════════════════════════════
// SOL-F01 · Excel
// ════════════════════════════════════════════════════════════════════════════
type WS = ExcelJSType.Worksheet;
type Borde = Partial<ExcelJSType.Border>;
const X = {
  navy: 'FF1F4E79', mid: 'FF24598A', orange: 'FFE87722', red: 'FFDC2626',
  slate50: 'FFF8FAFC', slate100: 'FFF1F5F9', line: 'FFE2E8F0', muted: 'FF64748B', ink: 'FF1E293B',
  captura: 'FFFFF7ED', captura2: 'FFFFFBF5', white: 'FFFFFFFF', areaBg: 'FFEAF0F7',
  S: 'FFC95F14', O: 'FF1F4E79', L: 'FF2F6DB5',
};
const FONT = 'Calibri';
const PIE = 'Colegios Mano Amiga — Juntos Transformando Vidas.';
const fill = (argb: string): ExcelJSType.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = (argb = X.line): Borde => ({ style: 'thin', color: { argb } });
const dash: Borde = { style: 'dashed', color: { argb: 'FFCBD5E1' } };
const desbloquear = (c: ExcelJSType.Cell) => { c.protection = { locked: false }; };
const anchoPx = (ws: WS, i: number) => Math.round((ws.getColumn(i).width ?? 9) * 7 + 5);
const fx = (formula: string) => ({ formula }) as ExcelJSType.CellFormulaValue;
type DV = { add: (ref: string, dv: ExcelJSType.DataValidation) => void };
const validaciones = (w: WS) => (w as unknown as { dataValidations: DV }).dataValidations;

function banda(ws: WS, logoId: number, op: { titulo: string; subtitulo: string; cols: number; corte: [number, number]; anchoLogo: number }) {
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).height = r === 2 ? 30 : 17;
    for (let i = 1; i <= op.cols; i++) ws.getCell(r, i).fill = fill(i < op.corte[0] ? X.navy : i < op.corte[1] ? X.mid : X.orange);
  }
  ws.getRow(4).height = 6;
  const fin = op.corte[0] - 1;
  for (const r of [1, 2, 3]) ws.mergeCells(r, 1, r, fin);
  const k = ws.getCell('A1'); k.value = 'RED DE COLEGIOS MANO AMIGA  ·  PROGRAMA SOL';
  k.font = { name: FONT, size: 8, bold: true, color: { argb: 'FFC7D7EA' } };
  const t = ws.getCell('A2'); t.value = op.titulo; t.font = { name: FONT, size: 18, bold: true, color: { argb: X.white } };
  const s = ws.getCell('A3'); s.value = op.subtitulo; s.font = { name: FONT, size: 9.5, color: { argb: 'FFE2E8F0' } };
  for (const c of [k, t, s]) c.alignment = { vertical: 'middle', indent: 1 };
  // Tarjeta del logo alineada a la derecha, sobre el corte naranja
  const alto = op.anchoLogo * 276 / 714;
  let derecha = 0; for (let i = 1; i <= op.cols; i++) derecha += anchoPx(ws, i);
  let x = derecha - op.anchoLogo - 10, col = 0;
  while (col < op.cols && x >= anchoPx(ws, col + 1)) { x -= anchoPx(ws, col + 1); col++; }
  ws.addImage(logoId, {
    tl: { nativeCol: col, nativeColOff: Math.round(x * 9525), nativeRow: 0, nativeRowOff: 4 * 9525 } as unknown as ExcelJSType.Anchor,
    ext: { width: op.anchoLogo, height: alto }, editAs: 'absolute',
  });
}

function pie(ws: WS, fila: number, cols: number, derecha: string) {
  ws.getRow(fila).height = 20;
  for (let i = 1; i <= cols; i++) ws.getCell(fila, i).fill = fill(X.navy);
  let total = 0; for (let i = 1; i <= cols; i++) total += ws.getColumn(i).width ?? 9;
  let acum = 0, mitad = 1;
  for (let i = 1; i <= cols; i++) { acum += ws.getColumn(i).width ?? 9; if (acum >= total * 0.55) { mitad = Math.min(i, cols - 1); break; } }
  ws.mergeCells(fila, 1, fila, mitad); ws.mergeCells(fila, mitad + 1, fila, cols);
  const a = ws.getCell(fila, 1); a.value = PIE;
  a.font = { name: FONT, size: 8.5, italic: true, color: { argb: X.white } }; a.alignment = { vertical: 'middle', indent: 1 };
  const b = ws.getCell(fila, mitad + 1); b.value = derecha;
  b.font = { name: FONT, size: 8.5, color: { argb: 'FFCBD5E1' } }; b.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
}

interface Tarjeta { desde: number; hasta: number; etiqueta: string; valor: ExcelJSType.CellValue; acento?: string; rojo?: boolean; grande?: number; alinear?: 'left' | 'center' }
function kpis(ws: WS, fila: number, tarjetas: Tarjeta[]) {
  ws.getRow(fila).height = 14; ws.getRow(fila + 1).height = 22;
  for (const t of tarjetas) {
    if (t.hasta > t.desde) { ws.mergeCells(fila, t.desde, fila, t.hasta); ws.mergeCells(fila + 1, t.desde, fila + 1, t.hasta); }
    for (let i = t.desde; i <= t.hasta; i++) {
      const top = ws.getCell(fila, i), bot = ws.getCell(fila + 1, i);
      top.fill = fill(X.white); bot.fill = fill(X.white);
      top.border = { top: { style: 'thick', color: { argb: t.acento ?? X.navy } }, left: i === t.desde ? thin() : undefined, right: i === t.hasta ? thin() : undefined };
      bot.border = { bottom: thin(), left: i === t.desde ? thin() : undefined, right: i === t.hasta ? thin() : undefined };
    }
    const e = ws.getCell(fila, t.desde); e.value = t.etiqueta.toUpperCase();
    e.font = { name: FONT, size: 7.5, bold: true, color: { argb: X.muted } }; e.alignment = { vertical: 'bottom', indent: 1 };
    const v = ws.getCell(fila + 1, t.desde); v.value = t.valor;
    v.font = { name: FONT, size: t.grande ?? 12, bold: true, color: { argb: t.rojo ? X.red : X.navy } };
    v.alignment = { vertical: 'middle', indent: 1, horizontal: t.alinear ?? 'left' };
  }
}

function tituloTarjeta(ws: WS, fila: number, desde: number, hasta: number, texto: string) {
  ws.getRow(fila).height = 20;
  ws.mergeCells(fila, desde, fila, hasta);
  for (let i = desde; i <= hasta; i++) ws.getCell(fila, i).fill = fill(X.slate100);
  const c = ws.getCell(fila, desde); c.value = texto;
  c.font = { name: FONT, size: 10, bold: true, color: { argb: X.navy } };
  c.alignment = { vertical: 'middle', indent: 1 };
  c.border = { left: { style: 'thick', color: { argb: X.orange } } };
}

function encabezadoTabla(ws: WS, fila: number, titulos: string[], alto = 22) {
  ws.getRow(fila).height = alto;
  titulos.forEach((t, i) => {
    const c = ws.getCell(fila, i + 1); c.value = t; c.fill = fill(X.navy);
    c.font = { name: FONT, size: 8.5, bold: true, color: { argb: X.white } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { right: thin('FF2F5F8F') };
  });
}

function pagina(ws: WS, orientacion: 'portrait' | 'landscape', filasTitulo: string | null, clave: string, congelar?: number) {
  ws.pageSetup = {
    paperSize: 1, orientation: orientacion, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.55, header: 0.2, footer: 0.25 },
    ...(filasTitulo ? { printTitlesRow: filasTitulo } : {}),
  } as unknown as Partial<ExcelJSType.PageSetup>;
  ws.headerFooter.oddFooter = `&R&8${clave} · Pág. &P de &N`;
  ws.views = [congelar ? { state: 'frozen', ySplit: congelar, showGridLines: false } : { showGridLines: false }];
}

const regla = (r: Record<string, unknown>) => r as unknown as ExcelJSType.ConditionalFormattingRule;

export async function generarSOLF01(op: {
  version: string; vigencia: string; criterios: CriterioFormato[]; areas: readonly string[];
  campus: [string, string][]; tipos: string[];
}): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA'; wb.created = new Date();
  const logo = await logoTarjeta();
  const logoId = wb.addImage({ buffer: logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength) as ArrayBuffer, extension: 'png' });
  const clave = `SOL-F01 · v${op.version}`;
  const criterios = [...op.criterios].sort((a, b) => a.numero - b.numero);
  const areas = op.areas.filter(a => criterios.some(c => c.area === a));
  criterios.forEach(c => { if (!areas.includes(c.area)) areas.push(c.area); }); // áreas fuera del orden oficial, al final
  const nCrit = criterios.length;

  // ── Instrucciones ─────────────────────────────────────────────────────────
  const wi = wb.addWorksheet('Instrucciones');
  wi.columns = [2, 6, 92, 7, 12].map(width => ({ width }));
  banda(wi, logoId, { titulo: 'INSTRUCCIONES DE USO', subtitulo: `Formato de Inspección SOL · Clave: SOL-F01 · Versión ${op.version}`, cols: 5, corte: [4, 5], anchoLogo: 140 });
  kpis(wi, 6, [{ desde: 2, hasta: 3, etiqueta: 'Formato vigente', valor: `SOL-F01 · Versión ${op.version} · ${nCrit} criterios en ${areas.length} áreas · vigente desde ${op.vigencia}`, grande: 11 }]);
  tituloTarjeta(wi, 9, 2, 3, 'CÓMO LLENAR EL FORMATO');
  const pasos = [
    'En la hoja Inspección elige el Campus y el Tipo de inspección de las listas; captura la fecha y los inspectores. El territorio se llena solo.',
    'Escribe el nombre del dueño en el renglón azul de cada área.',
    `Recorre las ${areas.length} áreas y califica cada criterio: 2 = Cumple · 1 = Cumple parcialmente · 0 = No cumple · NA = No aplica (por ejemplo, un campus sin laboratorio).`,
    'Todo criterio con 0 o 1 lleva observación y foto. Regístralo en la hoja Hallazgos con responsable y fecha compromiso.',
    'La hoja Resultado calcula sola el Índice SOL (0–100), el % por área y por componente S · O · L, con semáforo.',
    'Los artículos que no se necesitan se marcan con tarjeta roja y se registran en la hoja Tarjeta Roja; su destino se decide en máximo 30 días.',
    'Imprime o guarda en PDF las hojas Inspección y Resultado, fírmalas y envíalas a la Coordinación RCMA junto con las fotos.',
    'SOL revisa hábitos: que todo esté despejado, ordenado y limpio. El estado del inmueble (instalaciones, fugas, daños) no se califica aquí: se reporta a Mantenimiento con Ticket MAS.',
  ];
  pasos.forEach((p, i) => {
    const f = 10 + i; wi.getRow(f).height = 30;
    const n = wi.getCell(f, 2); n.value = i + 1;
    n.font = { name: FONT, size: 13, bold: true, color: { argb: X.orange } }; n.alignment = { horizontal: 'center', vertical: 'middle' };
    const t = wi.getCell(f, 3); t.value = p;
    t.font = { name: FONT, size: 10, color: { argb: X.ink } }; t.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    for (const k of [2, 3]) wi.getCell(f, k).border = { bottom: thin() };
  });
  let fi = 10 + pasos.length + 1;
  tituloTarjeta(wi, fi, 2, 3, 'SEMÁFORO DEL ÍNDICE SOL'); fi++;
  ([['VERDE', '85 a 100 · Campus SOL: candidato al distintivo anual', 'FF2E7D32'],
    ['ÁMBAR', '70 a 84 · En mejora: hallazgos con fecha de cierre', 'FFC98A00'],
    ['ROJO', '0 a 69 · Plan de acción: acompañamiento del territorio', 'FFC62828']] as const).forEach(([k, t, col]) => {
    wi.getRow(fi).height = 20;
    const a = wi.getCell(fi, 2); a.value = k; a.fill = fill(col);
    a.font = { name: FONT, size: 8.5, bold: true, color: { argb: X.white } }; a.alignment = { horizontal: 'center', vertical: 'middle' };
    const b = wi.getCell(fi, 3); b.value = t; b.font = { name: FONT, size: 10 }; b.alignment = { vertical: 'middle', indent: 1 };
    b.border = { bottom: thin() }; fi++;
  });
  fi++;
  wi.mergeCells(fi, 2, fi, 3); wi.getRow(fi).height = 30;
  const fr = wi.getCell(fi, 2);
  fr.value = 'Frecuencia: semanal (Comité SOL) · mensual (Director de campus) · trimestral (auditoría cruzada) · anual (verificación NOM-001-STPS-2008). Las celdas de captura están desbloqueadas; el resto está protegido para que el Sistema RCMA pueda leer el archivo. No agregues ni muevas filas o columnas.';
  fr.font = { name: FONT, size: 9, italic: true, color: { argb: X.muted } }; fr.alignment = { wrapText: true, vertical: 'middle' };
  pie(wi, fi + 2, 5, `${clave} · Sistema RCMA`);
  pagina(wi, 'portrait', null, clave);

  // ── Inspección ────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Inspección');
  ws.columns = [6, 26, 7, 56, 14, 42, 9].map(width => ({ width }));
  banda(ws, logoId, { titulo: 'FORMATO DE INSPECCIÓN SOL', subtitulo: `Seguridad · Orden · Limpieza — Clave: SOL-F01 · Versión ${op.version}`, cols: 7, corte: [5, 6], anchoLogo: 165 });
  kpis(ws, 5, [
    { desde: 1, hasta: 2, etiqueta: 'Clave', valor: 'SOL-F01' },
    { desde: 4, hasta: 4, etiqueta: 'Versión', valor: `v${op.version}  ·  vigente desde ${op.vigencia}`, rojo: true, acento: X.orange },
    { desde: 5, hasta: 5, etiqueta: 'Criterios', valor: nCrit, alinear: 'center' },
    { desde: 6, hasta: 7, etiqueta: 'Áreas', valor: `${areas.length} áreas · S · O · L` },
  ]);
  ws.getRow(7).height = 6;
  tituloTarjeta(ws, 8, 1, 7, 'DATOS DE LA INSPECCIÓN');
  for (const [f, a, b] of [[9, 'Campus', 'Territorio'], [10, 'Fecha de inspección', 'Tipo de inspección'], [11, 'Inspector(es)', 'Director de campus']] as const) {
    ws.getRow(f).height = 21;
    ws.mergeCells(`A${f}:B${f}`); ws.mergeCells(`C${f}:D${f}`); ws.mergeCells(`F${f}:G${f}`);
    for (const [ref, txt] of [[`A${f}`, a], [`E${f}`, b]]) {
      const c = ws.getCell(ref); c.value = txt;
      c.font = { name: FONT, size: 9, bold: true, color: { argb: X.muted } }; c.alignment = { vertical: 'middle', indent: 1 };
    }
    for (const ref of [`C${f}`, `F${f}`]) {
      const c = ws.getCell(ref);
      c.font = { name: FONT, size: 10.5, bold: true, color: { argb: X.navy } }; c.alignment = { vertical: 'middle', indent: 1 };
    }
    for (let i = 1; i <= 7; i++) ws.getCell(f, i).border = { bottom: thin(), left: i === 1 ? thin() : undefined, right: i === 7 ? thin() : undefined };
    for (const ref of [`C${f}`, `D${f}`, `F${f}`, `G${f}`]) ws.getCell(ref).fill = fill(X.captura);
  }
  const nCampus = op.campus.length + 1;
  ws.getCell('F9').value = fx(`IFERROR(VLOOKUP(C9,Listas!$A$2:$B$${nCampus},2,FALSE),"")`);
  ws.getCell('F9').fill = fill(X.slate50); ws.getCell('G9').fill = fill(X.slate50);
  for (const ref of ['C9', 'D9', 'C10', 'D10', 'F10', 'G10', 'C11', 'D11', 'F11', 'G11']) desbloquear(ws.getCell(ref));
  ws.getCell('C9').dataValidation = { type: 'list', allowBlank: true, formulae: [`Listas!$A$2:$A$${nCampus}`], showErrorMessage: true, errorTitle: 'Campus', error: 'Elige el campus de la lista.' };
  ws.getCell('F10').dataValidation = { type: 'list', allowBlank: true, formulae: [`Listas!$D$2:$D$${op.tipos.length + 1}`], showErrorMessage: true, error: 'Elige el tipo de la lista.' };
  ws.getCell('C10').dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2023, 0, 1)], showErrorMessage: true, error: 'Escribe una fecha válida (dd/mm/aaaa).' };
  ws.getCell('C10').numFmt = 'dd/mm/yyyy';

  ws.getRow(12).height = 6;
  ws.mergeCells('A13:G13'); ws.getRow(13).height = 18;
  const esc = ws.getCell('A13');
  esc.value = 'Escala: 2 = Cumple · 1 = Cumple parcialmente · 0 = No cumple · NA = No aplica.   Tipo: S = Seguridad · O = Orden · L = Limpieza.   Todo 0 o 1 se registra en la hoja Hallazgos.';
  esc.font = { name: FONT, size: 8.5, italic: true, color: { argb: X.muted } }; esc.alignment = { vertical: 'middle' };
  encabezadoTabla(ws, 14, ['No.', 'Área', 'Tipo', 'Criterio a verificar', 'Calificación', 'Observación / hallazgo', '¿Foto?']);

  let f = 15; const primera = f;
  const rangosCal: string[] = [], rangosFoto: string[] = [];
  for (const area of areas) {
    ws.mergeCells(`A${f}:G${f}`); ws.getRow(f).height = 19;
    const h = ws.getCell(`A${f}`);
    h.value = `${area.toUpperCase()}    ·    Dueño del área: ______________________________`;
    h.font = { name: FONT, size: 9.5, bold: true, color: { argb: X.navy } };
    h.fill = fill(X.areaBg); h.alignment = { vertical: 'middle', indent: 1 };
    h.border = { left: { style: 'thick', color: { argb: X.orange } }, top: thin('FFC9D6E6'), bottom: thin('FFC9D6E6') };
    desbloquear(h); f++;
    const ini = f;
    for (const cr of criterios.filter(c => c.area === area)) {
      const row = ws.getRow(f); row.height = cr.texto.length > 62 ? 30 : 24;
      row.values = [cr.numero, area, cr.tipo, cr.texto];
      const cA = ws.getCell(`A${f}`); cA.font = { name: FONT, size: 10, bold: true, color: { argb: 'FF94A3B8' } }; cA.alignment = { horizontal: 'center', vertical: 'middle' };
      const cB = ws.getCell(`B${f}`); cB.font = { name: FONT, size: 8.5, color: { argb: X.muted } }; cB.alignment = { vertical: 'middle', wrapText: true };
      const cC = ws.getCell(`C${f}`); cC.font = { name: FONT, size: 11, bold: true, color: { argb: X[cr.tipo] } }; cC.alignment = { horizontal: 'center', vertical: 'middle' };
      const cD = ws.getCell(`D${f}`); cD.font = { name: FONT, size: 10, color: { argb: X.ink } }; cD.alignment = { vertical: 'middle', wrapText: true };
      for (const k of ['E', 'F', 'G']) {
        const c = ws.getCell(`${k}${f}`); c.fill = fill(X.captura); desbloquear(c);
        c.font = { name: FONT, size: 10, bold: k === 'E' };
        c.alignment = { vertical: 'middle', horizontal: k === 'F' ? 'left' : 'center', wrapText: k === 'F' };
      }
      for (let i = 1; i <= 7; i++) ws.getCell(f, i).border = { bottom: thin(), right: i === 4 || i === 6 ? thin('FFEEF2F7') : undefined };
      f++;
    }
    if (f > ini) { rangosCal.push(`E${ini}:E${f - 1}`); rangosFoto.push(`G${ini}:G${f - 1}`); }
  }
  const ultima = f - 1;
  for (const r of rangosCal) validaciones(ws).add(r, { type: 'list', allowBlank: true, formulae: ['"2,1,0,NA"'], showErrorMessage: true, error: 'Usa 2, 1, 0 o NA.' });
  for (const r of rangosFoto) validaciones(ws).add(r, { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] });
  ws.addConditionalFormatting({ ref: `E${primera}:E${ultima}`, rules: [
    regla({ type: 'cellIs', operator: 'equal', formulae: ['2'], priority: 1, style: { fill: fill('FFDCFCE7'), font: { color: { argb: 'FF166534' }, bold: true } } }),
    regla({ type: 'cellIs', operator: 'equal', formulae: ['1'], priority: 2, style: { fill: fill('FFFEF3C7'), font: { color: { argb: 'FF92400E' }, bold: true } } }),
    regla({ type: 'expression', formulae: [`AND(E${primera}<>"",E${primera}=0)`], priority: 3, style: { fill: fill('FFFEE2E2'), font: { color: { argb: 'FF991B1B' }, bold: true } } }),
  ] });

  // Firmas
  f += 2; ws.getRow(f).height = 46; ws.getRow(f + 1).height = 16; ws.getRow(f + 2).height = 13;
  for (const [a, b, puesto] of [['A', 'B', 'Inspector'], ['D', 'D', 'Director(a) de campus'], ['F', 'G', 'Coordinador(a) del Comité SOL']] as const) {
    if (a !== b) for (const k of [0, 1, 2]) ws.mergeCells(`${a}${f + k}:${b}${f + k}`);
    for (const col of Array.from(new Set<string>([a, b]))) {
      const lados = { left: col === a ? dash : undefined, right: col === b ? dash : undefined };
      ws.getCell(`${col}${f}`).border = { top: dash, ...lados };
      ws.getCell(`${col}${f + 1}`).border = { top: thin('FF94A3B8'), ...lados };
      ws.getCell(`${col}${f + 2}`).border = { bottom: dash, ...lados };
    }
    const n = ws.getCell(`${a}${f + 1}`); n.value = 'Nombre y firma';
    n.font = { name: FONT, size: 9.5, bold: true, color: { argb: X.navy } }; n.alignment = { horizontal: 'center' };
    const p = ws.getCell(`${a}${f + 2}`); p.value = puesto;
    p.font = { name: FONT, size: 8, color: { argb: X.muted } }; p.alignment = { horizontal: 'center', vertical: 'top' };
  }
  pie(ws, f + 4, 7, `${clave} · Sistema RCMA`);
  pagina(ws, 'portrait', '14:14', clave, 14);

  // ── Resultado ─────────────────────────────────────────────────────────────
  const wr = wb.addWorksheet('Resultado');
  wr.columns = [34, 16, 16, 16, 24].map(width => ({ width }));
  banda(wr, logoId, { titulo: 'RESULTADO · ÍNDICE SOL', subtitulo: `Se calcula solo con la hoja Inspección · ${clave}`, cols: 5, corte: [4, 5], anchoLogo: 140 });
  const R = (col: string) => `Inspección!$${col}$${primera}:$${col}$${ultima}`;
  kpis(wr, 5, [
    { desde: 1, hasta: 1, etiqueta: 'Campus', valor: fx('IF(Inspección!C9="","—",Inspección!C9)'), grande: 11 },
    { desde: 2, hasta: 3, etiqueta: 'Fecha', valor: fx('IF(Inspección!C10="","—",TEXT(Inspección!C10,"dd/mm/yyyy"))'), grande: 11 },
    { desde: 4, hasta: 5, etiqueta: 'Tipo de inspección', valor: fx('IF(Inspección!F10="","—",Inspección!F10)'), grande: 11, acento: X.orange },
  ]);
  wr.getRow(7).height = 8;
  wr.getRow(8).height = 16; wr.getRow(9).height = 40; wr.getRow(10).height = 16;
  wr.mergeCells('A8:A10'); wr.mergeCells('B8:C8'); wr.mergeCells('B9:C9'); wr.mergeCells('B10:C10'); wr.mergeCells('D8:E10');
  const ti = wr.getCell('A8'); ti.value = 'ÍNDICE SOL'; ti.fill = fill(X.navy);
  ti.font = { name: FONT, size: 16, bold: true, color: { argb: X.white } }; ti.alignment = { horizontal: 'center', vertical: 'middle' };
  const b8 = wr.getCell('B8'); b8.value = 'PUNTOS OBTENIDOS ÷ POSIBLES × 100';
  b8.font = { name: FONT, size: 7.5, bold: true, color: { argb: X.muted } }; b8.alignment = { horizontal: 'center' };
  const b9 = wr.getCell('B9'); b9.value = fx(`IFERROR(ROUND(SUM(${R('E')})/(2*COUNT(${R('E')}))*100,1),"")`);
  b9.font = { name: FONT, size: 30, bold: true, color: { argb: X.navy } }; b9.alignment = { horizontal: 'center', vertical: 'middle' };
  const b10 = wr.getCell('B10'); b10.value = fx(`${nCrit}-COUNT(${R('E')})-COUNTIF(${R('E')},"NA")&" de ${nCrit} criterios sin calificar"`);
  b10.font = { name: FONT, size: 8.5, italic: true, color: { argb: X.muted } }; b10.alignment = { horizontal: 'center' };
  const d8 = wr.getCell('D8'); d8.value = fx('IF(B9="","Sin calificar",IF(B9>=85,"VERDE · Campus SOL",IF(B9>=70,"ÁMBAR · En mejora","ROJO · Plan de acción")))');
  d8.font = { name: FONT, size: 13, bold: true, color: { argb: X.white } }; d8.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  d8.fill = fill('FF94A3B8');
  wr.addConditionalFormatting({ ref: 'D8:E10', rules: [
    regla({ type: 'expression', priority: 1, formulae: ['AND($B$9<>"",$B$9>=85)'], style: { fill: fill('FF2E7D32') } }),
    regla({ type: 'expression', priority: 2, formulae: ['AND($B$9<>"",$B$9>=70,$B$9<85)'], style: { fill: fill('FFC98A00') } }),
    regla({ type: 'expression', priority: 3, formulae: ['AND($B$9<>"",$B$9<70)'], style: { fill: fill('FFC62828') } }),
  ] });
  for (const ref of ['B8', 'B9', 'B10', 'C8', 'C9', 'C10']) wr.getCell(ref).border = { top: ref.endsWith('8') ? thin() : undefined, bottom: ref.endsWith('10') ? thin() : undefined, right: ref.startsWith('C') ? thin() : undefined };

  const tablaRes = (fila0: number, titulo: string, filas: [string, string][], colB: string, crit: string) => {
    tituloTarjeta(wr, fila0, 1, 5, titulo);
    encabezadoTabla(wr, fila0 + 1, [colB, 'Puntos obtenidos', 'Puntos posibles', '% cumplimiento', 'Semáforo'], 18);
    filas.forEach(([etiqueta, valor], i) => {
      const r = fila0 + 2 + i; wr.getRow(r).height = 18;
      wr.getCell(`A${r}`).value = etiqueta;
      wr.getCell(`B${r}`).value = fx(`SUMIFS(${R('E')},${R(crit)},"${valor}")`);
      wr.getCell(`C${r}`).value = fx(`2*COUNTIFS(${R(crit)},"${valor}",${R('E')},">=0")`);
      wr.getCell(`D${r}`).value = fx(`IF(C${r}=0,"",B${r}/C${r})`); wr.getCell(`D${r}`).numFmt = '0.0%';
      wr.getCell(`E${r}`).value = fx(`IF(D${r}="","—",IF(D${r}>=0.85,"Verde",IF(D${r}>=0.7,"Ámbar","Rojo")))`);
      for (const k of ['A', 'B', 'C', 'D', 'E']) {
        const c = wr.getCell(`${k}${r}`);
        c.font = { name: FONT, size: 10, bold: k === 'A' || k === 'E', color: { argb: k === 'A' ? X.navy : X.ink } };
        c.alignment = { vertical: 'middle', horizontal: k === 'A' ? 'left' : 'center', indent: k === 'A' ? 1 : 0 };
        c.border = { bottom: thin() };
        if (i % 2) c.fill = fill(X.slate50);
      }
    });
    wr.addConditionalFormatting({ ref: `E${fila0 + 2}:E${fila0 + 1 + filas.length}`, rules: [
      regla({ type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"Verde"'], style: { fill: fill('FFDCFCE7'), font: { color: { argb: 'FF166534' } } } }),
      regla({ type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"Ámbar"'], style: { fill: fill('FFFEF3C7'), font: { color: { argb: 'FF92400E' } } } }),
      regla({ type: 'cellIs', operator: 'equal', priority: 3, formulae: ['"Rojo"'], style: { fill: fill('FFFEE2E2'), font: { color: { argb: 'FF991B1B' } } } }),
    ] });
    return fila0 + 2 + filas.length;
  };
  let fr2 = tablaRes(12, 'RESULTADO POR ÁREA', areas.map(a => [a, a]), 'Área', 'B');
  fr2 = tablaRes(fr2 + 1, 'RESULTADO POR COMPONENTE', [['S · Seguridad', 'S'], ['O · Orden', 'O'], ['L · Limpieza', 'L']], 'Componente', 'C');
  wr.mergeCells(`A${fr2 + 1}:E${fr2 + 1}`);
  const rg = wr.getCell(`A${fr2 + 1}`);
  rg.value = 'Rangos: Verde 85–100 (Campus SOL) · Ámbar 70–84 (En mejora) · Rojo 0–69 (Plan de acción). NA no suma ni resta.';
  rg.font = { name: FONT, size: 8.5, italic: true, color: { argb: X.muted } };
  pie(wr, fr2 + 3, 5, `${clave} · Sistema RCMA`);
  pagina(wr, 'portrait', null, clave);

  // ── Hallazgos y Tarjeta Roja ──────────────────────────────────────────────
  const registro = (nombre: string, titulo: string, sub: string, anchos: number[], titulos: string[], primeraCol: (i: number) => string | number, extra: (w: WS, a: number, b: number) => void) => {
    const w = wb.addWorksheet(nombre);
    w.columns = anchos.map(width => ({ width }));
    const n = anchos.length;
    banda(w, logoId, { titulo, subtitulo: sub, cols: n, corte: [n - 2, n - 1], anchoLogo: 150 });
    w.getRow(5).height = 6;
    encabezadoTabla(w, 6, titulos, 30);
    for (let i = 0; i < 30; i++) {
      const r = 7 + i; w.getRow(r).height = 20;
      const a = w.getCell(`A${r}`); a.value = primeraCol(i);
      a.font = { name: FONT, size: 9.5, bold: true, color: { argb: nombre === 'Tarjeta Roja' ? X.red : 'FF94A3B8' } };
      a.alignment = { horizontal: 'center', vertical: 'middle' }; a.border = { bottom: thin() };
      for (let k = 2; k <= n; k++) {
        const c = w.getCell(r, k);
        c.font = { name: FONT, size: 9.5 }; c.alignment = { vertical: 'middle', wrapText: true };
        c.border = { bottom: thin(), right: thin('FFEEF2F7') };
        c.fill = fill(i % 2 ? X.captura2 : X.captura);
      }
    }
    extra(w, 7, 36);
    return w;
  };
  const listaAreas = `Listas!$F$2:$F$${areas.length + 1}`;
  const wh = registro('Hallazgos', 'PLAN DE ACCIÓN · HALLAZGOS SOL', `Todo criterio calificado 0 o 1 se registra aquí con responsable y fecha · ${clave}`,
    [6, 12, 22, 7, 40, 36, 20, 13, 11, 12, 13, 12, 10],
    ['No.', 'Fecha', 'Área', 'Tipo', 'Hallazgo', 'Acción correctiva', 'Responsable', 'Fecha compromiso', '¿Requiere Ticket?', 'Folio Ticket', 'Estatus', 'Fecha de cierre', 'Días abierto'],
    i => i + 1, (w, a, b) => {
      for (let r = a; r <= b; r++) {
        for (let k = 2; k <= 12; k++) desbloquear(w.getCell(r, k));
        const m = w.getCell(`M${r}`); m.value = fx(`IF(B${r}="","",IF(L${r}<>"",L${r}-B${r},TODAY()-B${r}))`);
        m.fill = fill(X.slate50); m.alignment = { horizontal: 'center', vertical: 'middle' };
        for (const k of ['B', 'H', 'L']) w.getCell(`${k}${r}`).numFmt = 'dd/mm/yyyy';
      }
      validaciones(w).add(`C${a}:C${b}`, { type: 'list', allowBlank: true, formulae: [listaAreas] });
      validaciones(w).add(`D${a}:D${b}`, { type: 'list', allowBlank: true, formulae: ['"S,O,L"'] });
      validaciones(w).add(`I${a}:I${b}`, { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] });
      validaciones(w).add(`K${a}:K${b}`, { type: 'list', allowBlank: true, formulae: ['"Abierto,En proceso,Cerrado"'] });
      w.addConditionalFormatting({ ref: `K${a}:K${b}`, rules: [
        regla({ type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"Cerrado"'], style: { font: { color: { argb: 'FF166534' }, bold: true } } }),
        regla({ type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"Abierto"'], style: { font: { color: { argb: 'FF991B1B' }, bold: true } } }),
      ] });
      w.addConditionalFormatting({ ref: `M${a}:M${b}`, rules: [
        regla({ type: 'expression', priority: 3, formulae: [`AND(M${a}<>"",M${a}>30,K${a}<>"Cerrado")`], style: { font: { color: { argb: X.red }, bold: true } } }),
      ] });
      const t = b + 2; w.mergeCells(`A${t}:H${t}`);
      const c = w.getCell(`A${t}`);
      c.value = fx(`COUNTIF(K${a}:K${b},"Cerrado")&" de "&COUNTA(E${a}:E${b})&" hallazgos cerrados · Meta: cerrar en menos de 30 días"`);
      c.font = { name: FONT, size: 9.5, bold: true, color: { argb: X.navy } };
      pie(w, t + 2, 13, `${clave} · Sistema RCMA`);
    });
  pagina(wh, 'landscape', '6:6', clave, 6);

  const wt = registro('Tarjeta Roja', 'REGISTRO DE TARJETAS ROJAS', `Artículos identificados en la etapa Clasificar: su destino se decide en máximo 30 días · ${clave}`,
    [9, 12, 22, 34, 9, 14, 13, 20, 12, 12, 30],
    ['Folio', 'Fecha', 'Área', 'Artículo / material', 'Cantidad', 'Motivo', 'Destino', 'Responsable', 'Fecha límite', 'Estatus', 'Observaciones'],
    i => `TR-${String(i + 1).padStart(3, '0')}`, (w, a, b) => {
      for (let r = a; r <= b; r++) {
        for (let k = 2; k <= 11; k++) desbloquear(w.getCell(r, k));
        for (const k of ['B', 'I']) w.getCell(`${k}${r}`).numFmt = 'dd/mm/yyyy';
      }
      validaciones(w).add(`C${a}:C${b}`, { type: 'list', allowBlank: true, formulae: [listaAreas] });
      validaciones(w).add(`F${a}:F${b}`, { type: 'list', allowBlank: true, formulae: ['"Roto,Obsoleto,Innecesario,Duplicado,Peligroso"'] });
      validaciones(w).add(`G${a}:G${b}`, { type: 'list', allowBlank: true, formulae: ['"Reparar,Reubicar,Donar,Vender,Desechar"'] });
      validaciones(w).add(`J${a}:J${b}`, { type: 'list', allowBlank: true, formulae: ['"Pendiente,Resuelto"'] });
      w.addConditionalFormatting({ ref: `J${a}:J${b}`, rules: [
        regla({ type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"Resuelto"'], style: { font: { color: { argb: 'FF166534' }, bold: true } } }),
        regla({ type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"Pendiente"'], style: { font: { color: { argb: 'FF92400E' }, bold: true } } }),
      ] });
      pie(w, b + 2, 11, `${clave} · Sistema RCMA`);
    });
  pagina(wt, 'landscape', '6:6', clave, 6);

  // ── Listas (oculta) ───────────────────────────────────────────────────────
  const wl = wb.addWorksheet('Listas', { state: 'hidden' });
  wl.getCell('A1').value = 'Campus'; wl.getCell('B1').value = 'Territorio'; wl.getCell('D1').value = 'Tipo de inspección'; wl.getCell('F1').value = 'Áreas';
  op.campus.forEach(([n, t], i) => { wl.getCell(`A${i + 2}`).value = n; wl.getCell(`B${i + 2}`).value = t; });
  op.tipos.forEach((t, i) => { wl.getCell(`D${i + 2}`).value = t; });
  areas.forEach((a, i) => { wl.getCell(`F${i + 2}`).value = a; });

  for (const w of [wi, ws, wr, wh, wt, wl]) {
    await w.protect(CONTRASENA_SOL_F01, { selectLockedCells: true, selectUnlockedCells: true, formatColumns: false, formatRows: false });
  }
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: MIME_XLSX });
}

// ════════════════════════════════════════════════════════════════════════════
// Formatos Word (docx)
// ════════════════════════════════════════════════════════════════════════════
type Docx = typeof import('docx');
const Wc = {
  navy: '1F4E79', mid: '24598A', orange: 'E87722', red: 'DC2626', muted: '64748B', ink: '1E293B',
  slate100: 'F1F5F9', line: 'E2E8F0', captura: 'FFF7ED', captura2: 'FFFBF5',
  S: 'C95F14', O: '1F4E79', L: '2F6DB5', verde: '2E7D32', ambar: 'C98A00', rojo: 'C62828',
};
const ANCHO = 10800; // carta con márgenes de 1.27 cm (twips)

/** Piezas del diseño institucional para Word (con la librería ya cargada). */
function piezasWord(D: Docx, logo: Uint8Array) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
    Header, Footer, AlignmentType, VerticalAlign, TableLayoutType, HeightRule, PageNumber } = D;
  type Parrafo = InstanceType<typeof Paragraph>;
  type Celda = InstanceType<typeof TableCell>;
  type Fila = InstanceType<typeof TableRow>;
  type Tabla = InstanceType<typeof Table>;
  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ImageRun>;
  type Linea = { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string; space?: number };
  type Bordes = { top?: Linea; bottom?: Linea; left?: Linea; right?: Linea };
  type Alinear = (typeof AlignmentType)[keyof typeof AlignmentType];

  const NADA: Linea = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const SIN_BORDES = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };
  const linea = (color = Wc.line, size = 4, style: Linea['style'] = BorderStyle.SINGLE): Linea => ({ style, size, color });
  const t = (text: string, o: { pt?: number; b?: boolean; i?: boolean; c?: string; sp?: number } = {}) =>
    new TextRun({ text, font: 'Calibri', size: Math.round((o.pt ?? 10) * 2), bold: o.b, italics: o.i, color: o.c ?? Wc.ink, characterSpacing: o.sp });
  const p = (runs: Run | Run[], o: { al?: Alinear; antes?: number; despues?: number; linea?: number; fondo?: string; borde?: Bordes; sangria?: number; keepNext?: boolean } = {}): Parrafo =>
    new Paragraph({
      children: Array.isArray(runs) ? runs : [runs], alignment: o.al,
      spacing: { before: o.antes ?? 0, after: o.despues ?? 0, line: o.linea },
      shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
      border: o.borde, indent: o.sangria ? { left: o.sangria } : undefined, keepNext: o.keepNext,
    });
  const celda = (children: Parrafo | Parrafo[], o: { w?: number; fondo?: string; span?: number; mt?: number; mb?: number; ml?: number; mr?: number; bordes?: Bordes | typeof SIN_BORDES } = {}): Celda =>
    new TableCell({
      children: Array.isArray(children) ? children : [children],
      width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
      shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
      verticalAlign: VerticalAlign.CENTER, columnSpan: o.span,
      margins: { top: o.mt ?? 50, bottom: o.mb ?? 50, left: o.ml ?? 110, right: o.mr ?? 110 },
      borders: o.bordes,
    });
  const tabla = (rows: Fila[], anchos: number[]): Tabla => new Table({
    rows, width: { size: anchos.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: anchos,
    layout: TableLayoutType.FIXED, borders: SIN_BORDES,
  });
  const fila = (cells: Celda[], alto?: number, encabezado?: boolean): Fila =>
    new TableRow({ children: cells, height: alto ? { value: alto, rule: HeightRule.ATLEAST } : undefined, cantSplit: true, tableHeader: encabezado });
  const espacio = (pt = 6) => p(t(''), { linea: pt * 20 });
  const vacia = (w: number) => celda(p(t('')), { w, bordes: SIN_BORDES });

  const banda = (titulo: string, subtitulo: string) => tabla([fila([
    celda([
      p(t('RED DE COLEGIOS MANO AMIGA  ·  PROGRAMA SOL', { pt: 7.5, b: true, c: 'C7D7EA', sp: 20 })),
      p(t(titulo, { pt: 16, b: true, c: 'FFFFFF' }), { antes: 20 }),
      p(t(subtitulo, { pt: 8.5, c: 'E2E8F0' }), { antes: 20 }),
    ], { w: 7300, fondo: Wc.navy, mt: 150, mb: 150, ml: 260 }),
    celda(p(t('')), { w: 900, fondo: Wc.mid }),
    celda(p(new ImageRun({ type: 'png', data: logo, transformation: { width: 118, height: Math.round(118 * 276 / 714) } }), { al: AlignmentType.RIGHT }), { w: 2600, fondo: Wc.orange, mr: 160 }),
  ], 1150)], [7300, 900, 2600]);
  const pieInst = (clave: string) => tabla([fila([
    celda(p(t(PIE, { pt: 8, i: true, c: 'FFFFFF' })), { w: 6800, fondo: Wc.navy, ml: 200 }),
    celda(p(new TextRun({ font: 'Calibri', size: 16, color: 'CBD5E1', children: [`${clave} · Pág. `, PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] }), { al: AlignmentType.RIGHT }), { w: 4000, fondo: Wc.navy, mr: 200 }),
  ], 380)], [6800, 4000]);
  const tarjetas = (items: { etiqueta: string; ancho: number; acento?: string; valor?: string; rojo?: boolean }[]) => {
    const sep = 160; const cols: number[] = []; const cells: Celda[] = [];
    items.forEach((it, i) => {
      if (i) { cols.push(sep); cells.push(vacia(sep)); }
      cols.push(it.ancho);
      cells.push(celda([
        p(t(it.etiqueta.toUpperCase(), { pt: 7, b: true, c: Wc.muted, sp: 10 })),
        p(it.valor ? t(it.valor, { pt: 11, b: true, c: it.rojo ? Wc.red : Wc.navy }) : t(' ', { pt: 13 }), { antes: 40 }),
      ], { w: it.ancho, mt: 70, mb: 80, bordes: { top: linea(it.acento ?? Wc.navy, 18), bottom: linea(), left: linea(), right: linea() } }));
    });
    return tabla([fila(cells, 620)], cols);
  };
  const tituloTarjeta = (texto: string, extra?: string) => p([t(texto.toUpperCase(), { pt: 9.5, b: true, c: Wc.navy, sp: 10 }), ...(extra ? [t(`   ${extra}`, { pt: 8.5, i: true, c: Wc.muted })] : [])], {
    fondo: Wc.slate100, antes: 160, despues: 80, sangria: 120, keepNext: true,
    borde: { left: { style: BorderStyle.SINGLE, size: 24, color: Wc.orange, space: 6 } },
  });
  const nota = (texto: string, o: { pt?: number; i?: boolean; c?: string; b?: boolean; antes?: number; despues?: number } = {}) =>
    p(t(texto, { pt: o.pt ?? 8.5, i: o.i ?? true, c: o.c ?? Wc.muted, b: o.b }), { antes: o.antes ?? 60, despues: o.despues ?? 40 });
  const th = (texto: string, w: number, izq = false) => celda(p(t(texto, { pt: 8, b: true, c: 'FFFFFF' }), { al: izq ? AlignmentType.LEFT : AlignmentType.CENTER }), { w, fondo: Wc.navy, bordes: { right: linea('2F5F8F') } });
  const firmas = (puestos: [string, string?][]) => {
    const sep = 300; const w = Math.floor((ANCHO - sep * (puestos.length - 1)) / puestos.length);
    const cols: number[] = [], cells: Celda[] = [];
    const d = linea('CBD5E1', 6, BorderStyle.DASHED);
    puestos.forEach(([nombre, puesto], i) => {
      if (i) { cols.push(sep); cells.push(vacia(sep)); }
      cols.push(w);
      cells.push(celda([
        p(t(' '), { linea: 760 }),
        p(t(nombre, { pt: 9, b: true, c: Wc.navy }), { al: AlignmentType.CENTER, borde: { top: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8', space: 3 } } }),
        p(t(puesto ?? '', { pt: 7.5, c: Wc.muted }), { al: AlignmentType.CENTER }),
      ], { w, bordes: { top: d, bottom: d, left: d, right: d }, mb: 90 }));
    });
    return tabla([fila(cells)], cols);
  };
  const lineaEscribir = (despues = 200) => p(t(''), { despues, borde: { bottom: linea('CBD5E1', 4) } });
  const seccion = (titulo: string, subtitulo: string, clave: string, children: (Parrafo | Tabla)[]) => ({
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1700, bottom: 900, left: 720, right: 720, header: 360, footer: 300 } } },
    headers: { default: new Header({ children: [banda(titulo, subtitulo)] }) },
    footers: { default: new Footer({ children: [pieInst(clave)] }) },
    children,
  });
  return { t, p, celda, tabla, fila, espacio, tarjetas, tituloTarjeta, nota, th, firmas, lineaEscribir, seccion, linea, TextRun, ShadingType, BorderStyle, AlignmentType };
}

/** Rangos del semáforo de la Bitácora del Guardián para N renglones (5 días). */
export function rangosGuardianes(renglones: number) {
  const total = renglones * 5;
  return { total, verde: Math.round((total * 85) / 100), amarillo: Math.round((total * 70) / 100) };
}

const COMP: Record<SolComponente, [string, string]> = { S: ['S  ·  SEGURIDAD', 'Cuidamos a todos'], O: ['O  ·  ORDEN', 'Cada cosa en su lugar'], L: ['L  ·  LIMPIEZA', 'Todo limpio, todo el día'] };

export async function generarGuardianes(op: { version: string; renglones: RenglonGuardian[] }): Promise<Blob> {
  const D = await import('docx');
  const { t, p, celda, tabla, fila, espacio, tarjetas, tituloTarjeta, nota, th, firmas, lineaEscribir, seccion, linea, TextRun, ShadingType, BorderStyle, AlignmentType } = piezasWord(D, await logoTarjeta());
  const n = op.renglones.length;
  const { total, verde, amarillo } = rangosGuardianes(n);
  const v = `v${op.version}`;
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  const b = { bottom: linea(), right: linea('EEF2F7') };

  // F07 · Bitácora semanal
  const filas7 = [fila([th('No.', 650), th('¿Cómo quedó nuestro salón hoy?', 6050, true), ...dias.map(d => th(d, 820))], 380, true)];
  let num = 0;
  for (const comp of ['S', 'O', 'L'] as SolComponente[]) {
    const lista = op.renglones.filter(r => r.tipo === comp);
    if (!lista.length) continue;
    filas7.push(fila([celda(p([t(COMP[comp][0], { pt: 9, b: true, c: 'FFFFFF' }), t(`      ${COMP[comp][1]}`, { pt: 8.5, i: true, c: 'FFFFFF' })]), { span: 7, fondo: Wc[comp] })], 320));
    for (const r of lista) {
      num++;
      filas7.push(fila([
        celda(p(t(String(num), { pt: 13, b: true, c: Wc[comp] }), { al: AlignmentType.CENTER }), { w: 650, bordes: b }),
        celda(p(t(r.texto, { pt: 11 })), { w: 6050, bordes: b }),
        ...dias.map((_, i) => celda(p(t('')), { w: 820, fondo: i % 2 ? Wc.captura2 : Wc.captura, bordes: b })),
      ], n > 12 ? 440 : 560));
    }
  }
  filas7.push(fila([
    celda(p([t('Palomitas del día', { pt: 10, b: true, c: Wc.navy }), t(`  (de ${n})`, { pt: 8, c: Wc.muted })], { al: AlignmentType.RIGHT }), { span: 2, fondo: Wc.slate100 }),
    ...dias.map(() => celda(p(t('')), { w: 820, fondo: Wc.slate100, bordes: { left: linea('FFFFFF') } })),
  ], 420));
  const chip = (titulo: string, sub: string, fondo: string) => celda([
    p(t(titulo, { pt: 9.5, b: true, c: 'FFFFFF' }), { al: AlignmentType.CENTER }),
    p(t(sub, { pt: 8.5, i: true, c: 'FFFFFF' }), { al: AlignmentType.CENTER }),
  ], { w: 3600, fondo });
  const semaforo = tabla([fila([
    chip(`VERDE   ${verde} a ${total}`, '¡Salón Guardián!', Wc.verde),
    chip(`AMARILLO   ${amarillo} a ${verde - 1}`, 'Vamos bien, a mejorar', Wc.ambar),
    chip(`ROJO   ${amarillo - 1} o menos`, 'Hagamos un plan como grupo', Wc.rojo),
  ], 520)], [3600, 3600, 3600]);
  const guardianesSemana = tabla([fila((['S', 'O', 'L'] as SolComponente[]).map(c => celda(p([
    new TextRun({ text: `  ${c}  `, font: 'Calibri', size: 22, bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, color: 'auto', fill: Wc[c] } }),
    t('  ' + '_'.repeat(24), { pt: 10, c: '94A3B8' }),
  ]), { w: 3600 })), 420)], [3600, 3600, 3600]);
  const datos = (clave: string, tercera: string) => tarjetas([
    { etiqueta: 'Campus', ancho: 3500 }, { etiqueta: 'Grupo', ancho: 2300 },
    { etiqueta: tercera, ancho: 2840, acento: Wc.orange }, { etiqueta: 'Clave', ancho: 1680, valor: `${clave} · ${v}`, rojo: true },
  ]);
  const f07 = [
    datos('SOL-F07', 'Semana del ____ al ____'),
    tituloTarjeta('Guardianes de la semana'),
    guardianesSemana,
    nota('Al final del día, los Guardianes revisan el salón con el grupo y ponen ✓ si se cumple o ✗ si falta.', { antes: 100, despues: 80 }),
    tabla(filas7, [650, 6050, 820, 820, 820, 820, 820]),
    p([t('Total de la semana:  ', { pt: 11, b: true, c: Wc.navy }), t('________', { pt: 11, c: '94A3B8' }), t(`  de ${total} palomitas`, { pt: 11, c: Wc.muted })], { antes: 140, despues: 100 }),
    semaforo,
    tituloTarjeta('¿Encontramos algo roto o peligroso?', '¿Qué y cuándo le avisamos al maestro(a)?'),
    lineaEscribir(220), lineaEscribir(160),
    espacio(10),
    firmas([['Firma de los Guardianes', 'S · O · L'], ['Firma del maestro(a) titular', 'Revisó la semana']]),
  ];

  // F08 · Concentrado trimestral
  const anchos8 = [1000, 1500, 1700, 1700, 1700, 1700, 1500];
  const filas8 = [fila([th('Semana', 1000), th(`Palomitas (de ${total})`, 1500), th('Semáforo V · A · R', 1700), th('Guardián S', 1700), th('Guardián O', 1700), th('Guardián L', 1700), th('Vo.Bo.', 1500)], 420, true)];
  for (let s = 1; s <= 13; s++) {
    filas8.push(fila([
      celda(p(t(String(s), { pt: 11, b: true, c: '94A3B8' }), { al: AlignmentType.CENTER }), { w: 1000, bordes: b }),
      ...anchos8.slice(1).map(w => celda(p(t('')), { w, fondo: s % 2 ? Wc.captura : Wc.captura2, bordes: b })),
    ], 560));
  }
  const f08 = [
    datos('SOL-F08', 'Trimestre'),
    nota('El maestro(a) titular pasa aquí el total de cada semana y quiénes fueron los Guardianes.', { antes: 160, despues: 100 }),
    tabla(filas8, anchos8),
    espacio(8),
    tabla([fila([
      celda(p([t('Promedio del trimestre:  ', { pt: 10.5, b: true, c: Wc.navy }), t('______', { c: '94A3B8' }), t(` de ${total}  =  `, { c: Wc.muted }), t('______', { c: '94A3B8' }), t(' %', { c: Wc.muted })]), { w: 5400, fondo: Wc.slate100, bordes: { left: { style: BorderStyle.SINGLE, size: 24, color: Wc.orange } } }),
      celda(p([t('Semáforo del trimestre:   ', { pt: 10.5, b: true, c: Wc.navy }), t('☐ Verde   ☐ Amarillo   ☐ Rojo', { pt: 10 })]), { w: 5400, fondo: Wc.slate100 }),
    ], 520)], [5400, 5400]),
    nota(`Este promedio cuenta para el reconocimiento Grupo Guardián SOL de fin de curso (promedio de los tres trimestres, mínimo 85% = ${verde} palomitas por semana).`, { antes: 120 }),
    espacio(14),
    firmas([['Firma del maestro(a) titular'], ['Vo.Bo. Coordinador(a) del Comité SOL']]),
  ];

  // F09 · Evaluación de Guardianes
  const filas9 = [fila([th('Nombre del Guardián', 3000, true), th('Semanas de guardia', 1150), th('Hizo su revisión cada día', 1500), th('Avisó a tiempo los riesgos', 1500), th('Fue ejemplo para su grupo', 1500), th('Total (de 6)', 1050), th('Propuesto', 1100)], 520, true)];
  for (let s = 1; s <= 13; s++) {
    filas9.push(fila([
      celda(p(t(`${s}.`, { pt: 10, b: true, c: '94A3B8' })), { w: 3000, bordes: b }),
      ...[1150, 1500, 1500, 1500].map(w => celda(p(t('')), { w, fondo: s % 2 ? Wc.captura : Wc.captura2, bordes: b })),
      celda(p(t('')), { w: 1050, fondo: Wc.slate100, bordes: b }),
      celda(p(t('☐', { pt: 13, c: Wc.navy }), { al: AlignmentType.CENTER }), { w: 1100, bordes: b }),
    ], 540));
  }
  const f09 = [
    datos('SOL-F09', 'Trimestre'),
    nota('Califica cada aspecto:  2 = Siempre   ·   1 = Casi siempre   ·   0 = Pocas veces', { antes: 160, despues: 100, i: false, b: true, c: Wc.navy, pt: 9.5 }),
    tabla(filas9, [3000, 1150, 1500, 1500, 1500, 1050, 1100]),
    tituloTarjeta('Guardián SOL del trimestre', 'Mayor total; en empate decide el maestro con el Comité SOL'),
    lineaEscribir(200),
    nota('Se entrega el reconocimiento Guardián SOL (SOL-F04) en honores o acto cívico al cierre del periodo de evaluación.', { antes: 120 }),
    espacio(14),
    firmas([['Firma del maestro(a) titular'], ['Vo.Bo. Coordinador(a) del Comité SOL']]),
  ];

  const doc = new D.Document({
    creator: 'Sistema RCMA', title: `Formatos Guardianes SOL ${v}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      seccion('BITÁCORA SEMANAL DEL GUARDIÁN SOL', `SOL-F07 · Se llena a mano cada día, al final de la jornada · Versión ${op.version}`, `SOL-F07 · ${v}`, f07),
      seccion('CONCENTRADO TRIMESTRAL DEL GRUPO', `SOL-F08 · Lo llena el maestro(a) titular cada viernes · Versión ${op.version}`, `SOL-F08 · ${v}`, f08),
      seccion('EVALUACIÓN DE GUARDIANES DEL TRIMESTRE', `SOL-F09 · Lo llena el maestro(a) titular al cierre del periodo · Versión ${op.version}`, `SOL-F09 · ${v}`, f09),
    ],
  });
  return D.Packer.toBlob(doc);
}

export async function generarVoluntariado(op: { version: string }): Promise<Blob> {
  const D = await import('docx');
  const { t, p, celda, tabla, fila, espacio, tarjetas, nota, firmas, seccion, linea, BorderStyle } = piezasWord(D, await logoTarjeta());
  const v = `v${op.version}`;
  const bloque = (titulo: string, sub: string, filas: [string, string][]) => {
    const rows = [fila([celda(p([t(titulo, { pt: 10, b: true, c: 'FFFFFF' }), t(`   ${sub}`, { pt: 8.5, i: true, c: 'DBE7F3' })]), { span: 2, fondo: Wc.navy, ml: 160 })], 380)];
    filas.forEach(([et, ayuda], i) => rows.push(fila([
      celda(p(t(et, { pt: 9.5, b: true, c: Wc.navy })), { w: 3300, fondo: Wc.slate100, ml: 160, bordes: { bottom: linea('FFFFFF', 8), left: { style: BorderStyle.SINGLE, size: 18, color: i % 2 ? Wc.orange : 'F5B27A' } } }),
      celda(p(t(ayuda, { pt: 9.5, c: Wc.muted })), { w: 7500, fondo: i % 2 ? Wc.captura2 : Wc.captura, bordes: { bottom: linea() } }),
    ], 470)));
    return tabla(rows, [3300, 7500]);
  };
  const children = [
    tarjetas([
      { etiqueta: 'Campus', ancho: 4100 }, { etiqueta: 'Ciclo escolar', ancho: 2500, valor: '20____ – 20____' },
      { etiqueta: 'Fecha de la jornada', ancho: 1700, acento: Wc.orange }, { etiqueta: 'Clave', ancho: 2020, valor: `SOL-V03 · ${v}`, rojo: true },
    ]),
    nota('Para empresas, universidades, escuelas u organizaciones que realizan una jornada de voluntariado en el campus. Se envía a la Coordinación RCMA en dos momentos: la sección A antes de la jornada, para preparar el reconocimiento Aliado SOL (SOL-V01) que se entrega ese mismo día, y la sección B al terminar. Convenios y documentos del aliado los resguarda el campus; no se envían.', { antes: 160, despues: 140, i: false, c: Wc.ink, pt: 9.5 }),
    bloque('A · AVISO', 'se envía al menos 5 días hábiles antes de la jornada', [
      ['Aliado', 'Nombre como debe aparecer en el reconocimiento:'],
      ['Tipo de aliado', '☐ Empresa    ☐ Universidad    ☐ Escuela    ☐ Organización civil    ☐ Otro'],
      ['Contacto del aliado (opcional)', 'Nombre / teléfono / correo:'],
      ['Fecha y horario', ''],
      ['Área(s) a intervenir', ''],
      ['Componentes', '☐ S · Seguridad    ☐ O · Orden    ☐ L · Limpieza'],
      ['Actividad', 'Ej. jornada de pintura y limpieza de patios:'],
      ['Hallazgos y tarjetas rojas a atender', 'Folios:'],
      ['Voluntarios esperados', ''],
      ['Responsable del campus que los recibe', 'Nombre y teléfono:'],
    ]),
    espacio(10),
    bloque('B · CIERRE', 'se envía dentro de los 5 días hábiles siguientes, con la liga a las fotos', [
      ['Voluntarios que participaron', ''],
      ['Horas de la jornada', ''],
      ['Hallazgos y tarjetas rojas atendidos', 'Folios:'],
      ['Reconocimiento SOL-V01 entregado', '☐ Sí    ☐ No'],
      ['Liga a fotos antes y después', ''],
      ['Observaciones', ''],
    ]),
    p([t('Seguridad:  ', { pt: 9, b: true, c: Wc.orange }), t('los voluntarios no realizan trabajos en altura, eléctricos, de gas, con maquinaria ni con químicos peligrosos; esos trabajos se solicitan con Ticket MAS. Mantener libres las rutas de evacuación durante toda la jornada.', { pt: 9 })], {
      fondo: 'FFF4EA', antes: 200, despues: 200, sangria: 140, borde: { left: { style: BorderStyle.SINGLE, size: 24, color: Wc.orange, space: 6 } },
    }),
    firmas([['Responsable del campus', 'Nombre y firma'], ['Director(a) del campus', 'Nombre y firma']]),
  ];
  const doc = new D.Document({
    creator: 'Sistema RCMA', title: `Registro de Jornada de Voluntariado SOL ${v}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [seccion('REGISTRO DE JORNADA DE VOLUNTARIADO SOL', `Formato SOL-V03 · Aliados del Programa SOL · Versión ${op.version}`, `SOL-V03 · ${v}`, children)],
  });
  return D.Packer.toBlob(doc);
}
