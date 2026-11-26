// src/lib/solCampo.ts
// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA SOL EN CAMPO (celular): Recorrido SOL y Voluntariado SOL.
//
//   · Borradores en el celular (IndexedDB): si se va la señal o se cierra la
//     app, el recorrido se retoma donde se quedó, con todo y fotos.
//   · Fotos: se comprimen en el celular (máx. 1600 px) y se suben al OneDrive
//     de la Coordinación (Programa SOL / campus / ciclo / Recorridos).
//   · Informes en PDF (jsPDF) con el formato institucional y las fotos.
//   · Diplomas en PDF para compartir por WhatsApp o correo.
//   · Avisos por correo (función sol-notificaciones).
// ─────────────────────────────────────────────────────────────────────────────
import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from '@/lib/supabaseClient';
import { subirArchivoOneDrive } from '@/hooks/useSharePointUpload';
import { logoCuadradoDataURL } from '@/lib/logoPdf';
import { FIRMA_RCMA_SRC, FIRMA_RCMA_PROPORCION } from '@/lib/firmaRcma';
import {
  SOL_AREAS, SOL_COMPONENTES, calcularIndice, cicloDe, fechaLarga, fechaCorta, fmtIndice, nivelSOL, NIVEL_META, tipoLabel,
  htmlDiplomas, type SolCriterio, type SolComponente, type DatosDiploma, type OpcionesDiploma,
} from '@/lib/sol';
import { carpetaSOL } from '@/lib/solData';

// ── Tipos ────────────────────────────────────────────────────────────────────
export type Resultado = 'cumple' | 'parcial' | 'no_cumple' | 'na';
export const RESULTADOS: { key: Resultado; label: string; corto: string; activo: string; pdf: [number, number, number] }[] = [
  { key: 'cumple',    label: '✓ Cumple',    corto: 'Cumple',    activo: 'bg-emerald-600 text-white border-emerald-600', pdf: [22, 128, 61] },
  { key: 'parcial',   label: '◐ Parcial',   corto: 'Parcial',   activo: 'bg-amber-500 text-white border-amber-500',     pdf: [217, 119, 6] },
  { key: 'no_cumple', label: '✗ No',        corto: 'No cumple', activo: 'bg-red-600 text-white border-red-600',         pdf: [200, 30, 30] },
  { key: 'na',        label: '— N/A',       corto: 'No aplica', activo: 'bg-slate-500 text-white border-slate-500',     pdf: [120, 130, 145] },
];
export const resultadoDeCalif = (c: 0 | 1 | 2 | null, na: boolean): Resultado | null =>
  na ? 'na' : c === 2 ? 'cumple' : c === 1 ? 'parcial' : c === 0 ? 'no_cumple' : null;
export const califDeResultado = (r: Resultado | null): { calificacion: 0 | 1 | 2 | null; na: boolean } =>
  r === 'na' ? { calificacion: null, na: true } : { calificacion: r === 'cumple' ? 2 : r === 'parcial' ? 1 : r === 'no_cumple' ? 0 : null, na: false };

export interface Foto { id: string; blob: Blob; thumb: string; url?: string; nombre: string }
export interface Evaluacion { resultado: Resultado | null; observacion: string; fotos: Foto[] }
export interface Extra extends Evaluacion { id: string; area: string; texto: string }
export interface TarjetaCampo { id: string; area: string; articulo: string; cantidad: string; ubicacion: string; motivo: string; destino: string; observaciones: string; fotos: Foto[] }
export interface GuardianCampo { id: string; nivel: string; grupo: string; promedio: string; fotos: Foto[] }
export interface CriterioInfra { numero: number; texto: string }

export const AREA_INFRA = 'Infraestructura';
export const AREA_GUARDIANES = 'Guardianes SOL';
export const MOTIVOS_TR = ['Roto', 'Obsoleto', 'Innecesario', 'Duplicado', 'Peligroso'];
export const DESTINOS_TR = ['Reparar', 'Reubicar', 'Donar', 'Vender', 'Desechar'];

export interface BorradorRecorrido {
  id: string; clase: 'recorrido';
  creado: string; actualizado: string;
  colegio: string; colegioNombre: string; territorio: string | null;
  tipo: string; fecha: string; hora_inicio: string; hora_fin?: string;
  elaboro_nombre: string; elaboro_puesto: string; acompanante: string; director: string; administrador: string;
  criterios: SolCriterio[]; infra: CriterioInfra[];
  respuestas: Record<number, Evaluacion>;
  infraestructura: Record<number, Evaluacion>;
  extras: Extra[]; tarjetas: TarjetaCampo[]; guardianes: GuardianCampo[];
  omitidas: string[]; observaciones: string;
  firmas: { elaboro?: string; acompanante?: string };
  paso: number;
  enviado?: { id: string; folio: string; pdf_url: string | null; hallazgos: number; tarjetas: number };
}

// ── Borradores en el celular ─────────────────────────────────────────────────
let dbp: Promise<IDBPDatabase> | null = null;
const base = () => (dbp ??= openDB('sol-campo', 1, {
  upgrade(db) { if (!db.objectStoreNames.contains('borradores')) db.createObjectStore('borradores', { keyPath: 'id' }); },
}));
export async function guardarBorrador<T extends { id: string; actualizado: string }>(b: T): Promise<void> {
  b.actualizado = new Date().toISOString();
  await (await base()).put('borradores', b);
}
export async function leerBorradores<T>(clase: string): Promise<T[]> {
  const todos = await (await base()).getAll('borradores') as ({ clase: string; actualizado: string } & T)[];
  return todos.filter(b => b.clase === clase).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}
export async function borrarBorrador(id: string): Promise<void> { await (await base()).delete('borradores', id); }

export const nuevoId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const horaActual = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

// ── Fotos ────────────────────────────────────────────────────────────────────
async function redimensionar(file: Blob, lado: number, calidad: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return await new Promise((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad));
}
const aDataURL = (b: Blob) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(b); });

/** Comprime la foto de la cámara: la grande para OneDrive y una miniatura para pantalla y PDF. */
export async function prepararFoto(file: File): Promise<Foto> {
  const [grande, chica] = await Promise.all([redimensionar(file, 1600, 0.82), redimensionar(file, 520, 0.7)]);
  return { id: nuevoId(), blob: grande, thumb: await aDataURL(chica), nombre: file.name || 'foto.jpg' };
}

const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 40);

/** Sube a OneDrive las fotos que aún no tienen liga; avisa el avance y guarda cada liga en el borrador. */
export async function subirFotosPendientes(fotos: Foto[], carpeta: string, prefijo: string, avance: (hechas: number, total: number) => void, alGuardar: () => Promise<void>) {
  const pendientes = fotos.filter(f => !f.url);
  let hechas = 0;
  avance(0, pendientes.length);
  for (const f of pendientes) {
    f.url = await subirArchivoOneDrive(f.blob, carpeta, `${prefijo}_${limpio(f.id.slice(0, 8))}.jpg`);
    hechas++;
    avance(hechas, pendientes.length);
    await alGuardar();
  }
}

/** Todas las fotos de un recorrido, con un prefijo legible para su nombre en OneDrive. */
export function fotosDeRecorrido(b: BorradorRecorrido): { foto: Foto; prefijo: string }[] {
  const out: { foto: Foto; prefijo: string }[] = [];
  for (const [n, e] of Object.entries(b.respuestas)) e.fotos.forEach((f, i) => out.push({ foto: f, prefijo: `C${n}_${i + 1}` }));
  for (const [n, e] of Object.entries(b.infraestructura)) e.fotos.forEach((f, i) => out.push({ foto: f, prefijo: `INF${n}_${i + 1}` }));
  b.extras.forEach((x, k) => x.fotos.forEach((f, i) => out.push({ foto: f, prefijo: `EXTRA${k + 1}_${i + 1}` })));
  b.tarjetas.forEach((x, k) => x.fotos.forEach((f, i) => out.push({ foto: f, prefijo: `TR${k + 1}_${i + 1}` })));
  b.guardianes.forEach((x, k) => x.fotos.forEach((f, i) => out.push({ foto: f, prefijo: `F08_${limpio(x.grupo || String(k + 1))}_${i + 1}` })));
  return out;
}

export const carpetaRecorrido = (b: Pick<BorradorRecorrido, 'colegio' | 'fecha' | 'id'>) =>
  carpetaSOL(b.colegio, cicloDe(b.fecha), `Recorridos/${b.fecha}_${b.id.slice(0, 6)}`);

// ── Validación y cálculo ─────────────────────────────────────────────────────
export const areasDelRecorrido = (b: Pick<BorradorRecorrido, 'criterios'>) =>
  SOL_AREAS.filter(a => b.criterios.some(c => c.area === a));

export interface Faltante { area: string; texto: string }
export function faltantes(b: BorradorRecorrido): Faltante[] {
  const out: Faltante[] = [];
  for (const c of b.criterios) {
    if (b.omitidas.includes(c.area)) continue;
    const e = b.respuestas[c.numero];
    if (!e?.resultado) out.push({ area: c.area, texto: `Sin calificar: ${c.texto}` });
    else if ((e.resultado === 'parcial' || e.resultado === 'no_cumple') && !e.observacion.trim() && !e.fotos.length)
      out.push({ area: c.area, texto: `Falta comentario o foto: ${c.texto}` });
  }
  if (!b.omitidas.includes(AREA_INFRA)) {
    for (const c of b.infra) {
      const e = b.infraestructura[c.numero];
      if (!e?.resultado) out.push({ area: AREA_INFRA, texto: `Sin calificar: ${c.texto}` });
      else if ((e.resultado === 'parcial' || e.resultado === 'no_cumple') && !e.observacion.trim() && !e.fotos.length)
        out.push({ area: AREA_INFRA, texto: `Falta comentario o foto: ${c.texto}` });
    }
  }
  for (const x of b.extras) if (!x.texto.trim() || !x.resultado) out.push({ area: x.area || 'Concepto extra', texto: 'Concepto extra sin descripción o sin calificar' });
  for (const t of b.tarjetas) if (!t.articulo.trim()) out.push({ area: t.area || 'Tarjeta roja', texto: 'Tarjeta roja sin artículo' });
  for (const g of b.guardianes) if (!g.nivel || !g.grupo.trim()) out.push({ area: AREA_GUARDIANES, texto: 'Concentrado sin nivel o grupo' });
  return out;
}

export function calculoRecorrido(b: BorradorRecorrido) {
  const resps = b.criterios.filter(c => !b.omitidas.includes(c.area)).map(c => {
    const e = b.respuestas[c.numero];
    const { calificacion, na } = califDeResultado(e?.resultado ?? null);
    return { area: c.area, tipo: c.tipo as SolComponente, calificacion, na };
  });
  const calc = calcularIndice(resps);
  const infraEval = b.omitidas.includes(AREA_INFRA) ? [] : b.infra.map(c => b.infraestructura[c.numero]?.resultado).filter(Boolean) as Resultado[];
  const infraCalif = infraEval.filter(r => r !== 'na');
  const bajos = (e?: Evaluacion) => e?.resultado === 'parcial' || e?.resultado === 'no_cumple';
  const hallazgos = b.criterios.filter(c => !b.omitidas.includes(c.area) && bajos(b.respuestas[c.numero])).length
    + (b.omitidas.includes(AREA_INFRA) ? 0 : b.infra.filter(c => bajos(b.infraestructura[c.numero])).length)
    + b.extras.filter(x => bajos(x)).length;
  const fotos = fotosDeRecorrido(b).length;
  return { calc, infraCumple: infraCalif.filter(r => r === 'cumple').length, infraTotal: infraCalif.length, hallazgos, fotos };
}

/** Lo que se manda a sol_registrar_recorrido (fotos ya con su liga de OneDrive). */
export function payloadRecorrido(b: BorradorRecorrido) {
  const urls = (fs: Foto[]) => fs.map(f => f.url).filter(Boolean);
  return {
    borrador_id: b.id, colegio: b.colegio, fecha: b.fecha, tipo: b.tipo,
    hora_inicio: b.hora_inicio, hora_fin: b.hora_fin ?? horaActual(),
    elaboro_nombre: b.elaboro_nombre, elaboro_puesto: b.elaboro_puesto, acompanante: b.acompanante,
    director: b.director, administrador: b.administrador, observaciones: b.observaciones, areas_omitidas: b.omitidas,
    respuestas: b.criterios.filter(c => !b.omitidas.includes(c.area)).map(c => {
      const e = b.respuestas[c.numero];
      return { criterio_numero: c.numero, ...califDeResultado(e?.resultado ?? null), observacion: e?.observacion ?? '', fotos: urls(e?.fotos ?? []) };
    }),
    infraestructura: b.omitidas.includes(AREA_INFRA) ? [] : b.infra.map(c => {
      const e = b.infraestructura[c.numero];
      return { numero: c.numero, texto: c.texto, resultado: e?.resultado ?? null, observacion: e?.observacion ?? '', fotos: urls(e?.fotos ?? []) };
    }),
    extras: b.extras.map(x => ({ area: x.area, texto: x.texto, resultado: x.resultado, observacion: x.observacion, fotos: urls(x.fotos) })),
    tarjetas: b.tarjetas.map(t => ({ area: t.area, articulo: t.articulo, cantidad: t.cantidad, ubicacion: t.ubicacion, motivo: t.motivo, destino: t.destino, observaciones: t.observaciones, fotos: urls(t.fotos) })),
    guardianes: b.guardianes.map(g => ({ nivel: g.nivel, grupo: g.grupo, promedio: g.promedio, fotos: urls(g.fotos) })),
    firmas: b.firmas,
  };
}

// ── Avisos por correo ────────────────────────────────────────────────────────
export async function notificarSOL(accion: string, id: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('sol-notificaciones', { body: { accion, id } });
    if (error) console.warn('[sol-notificaciones]', error.message);
  } catch (e) { console.warn('[sol-notificaciones]', e); }
}

// ── PDF institucional ────────────────────────────────────────────────────────
type Doc = InstanceType<typeof import('jspdf').jsPDF>;
const NAVY: [number, number, number] = [30, 41, 59];
const ORANGE: [number, number, number] = [237, 113, 2];
const GRIS: [number, number, number] = [100, 116, 139];
const LINEA: [number, number, number] = [214, 220, 228];

let logoCache: string | null | undefined;
async function logoDataURL(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const img = new Image();
    img.src = '/logo.png';
    await img.decode();
    logoCache = logoCuadradoDataURL(img);
  } catch { logoCache = null; }
  return logoCache;
}

/** Hoja carta vertical con encabezado azul marino, folio en naranja y pie con paginación. */
class Hoja {
  doc: Doc; y = 0; readonly W = 215.9; readonly H = 279.4; readonly M = 14;
  constructor(doc: Doc, private titulo: string, private folio: string, private logo: string | null) { this.doc = doc; this.encabezado(); }
  encabezado() {
    const d = this.doc;
    d.setFillColor(...NAVY); d.rect(0, 0, this.W, 24, 'F');
    d.setFillColor(...ORANGE); d.rect(0, 24, this.W, 1.4, 'F');
    if (this.logo) { d.setFillColor(255, 255, 255); d.roundedRect(this.M, 3.5, 17, 17, 2, 2, 'F'); d.addImage(this.logo, 'PNG', this.M + 1, 4.5, 15, 15); }
    d.setTextColor(253, 186, 116); d.setFont('helvetica', 'bold'); d.setFontSize(7.5);
    d.text('COORDINACIÓN DE OBRAS Y MANTENIMIENTO RCMA · PROGRAMA SOL', this.M + 21, 9.5);
    d.setTextColor(255, 255, 255); d.setFontSize(14); d.text(this.titulo, this.M + 21, 17);
    d.setTextColor(...ORANGE); d.setFontSize(10); d.text(this.folio, this.W - this.M, 17, { align: 'right' });
    this.y = 32;
  }
  espacio(alto: number) { if (this.y + alto > this.H - 16) { this.doc.addPage(); this.encabezado(); } }
  seccion(t: string) {
    this.espacio(14);
    const d = this.doc;
    d.setFillColor(...NAVY); d.rect(this.M, this.y, this.W - 2 * this.M, 7, 'F');
    d.setFillColor(...ORANGE); d.rect(this.M, this.y, 1.6, 7, 'F');
    d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold'); d.setFontSize(9);
    d.text(t.toUpperCase(), this.M + 4, this.y + 4.9);
    this.y += 10;
  }
  texto(t: string, o: { tam?: number; color?: [number, number, number]; negrita?: boolean; sangria?: number } = {}) {
    const d = this.doc;
    const fuente = () => { d.setFont('helvetica', o.negrita ? 'bold' : 'normal'); d.setFontSize(o.tam ?? 8.5); d.setTextColor(...(o.color ?? [30, 30, 30])); };
    fuente();
    const ancho = this.W - 2 * this.M - (o.sangria ?? 0);
    const lineas = d.splitTextToSize(t, ancho) as string[];
    const alto = lineas.length * (o.tam ?? 8.5) * 0.42 + 1;
    this.espacio(alto);
    fuente(); // el encabezado de una hoja nueva cambia la fuente
    d.text(lineas, this.M + (o.sangria ?? 0), this.y + 3);
    this.y += alto;
  }
  datos(filas: [string, string, string?, string?][]) {
    const d = this.doc; const ancho = this.W - 2 * this.M; const et = 30; const col = ancho / 2;
    for (const f of filas) {
      this.espacio(7);
      const pares: [string, string, number, number][] = f.length > 2 && f[2] !== undefined
        ? [[f[0], f[1], this.M, col], [f[2]!, f[3] ?? '', this.M + col, col]] : [[f[0], f[1], this.M, ancho]];
      for (const [k, v, x, w] of pares) {
        d.setDrawColor(...LINEA); d.setFillColor(241, 245, 249); d.rect(x, this.y, et, 6.5, 'FD');
        d.setFillColor(255, 255, 255); d.rect(x + et, this.y, w - et, 6.5, 'FD');
        d.setFont('helvetica', 'bold'); d.setFontSize(7.5); d.setTextColor(...NAVY); d.text(k, x + 1.5, this.y + 4.3);
        d.setFont('helvetica', 'normal'); d.setTextColor(30, 30, 30);
        d.text((d.splitTextToSize(v || '—', w - et - 3) as string[])[0], x + et + 1.5, this.y + 4.3);
      }
      this.y += 6.5;
    }
    this.y += 3;
  }
  tarjetas(items: { valor: string; etiqueta: string; color: [number, number, number] }[]) {
    this.espacio(20);
    const d = this.doc; const gap = 3; const w = (this.W - 2 * this.M - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const x = this.M + i * (w + gap);
      d.setDrawColor(...LINEA); d.setFillColor(255, 255, 255); d.rect(x, this.y, w, 17, 'FD');
      d.setFillColor(...it.color); d.rect(x, this.y, w, 1.6, 'F');
      d.setFont('helvetica', 'bold'); d.setFontSize(15); d.setTextColor(...NAVY); d.text(it.valor, x + w / 2, this.y + 10, { align: 'center' });
      d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...GRIS); d.text(it.etiqueta, x + w / 2, this.y + 14.5, { align: 'center' });
    });
    this.y += 21;
  }
  tabla(cab: string[], anchos: number[], filas: { celdas: string[]; fondo?: [number, number, number]; color?: [number, number, number] }[]) {
    const d = this.doc; const total = this.W - 2 * this.M; const k = total / anchos.reduce((a, b) => a + b, 0); const ws = anchos.map(a => a * k);
    const fila = (celdas: string[], cabecera: boolean, fondo?: [number, number, number], color?: [number, number, number]) => {
      d.setFont('helvetica', cabecera ? 'bold' : 'normal'); d.setFontSize(cabecera ? 7 : 7.5);
      const lineas = celdas.map((c, i) => d.splitTextToSize(c || '—', ws[i] - 3) as string[]);
      const alto = Math.max(...lineas.map(l => l.length)) * 3.3 + 2.6;
      this.espacio(alto);
      d.setFont('helvetica', cabecera ? 'bold' : 'normal'); d.setFontSize(cabecera ? 7 : 7.5);
      let x = this.M;
      lineas.forEach((l, i) => {
        d.setDrawColor(...LINEA);
        if (cabecera) d.setFillColor(...NAVY); else d.setFillColor(...(fondo ?? [255, 255, 255] as [number, number, number]));
        d.rect(x, this.y, ws[i], alto, 'FD');
        d.setTextColor(...(cabecera ? [255, 255, 255] as [number, number, number] : (i === 0 && color ? color : [30, 30, 30] as [number, number, number])));
        d.text(l, x + 1.5, this.y + 3.6);
        x += ws[i];
      });
      this.y += alto;
    };
    fila(cab, true);
    for (const f of filas) fila(f.celdas, false, f.fondo, f.color);
    this.y += 3;
  }
  fotos(thumbs: string[], alto = 30) {
    if (!thumbs.length) return;
    const d = this.doc; const w = alto * 4 / 3; const gap = 2.5; const porFila = Math.floor((this.W - 2 * this.M + gap) / (w + gap));
    for (let i = 0; i < thumbs.length; i += porFila) {
      this.espacio(alto + 3);
      thumbs.slice(i, i + porFila).forEach((t, j) => {
        try { d.addImage(t, 'JPEG', this.M + j * (w + gap), this.y, w, alto, undefined, 'FAST'); } catch { /* foto dañada */ }
      });
      this.y += alto + 3;
    }
  }
  firmas(items: { titulo: string; nombre: string; puesto: string; img?: string | null; proporcion?: number }[]) {
    this.espacio(40);
    const d = this.doc; const gap = 6; const w = (this.W - 2 * this.M - gap * (items.length - 1)) / items.length;
    items.forEach((f, i) => {
      const x = this.M + i * (w + gap);
      d.setFont('helvetica', 'bold'); d.setFontSize(7); d.setTextColor(...ORANGE); d.text(f.titulo, x + w / 2, this.y + 3, { align: 'center' });
      if (f.img) {
        const h = 15, ww = Math.min(w - 6, h * (f.proporcion ?? 2.5));
        try { d.addImage(f.img, 'PNG', x + w / 2 - ww / 2, this.y + 6, ww, h); } catch { /* firma dañada */ }
      }
      d.setDrawColor(...NAVY); d.line(x + 4, this.y + 23, x + w - 4, this.y + 23);
      d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...NAVY); d.text(f.nombre || '—', x + w / 2, this.y + 27, { align: 'center' });
      d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(...GRIS); d.text(f.puesto, x + w / 2, this.y + 31, { align: 'center' });
    });
    this.y += 36;
  }
  pies(nota: string) {
    const d = this.doc; const n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setDrawColor(...ORANGE); d.setLineWidth(0.5); d.line(this.M, this.H - 11, this.W - this.M, this.H - 11); d.setLineWidth(0.2);
      d.setFont('helvetica', 'bold'); d.setFontSize(7); d.setTextColor(...NAVY); d.text('COORDINACIÓN DE OBRAS Y MANTENIMIENTO RCMA', this.M, this.H - 7);
      d.setFont('helvetica', 'normal'); d.setTextColor(...GRIS); d.text(`Página ${i} de ${n}`, this.W - this.M, this.H - 7, { align: 'right' });
      d.setFontSize(6.5); d.text(nota, this.M, this.H - 4);
    }
  }
}

const colorNivel = (v: number | null): [number, number, number] => {
  const hex = NIVEL_META[nivelSOL(v)].hex.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
};

export interface HallazgoPDF { folio: string | null; area: string | null; hallazgo: string; fecha_compromiso: string | null; riesgo_grave: boolean; cuenta_sol?: boolean }
export interface TarjetaPDF { folio: string | null; area: string | null; articulo: string; cantidad: number | null; destino: string | null; fecha_limite: string | null }

/** Informe del Recorrido SOL (se arma en el celular con las miniaturas de las fotos). */
export async function informeRecorridoPDF(b: BorradorRecorrido, folio: string, hallazgos: HallazgoPDF[], tarjetas: TarjetaPDF[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const h = new Hoja(doc, 'INFORME DE RECORRIDO SOL', folio, await logoDataURL());
  const { calc, infraCumple, infraTotal } = calculoRecorrido(b);

  h.datos([
    ['Colegio', b.colegioNombre, 'Territorio', b.territorio ?? '—'],
    ['Fecha', `${fechaCorta(b.fecha)} · ${b.hora_inicio}–${b.hora_fin ?? ''}`, 'Tipo', tipoLabel(b.tipo)],
    ['Elaboró', `${b.elaboro_nombre}${b.elaboro_puesto ? ` (${b.elaboro_puesto})` : ''}`, 'Acompañó', b.acompanante],
    ['Director(a)', b.director, 'Administrador(a)', b.administrador],
  ]);

  h.seccion('Resultado');
  h.tarjetas([
    { valor: fmtIndice(calc.indice), etiqueta: 'Índice SOL', color: colorNivel(calc.indice) },
    ...SOL_COMPONENTES.map(c => {
      const v = c.key === 'S' ? calc.s : c.key === 'O' ? calc.o : calc.l;
      return { valor: fmtIndice(v), etiqueta: c.label, color: colorNivel(v) };
    }),
    { valor: infraTotal ? `${infraCumple}/${infraTotal}` : '—', etiqueta: 'Infraestructura *', color: [148, 163, 184] },
  ]);
  const areas = areasDelRecorrido(b);
  h.tabla(['Área', 'Índice', 'Semáforo', 'Hallazgos'], [60, 18, 30, 18], areas.map(a => {
    const omitida = b.omitidas.includes(a);
    const v = omitida ? null : calc.porArea[a] ?? null;
    return { celdas: [a, omitida ? '—' : fmtIndice(v), omitida ? 'No se recorrió' : NIVEL_META[nivelSOL(v)].corto, String(hallazgos.filter(x => x.area === a).length)] };
  }));

  const ordenados = [...hallazgos].sort((x, y) => Number(y.riesgo_grave) - Number(x.riesgo_grave) || String(x.folio).localeCompare(String(y.folio)));
  if (ordenados.length || tarjetas.length) {
    h.seccion('Prioridades');
    h.tabla(['Folio', 'Área', 'Hallazgo', 'Compromiso'], [22, 30, 100, 22], [
      ...ordenados.map(x => ({
        celdas: [x.folio ?? '', x.area ?? '', x.hallazgo, x.riesgo_grave ? 'Hoy' : fechaCorta(x.fecha_compromiso)],
        fondo: x.riesgo_grave ? [254, 242, 242] as [number, number, number] : undefined,
        color: x.riesgo_grave ? [200, 30, 30] as [number, number, number] : undefined,
      })),
      ...tarjetas.map(t => ({ celdas: [t.folio ?? '', t.area ?? '', `Tarjeta roja: ${t.articulo}${t.cantidad ? ` × ${t.cantidad}` : ''}${t.destino ? ` · destino: ${t.destino}` : ''}`, fechaCorta(t.fecha_limite)] })),
    ]);
  }

  h.seccion('Detalle por área');
  const etiqueta = (r: Resultado | null) => RESULTADOS.find(x => x.key === r)?.corto ?? 'Sin calificar';
  for (const a of areas) {
    h.texto(`${a}${b.omitidas.includes(a) ? ' · no se recorrió' : ` · ${fmtIndice(calc.porArea[a] ?? null)}`}`, { negrita: true, tam: 9.5, color: NAVY });
    if (b.omitidas.includes(a)) continue;
    for (const c of b.criterios.filter(x => x.area === a)) {
      const e = b.respuestas[c.numero];
      h.texto(`${c.tipo} · ${c.texto} — ${etiqueta(e?.resultado ?? null)}${e?.observacion ? `. ${e.observacion}` : ''}`,
        { sangria: 3, color: e?.resultado === 'no_cumple' ? [200, 30, 30] : e?.resultado === 'parcial' ? [180, 95, 5] : [30, 30, 30] });
      h.fotos((e?.fotos ?? []).map(f => f.thumb), 26);
    }
    for (const x of b.extras.filter(z => z.area === a)) {
      h.texto(`Concepto extra · ${x.texto} — ${etiqueta(x.resultado)}${x.observacion ? `. ${x.observacion}` : ''}`, { sangria: 3, color: [30, 64, 120] });
      h.fotos(x.fotos.map(f => f.thumb), 26);
    }
    for (const t of b.tarjetas.filter(z => z.area === a)) {
      h.texto(`Tarjeta roja · ${t.articulo}${t.cantidad ? ` × ${t.cantidad}` : ''}${t.ubicacion ? ` (${t.ubicacion})` : ''} · ${t.motivo || '—'} · destino: ${t.destino || '—'}${t.observaciones ? `. ${t.observaciones}` : ''}`, { sangria: 3, color: [200, 30, 30] });
      h.fotos(t.fotos.map(f => f.thumb), 26);
    }
  }
  const extrasSinArea = b.extras.filter(z => !areas.includes(z.area as typeof areas[number]));
  const tarjetasSinArea = b.tarjetas.filter(z => !areas.includes(z.area as typeof areas[number]));
  if (extrasSinArea.length || tarjetasSinArea.length) {
    h.texto('Otras áreas', { negrita: true, tam: 9.5, color: NAVY });
    for (const x of extrasSinArea) { h.texto(`Concepto extra · ${x.area ? `${x.area}: ` : ''}${x.texto} — ${etiqueta(x.resultado)}${x.observacion ? `. ${x.observacion}` : ''}`, { sangria: 3 }); h.fotos(x.fotos.map(f => f.thumb), 26); }
    for (const t of tarjetasSinArea) { h.texto(`Tarjeta roja · ${t.articulo} · ${t.motivo || '—'} · destino: ${t.destino || '—'}`, { sangria: 3, color: [200, 30, 30] }); h.fotos(t.fotos.map(f => f.thumb), 26); }
  }

  if (!b.omitidas.includes(AREA_INFRA) && b.infra.length) {
    h.seccion('Infraestructura *');
    for (const c of b.infra) {
      const e = b.infraestructura[c.numero];
      h.texto(`${c.texto} — ${etiqueta(e?.resultado ?? null)}${e?.observacion ? `. ${e.observacion}` : ''}`,
        { sangria: 3, color: e?.resultado === 'no_cumple' ? [200, 30, 30] : e?.resultado === 'parcial' ? [180, 95, 5] : [30, 30, 30] });
      h.fotos((e?.fotos ?? []).map(f => f.thumb), 26);
    }
  }

  if (b.guardianes.length) {
    h.seccion('Guardianes SOL · concentrado SOL-F08');
    for (const g of b.guardianes) {
      h.texto(`${g.nivel} ${g.grupo} — promedio de ${g.promedio || '—'} palomitas por semana`, { sangria: 3 });
      h.fotos(g.fotos.map(f => f.thumb), 34);
    }
  }

  if (b.observaciones.trim()) { h.seccion('Observaciones'); h.texto(b.observaciones); }

  h.seccion('Firmas');
  h.firmas([
    { titulo: 'ELABORÓ', nombre: b.elaboro_nombre, puesto: b.elaboro_puesto || 'Mano Amiga Servicios', img: b.firmas.elaboro },
    { titulo: 'ACOMPAÑÓ POR EL COLEGIO', nombre: b.acompanante, puesto: b.colegioNombre, img: b.firmas.acompanante },
  ]);
  h.texto(`Director(a): ${b.director || '—'} · Administrador(a): ${b.administrador || '—'}`, { color: GRIS, tam: 7.5 });

  h.pies('* Infraestructura y conceptos extra no cuentan en el Índice SOL ni en el ranking. Índice = puntos ÷ puntos posibles × 100.');
  return doc.output('blob');
}

// ── Voluntariado ─────────────────────────────────────────────────────────────
export const ACTIVIDADES_VOL = ['Pintura', 'Jardinería', 'Limpieza', 'Orden'];
export const REGLAS_VOL = [
  'Sin contacto con alumnos y sin tomar fotos ni videos de alumnos.',
  'Solo en las áreas y el horario autorizados.',
  'Rutas de evacuación, salidas y extintores siempre libres.',
  'Sin alcohol, tabaco, vapeadores ni objetos peligrosos.',
  'Nada en altura, eléctrico ni de gas: eso va con Ticket MAS.',
];
export interface FotoJornada { url: string; nombre: string; momento: 'antes' | 'despues'; thumb?: string }

export interface JornadaPDF {
  folio: string; colegioNombre: string; aliado: string; tipoAliado: string; fecha: string; horario: string;
  actividades: string[]; voluntarios: number | null; horas: number | null; responsable: string; acepta: string;
  hallazgos: { folio: string | null; hallazgo: string }[]; notas: string; creado: string;
  fotos: { thumb: string; momento: 'antes' | 'despues' }[];
  reglasFirma?: string | null; recibeFirma?: string | null;
}

export async function informeJornadaPDF(j: JornadaPDF): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const h = new Hoja(doc, 'INFORME DE JORNADA DE VOLUNTARIADO', j.folio, await logoDataURL());
  h.datos([
    ['Colegio', j.colegioNombre, 'Fecha', `${fechaCorta(j.fecha)} · ${j.horario}`],
    ['Aliado', j.aliado, 'Tipo', j.tipoAliado],
    ['Actividades', j.actividades.join(', '), 'Registró', j.creado],
  ]);
  const hv = (j.voluntarios ?? 0) * (j.horas ?? 0);
  h.seccion('Resultado');
  h.tarjetas([
    { valor: String(j.voluntarios ?? '—'), etiqueta: 'Voluntarios', color: [30, 64, 120] },
    { valor: String(j.horas ?? '—'), etiqueta: 'Horas', color: [30, 64, 120] },
    { valor: (Math.round(hv * 10) / 10).toLocaleString('es-MX'), etiqueta: 'Horas-voluntario', color: [22, 128, 61] },
    { valor: String(j.hallazgos.length), etiqueta: 'Hallazgos atendidos', color: ORANGE },
  ]);
  if (j.hallazgos.length) {
    h.seccion('Hallazgos atendidos (se cerraron)');
    h.tabla(['Folio', 'Hallazgo'], [22, 130], j.hallazgos.map(x => ({ celdas: [x.folio ?? '', x.hallazgo] })));
  }
  for (const m of ['antes', 'despues'] as const) {
    const fs = j.fotos.filter(f => f.momento === m);
    if (!fs.length) continue;
    h.seccion(m === 'antes' ? 'Fotos del antes' : 'Fotos del después');
    h.fotos(fs.map(f => f.thumb), 34);
  }
  if (j.notas.trim()) { h.seccion('Observaciones'); h.texto(j.notas); }
  h.seccion('Reglas de seguridad y conducta');
  REGLAS_VOL.forEach(r => h.texto(`• ${r}`, { sangria: 2 }));
  h.firmas([
    { titulo: 'ACEPTÓ LAS REGLAS POR EL ALIADO', nombre: j.acepta, puesto: j.aliado, img: j.reglasFirma },
    { titulo: 'RECIBIÓ POR EL COLEGIO', nombre: j.responsable, puesto: j.colegioNombre, img: j.recibeFirma },
  ]);
  h.pies('Voluntariado SOL · Programa Seguridad, Orden y Limpieza · Colegios Mano Amiga.');
  return doc.output('blob');
}

// ── Diploma en PDF (para compartir) ──────────────────────────────────────────
/** Convierte el diploma (HTML con su fondo institucional) en un PDF carta horizontal. */
export async function diplomaPDF(d: DatosDiploma, opc: OpcionesDiploma = {}): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const html = htmlDiplomas(d, opc);
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;left:-12000px;top:0;width:1056px;height:816px;border:0;';
  document.body.appendChild(marco);
  try {
    const docu = marco.contentDocument!;
    docu.open(); docu.write(html); docu.close();
    await new Promise(r => setTimeout(r, 300));
    await Promise.all(Array.from(docu.images).map(i => (i.complete ? Promise.resolve() : new Promise(ok => { i.onload = ok; i.onerror = ok; }))));
    try { await (docu as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* sin fuentes web */ }
    const pagina = docu.querySelector('.pg') as HTMLElement;
    const canvas = await html2canvas(pagina, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1056, height: 816, windowWidth: 1056, windowHeight: 816 });
    const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'landscape' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 11, 8.5);
    return pdf.output('blob');
  } finally { marco.remove(); }
}

/** Comparte un archivo (WhatsApp, correo…) con el menú del celular; si no se puede, lo descarga. */
export async function compartirArchivo(blob: Blob, nombre: string, texto: string): Promise<'compartido' | 'descargado'> {
  const archivo = new File([blob], nombre, { type: blob.type || 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [archivo] })) {
    try { await nav.share({ files: [archivo], title: nombre, text: texto }); return 'compartido'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'compartido'; }
  }
  descargarBlob(blob, nombre);
  return 'descargado';
}
export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Firma del Coordinador para colocar en PDFs hechos con jsPDF. */
export const FIRMA_COORDINADOR = { src: FIRMA_RCMA_SRC, proporcion: FIRMA_RCMA_PROPORCION };
export { fechaLarga };
