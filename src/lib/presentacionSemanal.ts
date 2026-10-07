// ============================================================================
// Presentación semanal (Seguimiento Semanal de Proyectos)
//
// Toma la plantilla institucional (public/plantillas/Seguimiento_Semanal_RCMA.pptx)
// y la rellena con lo que ya vive en el sistema:
//   · Obras ........ un slide por proyecto con Seguimiento NEXUS activo, en el
//                    slide de su colegio (nombre, estatus, avance, comentarios de
//                    la semana y las 3 fotos más recientes del Expediente).
//   · Levantamiento  un slide por plantel que no ha cerrado (Comunicado–Fase 4),
//                    usando el slide de su fase.
//   · Cumplimiento . se deja tal cual viene en la plantilla (se llena a mano).
// Todo se hace en el navegador: la plantilla es un ZIP de XML, aquí se copian
// los slides de cada colegio y se cambian los textos y las fotos.
// ============================================================================
import JSZip from 'jszip';

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};
const T_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const T_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const T_NOTES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const CT_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
// PowerPoint rechaza el archivo si el ZIP trae entradas de carpeta vacías
const SIN_CARPETAS = { createFolders: false } as const;

// ── Datos de entrada ────────────────────────────────────────────────────────
export interface ComentarioSemana { fecha: string; texto: string; autor?: string | null }
export interface ProyectoSemana {
  id: string;
  colegio: string;               // clave COLEGIOS: 'MA MTY', 'OF. CDMX', 'CLIN COT'…
  nombre: string;
  estatus?: string | null;       // en_espera | en_proceso | pausado | completado | cancelado
  avance?: number | null;        // 0–100
  folio?: string | null;
  comentarios: ComentarioSemana[]; // todos, en orden cronológico
  concluido?: string | null;     // fecha de cierre si se completó dentro del corte semanal
}
export interface PlantelSemana {
  colegio_clave: string;
  colegio_nombre: string;
  fase: string;                  // COMUNICADO | FASE1 … FASE5
  fecha_inicio?: string | null;
  fecha_termino?: string | null;
  notas?: string | null;
}
export interface FotoSlide { bytes: Uint8Array; ext: 'jpg' | 'png'; ancho: number; alto: number }

export interface OpcionesPresentacion {
  plantilla: ArrayBuffer;
  semana: { numero: number; anio: number; inicio: Date; fin: Date };
  proyectos: ProyectoSemana[];
  planteles: PlantelSemana[];
  incluirSinProyecto: boolean;
  fotos?: (proyectoId: string) => Promise<FotoSlide[]>;
  progreso?: (msg: string) => void;
}

// ── Semana del reporte ──────────────────────────────────────────────────────
// La junta es los miércoles: el corte va del miércoles anterior (00:00) al
// miércoles del reporte (23:59), los dos incluidos. El número de semana es la
// semana ISO de ese miércoles.
export function semanaISO(fecha: Date) {
  const dia = fecha.getDay() || 7;                       // lunes = 1 … domingo = 7
  const miercoles = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - dia + 3);
  const d = new Date(Date.UTC(miercoles.getFullYear(), miercoles.getMonth(), miercoles.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - 3);
  const anio = d.getUTCFullYear();
  const numero = Math.ceil(((d.getTime() - Date.UTC(anio, 0, 1)) / 86400000 + 1) / 7);
  const inicio = new Date(miercoles.getFullYear(), miercoles.getMonth(), miercoles.getDate() - 7, 0, 0, 0, 0);
  const fin = new Date(miercoles.getFullYear(), miercoles.getMonth(), miercoles.getDate(), 23, 59, 59, 999);
  return { numero, anio, inicio, fin };
}

// ── Catálogos ───────────────────────────────────────────────────────────────
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (s: string) => sinAcentos(s).toUpperCase().replace(/\s+/g, ' ').trim();

/** Título del slide de la plantilla → clave del colegio */
const TITULO_COLEGIO: Record<string, string> = {
  'MA AGUASCALIENTES': 'MA AGS', 'MA GUADALAJARA': 'MA GDL', 'MA LEON': 'MA LEO',
  'MA VILLAS DE SAN JUAN': 'MA VSJ', 'MA MONTERREY': 'MA MTY', 'MA SANTA CATARINA': 'MA SCA',
  'MA LA CIMA': 'MA CIM', 'MA PIEDRAS NEGRAS': 'MA PIE', 'MA TORREON': 'MA TOR', 'MA TIJUANA': 'MA TIJ',
  'MA ACAPULCO': 'MA ACA', 'MA CONKAL': 'MA CON', 'MA CANCUN': 'MA CAN', 'MA ZOMEYUCAN': 'MA ZOM',
  'MA CHALCO': 'MA CHA', 'MA LERMA': 'MA LER', 'MA MORELIA': 'MA MOR', 'MA PUEBLA': 'MA PUE',
  'MA QUERETARO': 'MA QRO', 'MA TAPACHULA': 'MA TAP', 'OFICINAS MTY': 'OF. MTY', 'OFICINAS CDMX': 'OF. CDMX',
  'CLINICA COTIJA': 'CLIN COT', 'CLINICA LERMA': 'CLIN LER',
};
const TITULO_FASE: Record<string, string> = {
  'COMUNICADO INSTITUCIONAL': 'COMUNICADO', 'FASE 1': 'FASE1', 'FASE 2': 'FASE2', 'FASE 3': 'FASE3', 'FASE 4': 'FASE4',
};
const ORDEN_FASE = ['COMUNICADO', 'FASE1', 'FASE2', 'FASE3', 'FASE4'];
const ESTATUS: Record<string, string> = {
  en_espera: 'EN ESPERA', en_proceso: 'EN PROCESO', pausado: 'PAUSADO', completado: 'COMPLETADO', cancelado: 'CANCELADO',
};

// Colores para el texto ya capturado (la plantilla trae gris claro de "placeholder")
const COLOR_TITULO = '1B3A5C';
const COLOR_ESTADO = 'EB6C01';
const COLOR_TEXTO = '334155';

// ── Utilidades XML ──────────────────────────────────────────────────────────
const parsear = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const serializar = (doc: Document) => new XMLSerializer().serializeToString(doc);
const hijosNS = (el: Element | Document, ns: string, tag: string) => Array.from(el.getElementsByTagNameNS(ns, tag));

function textoDe(el: Element) {
  return hijosNS(el, NS.a, 't').map(t => t.textContent ?? '').join('');
}
/** Formas (sp/pic/grpSp) del primer nivel del árbol del slide */
function formas(doc: Document) {
  const arbol = hijosNS(doc, NS.p, 'spTree')[0];
  return Array.from(arbol.children) as Element[];
}
function nombreForma(el: Element) {
  return hijosNS(el, NS.p, 'cNvPr')[0]?.getAttribute('name') ?? '';
}
function forma(doc: Document, nombre: string) {
  return formas(doc).find(f => nombreForma(f) === nombre) ?? null;
}
function caja(el: Element) {
  const off = hijosNS(el, NS.a, 'off')[0];
  const ext = hijosNS(el, NS.a, 'ext').find(e => e.parentElement?.localName === 'xfrm');
  return {
    x: Number(off?.getAttribute('x') ?? 0), y: Number(off?.getAttribute('y') ?? 0),
    cx: Number(ext?.getAttribute('cx') ?? 0), cy: Number(ext?.getAttribute('cy') ?? 0),
  };
}

interface EstiloTexto { color?: string; italica?: boolean; tamano?: number }
/** Reemplaza el texto de una forma conservando el formato del primer renglón */
function ponerTexto(sp: Element | null, parrafos: string[], estilo: EstiloTexto = {}) {
  if (!sp) return;
  const doc = sp.ownerDocument;
  const cuerpo = hijosNS(sp, NS.p, 'txBody')[0];
  if (!cuerpo) return;
  const ps = hijosNS(cuerpo, NS.a, 'p');
  const pBase = ps[0];
  const pPr = hijosNS(pBase, NS.a, 'pPr')[0]?.cloneNode(true) as Element | undefined;
  const rPr = (hijosNS(pBase, NS.a, 'rPr')[0]?.cloneNode(true) as Element | undefined) ?? doc.createElementNS(NS.a, 'a:rPr');
  const fin = hijosNS(pBase, NS.a, 'endParaRPr')[0]?.cloneNode(true) as Element | undefined;
  if (estilo.color) {
    hijosNS(rPr, NS.a, 'solidFill').forEach(f => f.remove());
    const fill = doc.createElementNS(NS.a, 'a:solidFill');
    const clr = doc.createElementNS(NS.a, 'a:srgbClr');
    clr.setAttribute('val', estilo.color);
    fill.appendChild(clr);
    rPr.insertBefore(fill, rPr.firstChild);
  }
  if (estilo.italica !== undefined) rPr.setAttribute('i', estilo.italica ? '1' : '0');
  if (estilo.tamano) { rPr.setAttribute('sz', String(estilo.tamano)); fin?.setAttribute('sz', String(estilo.tamano)); }
  ps.forEach(p => p.remove());
  for (const linea of parrafos.length ? parrafos : ['']) {
    const p = doc.createElementNS(NS.a, 'a:p');
    if (pPr) p.appendChild(pPr.cloneNode(true));
    if (linea) {
      const r = doc.createElementNS(NS.a, 'a:r');
      r.appendChild(rPr.cloneNode(true));
      const t = doc.createElementNS(NS.a, 'a:t');
      t.textContent = limpiarTexto(linea);
      r.appendChild(t);
      p.appendChild(r);
    }
    if (fin) p.appendChild(fin.cloneNode(true));
    cuerpo.appendChild(p);
  }
}

/** Cambia "SEMANA 18 · 2025" / "Semana 18 · 2025" en cualquier texto del slide */
function ponerSemana(doc: Document, numero: number, anio: number) {
  for (const t of hijosNS(doc, NS.a, 't')) {
    const s = t.textContent ?? '';
    if (/semana\s+\d+\s*·\s*\d{4}/i.test(s)) {
      t.textContent = s.replace(/(semana)(\s+)\d+(\s*·\s*)\d{4}/i, (_m, w, e1, e2) => `${w}${e1}${numero}${e2}${anio}`);
    }
  }
}

// Quita caracteres que no se permiten en XML (controles pegados desde Word/WhatsApp)
const limpiarTexto = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
   .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
const recortar = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const fechaLarga = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// ── Paquete (presentation.xml, rels, content types) ─────────────────────────
interface SlideRef { rid: string; archivo: string }   // archivo: 'ppt/slides/slide3.xml'

class Paquete {
  pres!: Document; presRels!: Document; tipos!: Document;
  private siguienteSlide = 1000;
  private siguienteMedia = 1;
  constructor(public zip: JSZip) {}

  async cargar() {
    this.pres = parsear(await this.zip.file('ppt/presentation.xml')!.async('string'));
    this.presRels = parsear(await this.zip.file('ppt/_rels/presentation.xml.rels')!.async('string'));
    this.tipos = parsear(await this.zip.file('[Content_Types].xml')!.async('string'));
    const tiene = (ext: string) => hijosNS(this.tipos, NS.ct, 'Default').some(d => d.getAttribute('Extension')?.toLowerCase() === ext);
    for (const [ext, ct] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png']]) {
      if (!tiene(ext)) {
        const d = this.tipos.createElementNS(NS.ct, 'Default');
        d.setAttribute('Extension', ext); d.setAttribute('ContentType', ct);
        this.tipos.documentElement.insertBefore(d, this.tipos.documentElement.firstChild);
      }
    }
  }

  slides(): SlideRef[] {
    const rels = new Map(hijosNS(this.presRels, NS.rel, 'Relationship').map(r => [r.getAttribute('Id')!, r.getAttribute('Target')!]));
    return hijosNS(this.pres, NS.p, 'sldId').map(s => {
      const rid = s.getAttributeNS(NS.r, 'id')!;
      return { rid, archivo: 'ppt/' + rels.get(rid)!.replace(/^\.?\//, '') };
    });
  }

  async leer(archivo: string) { return parsear(await this.zip.file(archivo)!.async('string')); }
  relsDe(archivo: string) { return archivo.replace(/([^/]+)$/, '_rels/$1.rels'); }

  /** Crea un slide nuevo a partir del XML ya modificado de otro (sin notas) */
  private idsUsados = new Set<number>();
  async nuevoSlide(origen: string, doc: Document): Promise<{ archivo: string; rels: Document }> {
    const n = this.siguienteSlide++;
    // Cada copia necesita su propio identificador de diapositiva (si se repite, PowerPoint pide "Reparar")
    for (const c of Array.from(doc.getElementsByTagNameNS(NS_P14, 'creationId'))) {
      let v = 0;
      do { v = 1 + Math.floor(Math.random() * 2147483646); } while (this.idsUsados.has(v));
      this.idsUsados.add(v);
      c.setAttribute('val', String(v));
    }
    doc.documentElement.removeAttribute('show');   // las copias siempre visibles
    limpiarAnimaciones(doc);
    const archivo = `ppt/slides/slide${n}.xml`;
    const rels = parsear(await this.zip.file(this.relsDe(origen))!.async('string'));
    hijosNS(rels, NS.rel, 'Relationship').filter(r => r.getAttribute('Type') === T_NOTES).forEach(r => r.remove());
    const o = this.tipos.createElementNS(NS.ct, 'Override');
    o.setAttribute('PartName', '/' + archivo); o.setAttribute('ContentType', CT_SLIDE);
    this.tipos.documentElement.appendChild(o);
    this.zip.file(archivo, serializar(doc), SIN_CARPETAS);
    return { archivo, rels };
  }

  agregarMedia(bytes: Uint8Array, ext: string) {
    const nombre = `foto_semanal_${this.siguienteMedia++}.${ext}`;
    this.zip.file(`ppt/media/${nombre}`, bytes, SIN_CARPETAS);
    return `../media/${nombre}`;
  }

  /** Deja la presentación con exactamente estos slides, en este orden */
  ordenar(archivos: string[]) {
    const lista = hijosNS(this.pres, NS.p, 'sldIdLst')[0];
    const actuales = this.slides();
    const porArchivo = new Map(actuales.map(s => [s.archivo, s.rid]));
    const idPorRid = new Map(hijosNS(this.pres, NS.p, 'sldId').map(s => [s.getAttributeNS(NS.r, 'id')!, s.getAttribute('id')!]));
    let maxId = Math.max(256, ...hijosNS(this.pres, NS.p, 'sldId').map(s => Number(s.getAttribute('id'))));
    const relRaiz = this.presRels.documentElement;
    let maxRid = Math.max(0, ...hijosNS(this.presRels, NS.rel, 'Relationship').map(r => Number((r.getAttribute('Id') ?? '').replace(/\D/g, '')) || 0));

    // Quitar los que ya no van
    const quedan = new Set(archivos);
    for (const s of actuales) {
      if (quedan.has(s.archivo)) continue;
      hijosNS(this.presRels, NS.rel, 'Relationship').find(r => r.getAttribute('Id') === s.rid)?.remove();
      this.borrarSlide(s.archivo);
    }
    while (lista.firstChild) lista.removeChild(lista.firstChild);
    for (const archivo of archivos) {
      let rid = porArchivo.get(archivo);
      if (!rid) {
        rid = `rId${++maxRid}`;
        const r = this.presRels.createElementNS(NS.rel, 'Relationship');
        r.setAttribute('Id', rid); r.setAttribute('Type', T_SLIDE); r.setAttribute('Target', archivo.replace(/^ppt\//, ''));
        relRaiz.appendChild(r);
      }
      const s = this.pres.createElementNS(NS.p, 'p:sldId');
      s.setAttribute('id', idPorRid.get(rid) ?? String(++maxId));
      s.setAttributeNS(NS.r, 'r:id', rid);
      lista.appendChild(s);
    }
  }

  private borrarSlide(archivo: string) {
    const relsArchivo = this.relsDe(archivo);
    const quitarOverride = (parte: string) =>
      hijosNS(this.tipos, NS.ct, 'Override').filter(o => o.getAttribute('PartName') === '/' + parte).forEach(o => o.remove());
    // Las notas del slide se van con él
    const relsTxt = this.notasPendientes.get(archivo);
    if (relsTxt) {
      const notas = 'ppt/' + relsTxt.replace(/^\.\.\//, '');
      this.zip.remove(notas); this.zip.remove(this.relsDe(notas)); quitarOverride(notas);
    }
    this.zip.remove(archivo); this.zip.remove(relsArchivo); quitarOverride(archivo);
  }

  /** Mapa slide → notas, para poder borrarlas junto con el slide */
  notasPendientes = new Map<string, string>();
  async indexarNotas() {
    for (const s of this.slides()) {
      const rels = this.zip.file(this.relsDe(s.archivo));
      if (!rels) continue;
      const doc = parsear(await rels.async('string'));
      const n = hijosNS(doc, NS.rel, 'Relationship').find(r => r.getAttribute('Type') === T_NOTES);
      if (n) this.notasPendientes.set(s.archivo, n.getAttribute('Target')!);
    }
  }

  /** Quita el historial de cambios de coautoría (apunta a slides que ya no existen) */
  quitarHistorial() {
    for (const r of hijosNS(this.presRels, NS.rel, 'Relationship')) {
      if (!/changesInfo|revisionInfo/i.test(r.getAttribute('Type') ?? '')) continue;
      const parte = 'ppt/' + (r.getAttribute('Target') ?? '').replace(/^\.?\//, '');
      this.zip.remove(parte);
      hijosNS(this.tipos, NS.ct, 'Override').filter(o => o.getAttribute('PartName') === '/' + parte).forEach(o => o.remove());
      r.remove();
    }
  }

  async guardar(): Promise<Blob> {
    this.quitarHistorial();
    // Se arma un ZIP nuevo con [Content_Types].xml al principio, como lo escribe Office
    const salida = new JSZip();
    const sinCarpetas = { createFolders: false };
    salida.file('[Content_Types].xml', serializar(this.tipos), sinCarpetas);
    salida.file('_rels/.rels', await this.zip.file('_rels/.rels')!.async('uint8array'), sinCarpetas);
    const propios: Record<string, string> = {
      'ppt/presentation.xml': serializar(this.pres),
      'ppt/_rels/presentation.xml.rels': serializar(this.presRels),
    };
    for (const [ruta, txt] of Object.entries(propios)) salida.file(ruta, txt, sinCarpetas);
    const resto = Object.keys(this.zip.files).filter(n => !this.zip.files[n].dir && !(n in propios)
      && n !== '[Content_Types].xml' && n !== '_rels/.rels');
    for (const n of resto) salida.file(n, await this.zip.file(n)!.async('uint8array'), sinCarpetas);
    return salida.generateAsync({
      type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 },
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
}

/** Si una animación apunta a una forma que ya no existe, PowerPoint marca el archivo como
 *  dañado: en ese caso se quitan las animaciones de ese slide (el contenido queda igual). */
function limpiarAnimaciones(doc: Document) {
  const ids = new Set(hijosNS(doc, NS.p, 'cNvPr').map(c => c.getAttribute('id')));
  const huerfana = hijosNS(doc, NS.p, 'spTgt').some(t => !ids.has(t.getAttribute('spid')));
  if (huerfana) hijosNS(doc, NS.p, 'timing').forEach(t => t.remove());
}

// ── Fotos en las cajas "INSERTAR IMAGEN" ────────────────────────────────────
function cajasFoto(doc: Document) {
  return formas(doc).filter(f => f.localName === 'sp' && /^Shape \d+$/.test(nombreForma(f)) && (() => {
    const c = caja(f); return c.cx === 1962912 && c.cy === 1691640;
  })());
}
function dentro(el: Element, c: { x: number; y: number; cx: number; cy: number }) {
  const b = caja(el);
  return b.x >= c.x && b.y >= c.y && b.x <= c.x + c.cx && b.y <= c.y + c.cy;
}

function ponerFotos(doc: Document, rels: Document, fotos: FotoSlide[], paquete: Paquete) {
  const cajas = cajasFoto(doc).sort((a, b) => caja(a).x - caja(b).x);
  let maxId = Math.max(0, ...hijosNS(doc, NS.p, 'cNvPr').map(c => Number(c.getAttribute('id')) || 0));
  let maxRid = Math.max(0, ...hijosNS(rels, NS.rel, 'Relationship').map(r => Number((r.getAttribute('Id') ?? '').replace(/\D/g, '')) || 0));
  cajas.forEach((box, i) => {
    const foto = fotos[i];
    if (!foto) return;
    const c = caja(box);
    // Quitar el ícono y la leyenda "INSERTAR IMAGEN" de esa caja
    formas(doc).filter(f => f !== box && dentro(f, c) &&
      (f.localName === 'pic' || /INSERTAR IMAGEN/i.test(textoDe(f)))).forEach(f => f.remove());
    const rid = `rId${++maxRid}`;
    const r = rels.createElementNS(NS.rel, 'Relationship');
    r.setAttribute('Id', rid); r.setAttribute('Type', T_IMAGE); r.setAttribute('Target', paquete.agregarMedia(foto.bytes, foto.ext));
    rels.documentElement.appendChild(r);
    // Recorte para llenar la caja sin deformar la foto
    const rc = c.cx / c.cy, ri = foto.ancho / foto.alto;
    let l = 0, t = 0;
    if (ri > rc) l = Math.round(((1 - rc / ri) / 2) * 100000); else t = Math.round(((1 - ri / rc) / 2) * 100000);
    const xml =
      `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${++maxId}" name="Foto avance ${i + 1}"/>` +
      `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${rid}"/><a:srcRect l="${l}" t="${t}" r="${l}" b="${t}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="${c.x}" y="${c.y}"/><a:ext cx="${c.cx}" cy="${c.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `<a:ln w="12700"><a:solidFill><a:srgbClr val="A8C0D8"/></a:solidFill></a:ln></p:spPr></p:pic>`;
    const pic = doc.importNode(parsear(xml).documentElement, true);
    box.parentNode!.insertBefore(pic, box.nextSibling);
  });
}

// ── Textos del slide de obra ────────────────────────────────────────────────
function textoAvance(p: ProyectoSemana, inicio: Date, fin: Date): string[] {
  const deLaSemana = p.comentarios.filter(c => { const d = new Date(c.fecha); return d >= inicio && d <= fin; });
  const lineas: string[] = [];
  if (deLaSemana.length) {
    for (const c of deLaSemana.slice(-4)) lineas.push(`• ${fechaCorta(c.fecha)} — ${c.texto.replace(/\s+/g, ' ').trim()}`);
  } else if (p.comentarios.length) {
    const u = p.comentarios[p.comentarios.length - 1];
    lineas.push(`${p.concluido ? 'Proyecto concluido.' : 'Sin actualización esta semana.'} Último seguimiento (${fechaLarga(u.fecha)}): ${u.texto.replace(/\s+/g, ' ').trim()}`);
  } else {
    lineas.push(p.concluido ? 'Proyecto concluido esta semana.' : 'Sin actualizaciones registradas en el seguimiento de este proyecto.');
  }
  // La caja da para ~4 renglones: se recorta lo que no cabe
  let total = 0;
  const out: string[] = [];
  for (const l of lineas) {
    const resto = 420 - total;
    if (resto < 40) break;
    out.push(recortar(l, resto));
    total += Math.min(l.length, resto);
  }
  return out;
}

function llenarObra(doc: Document, p: ProyectoSemana | null, idx: number, de: number, semana: OpcionesPresentacion['semana']) {
  ponerSemana(doc, semana.numero, semana.anio);
  if (!p) {
    ensanchar(forma(doc, 'Text 10'), 3000000);
    ponerTexto(forma(doc, 'Text 10'), ['SIN PROYECTO ACTIVO']);
    ponerTexto(forma(doc, 'Text 13'), ['Sin proyecto activo esta semana'], { color: COLOR_TITULO });
    ponerTexto(forma(doc, 'Text 15'), ['—'], { color: COLOR_ESTADO });
    ponerTexto(forma(doc, 'Text 17'), [''], {});
    return;
  }
  const etiqueta = p.concluido ? 'PROYECTO CONCLUIDO' : 'PROYECTO ACTIVO';
  if (de > 1 || p.concluido) {
    ensanchar(forma(doc, 'Text 10'), 3000000);
    ponerTexto(forma(doc, 'Text 10'), [de > 1 ? `${etiqueta}  ·  ${idx} DE ${de}` : etiqueta]);
  }
  ensanchar(forma(doc, 'Text 15'), 5800000);
  ponerTexto(forma(doc, 'Text 13'), [recortar(p.nombre, 95)], { color: COLOR_TITULO });
  const estado = p.concluido
    ? `COMPLETADO  ·  100%  ·  CERRADO EL ${fechaLarga(p.concluido)}`
    : [ESTATUS[p.estatus ?? ''] ?? (p.estatus ?? '').toUpperCase(),
       p.avance != null ? `${Math.round(p.avance)}% DE AVANCE` : ''].filter(Boolean).join('  ·  ');
  ponerTexto(forma(doc, 'Text 15'), [estado || '—'], { color: COLOR_ESTADO });
  const lineas = textoAvance(p, semana.inicio, semana.fin);
  const largo = lineas.join(' ').length;
  ponerTexto(forma(doc, 'Text 17'), lineas, { color: COLOR_TEXTO, italica: false, tamano: largo > 260 ? 800 : 900 });
}

// ── Textos del slide de Levantamiento ───────────────────────────────────────
function llenarLevantamiento(doc: Document, pl: PlantelSemana, ubic: Ubicacion | undefined, semana: OpcionesPresentacion['semana']) {
  ponerSemana(doc, semana.numero, semana.anio);
  ponerTexto(forma(doc, 'Text 5'), [pl.colegio_nombre]);
  if (ubic) {
    ponerTexto(forma(doc, 'Text 9'), [ubic.ciudad]);
    if (ubic.pin) ponerPin(doc, ubic.pin);
  }
  // Los textos de la fase vienen en gris de "ejemplo": se pasan a color normal
  const act = forma(doc, 'Text 13');
  ponerTexto(act, [textoDe(act ?? doc.documentElement).trim()], { color: COLOR_TITULO });
  const est = forma(doc, 'Text 15');
  if (est) {
    const base = textoDe(est).trim();
    const fechas = [pl.fecha_inicio ? `Inicio ${fechaLarga(pl.fecha_inicio)}` : '', pl.fecha_termino ? `Término ${fechaLarga(pl.fecha_termino)}` : '']
      .filter(Boolean).join('  ·  ');
    ensanchar(est, 5800000);
    ponerTexto(est, [fechas ? `${base}  ·  ${fechas}` : base], { color: COLOR_ESTADO });
  }
  const desc = forma(doc, 'Text 17');
  const texto = pl.notas?.trim() ? pl.notas : textoDe(desc ?? doc.documentElement);
  ponerTexto(desc, [recortar(texto.replace(/\s+/g, ' ').trim(), 420)], { color: COLOR_TEXTO, italica: false });
}

interface Ubicacion { ciudad: string; pin: Element | null }

/** Ensancha una caja de texto (para que "1 DE 2" o las fechas no se partan) */
function ensanchar(sp: Element | null, cx: number) {
  const ext = sp ? hijosNS(sp, NS.a, 'ext').find(e => e.parentElement?.localName === 'xfrm') : null;
  if (ext && Number(ext.getAttribute('cx')) < cx) ext.setAttribute('cx', String(cx));
}

/** Pone el pin de ubicación del colegio (posición y tamaño copiados de su slide de obra).
 *  Se conserva el pin propio del slide (mismo id) porque la animación de entrada lo usa:
 *  si se cambia el id, PowerPoint marca el archivo como dañado. */
function ponerPin(doc: Document, pinOrigen: Element) {
  const actual = forma(doc, 'Group 45');
  if (!actual) return;
  const xfrmDe = (g: Element) => Array.from(g.children).find(c => c.localName === 'grpSpPr')
    ?.getElementsByTagNameNS(NS.a, 'xfrm')[0] ?? null;
  const destino = xfrmDe(actual), origen = xfrmDe(pinOrigen);
  if (destino && origen) destino.parentNode!.replaceChild(doc.importNode(origen, true), destino);
  // Al final del árbol para que quede encima del mapa (en los slides de fase venía debajo)
  const arbol = actual.parentNode!;
  arbol.removeChild(actual);
  arbol.appendChild(actual);
}

// ── Generador ───────────────────────────────────────────────────────────────
type Tipo =
  | { tipo: 'obra'; colegio: string }
  | { tipo: 'levantamiento'; fase: string }
  | { tipo: 'separador' }
  | { tipo: 'otro' };

function clasificar(doc: Document): Tipo {
  const insignia = normal(textoDe(forma(doc, 'Text 3') ?? doc.documentElement));
  const titulo = normal(textoDe(forma(doc, 'Text 4') ?? doc.documentElement));
  const esFicha = cajasFoto(doc).length > 0 && !!forma(doc, 'Text 13');
  if (esFicha && insignia.startsWith('LEVANT')) {
    const fase = Object.entries(TITULO_FASE).find(([k]) => titulo.startsWith(k))?.[1];
    if (fase) return { tipo: 'levantamiento', fase };
  }
  if (esFicha && TITULO_COLEGIO[titulo]) return { tipo: 'obra', colegio: TITULO_COLEGIO[titulo] };
  // Portadillas: fondo completo sin cajas, con "TERRITORIO", "PROYECTOS FMA", "CLÍNICAS", "LEVANTAMIENTO"…
  const todo = normal(hijosNS(doc, NS.a, 't').map(t => t.textContent ?? '').join(' '));
  if (/ZONA GEOGRAFICA|PROYECTOS FMA|FEDERACION MANO AMIGA|SERVICIOS DE SALUD|PROYECTO ESPECIAL|AVANCES DEL SISTEMA/.test(todo)) return { tipo: 'separador' };
  return { tipo: 'otro' };
}

export async function generarPresentacionSemanal(op: OpcionesPresentacion): Promise<Blob> {
  const aviso = op.progreso ?? (() => {});
  aviso('Abriendo plantilla…');
  const zip = await JSZip.loadAsync(op.plantilla);
  const paq = new Paquete(zip);
  await paq.cargar();
  await paq.indexarNotas();

  // 1) Leer la plantilla y clasificar cada slide
  const originales = paq.slides();
  const info: { ref: SlideRef; tipo: Tipo }[] = [];
  const ubicaciones = new Map<string, Ubicacion>();
  for (const ref of originales) {
    const doc = await paq.leer(ref.archivo);
    const tipo = clasificar(doc);
    info.push({ ref, tipo });
    if (tipo.tipo === 'obra') {
      ubicaciones.set(tipo.colegio, {
        ciudad: textoDe(forma(doc, 'Text 9') ?? doc.documentElement).trim(),
        pin: forma(doc, 'Group 45'),
      });
    }
  }

  // 2) Armar la lista final, sección por sección
  const porColegio = new Map<string, ProyectoSemana[]>();
  for (const p of op.proyectos) {
    const k = (p.colegio ?? '').trim();
    if (!porColegio.has(k)) porColegio.set(k, []);
    porColegio.get(k)!.push(p);
  }
  for (const lista of porColegio.values()) lista.sort((a, b) => Number(!!a.concluido) - Number(!!b.concluido));
  const ordenColegios = info.filter(i => i.tipo.tipo === 'obra').map(i => (i.tipo as { colegio: string }).colegio);
  const pendientesLev = op.planteles
    .filter(pl => ORDEN_FASE.includes(pl.fase))
    .sort((a, b) => ORDEN_FASE.indexOf(a.fase) - ORDEN_FASE.indexOf(b.fase)
      || ordenColegios.indexOf(a.colegio_clave) - ordenColegios.indexOf(b.colegio_clave)
      || a.colegio_nombre.localeCompare(b.colegio_nombre));
  const slideDeFase = new Map(info.filter(i => i.tipo.tipo === 'levantamiento').map(i => [(i.tipo as { fase: string }).fase, i.ref.archivo]));

  const final: string[] = [];
  let separador: { archivo: string; desde: number } | null = null;
  const cerrarSeccion = () => {
    // Una portadilla sin nada después (todos sus colegios sin proyecto) se quita
    if (separador && final.length === separador.desde + 1) final.pop();
    separador = null;
  };

  let hechos = 0;
  const totalFichas = op.proyectos.length + pendientesLev.length;
  let levantamientoHecho = false;

  for (const { ref, tipo } of info) {
    if (tipo.tipo === 'separador') {
      cerrarSeccion();
      final.push(ref.archivo);
      separador = { archivo: ref.archivo, desde: final.length - 1 };
      continue;
    }
    if (tipo.tipo === 'obra') {
      const lista = porColegio.get(tipo.colegio) ?? [];
      const instancias: (ProyectoSemana | null)[] = lista.length ? lista : (op.incluirSinProyecto ? [null] : []);
      for (let i = 0; i < instancias.length; i++) {
        const p = instancias[i];
        aviso(p ? `Proyecto ${++hechos} de ${totalFichas}: ${p.nombre}` : `Colegio sin proyecto: ${tipo.colegio}`);
        const doc = await paq.leer(ref.archivo);
        llenarObra(doc, p, i + 1, instancias.length, op.semana);
        const nuevo = await paq.nuevoSlide(ref.archivo, doc);
        if (p && op.fotos) {
          const fotos = await op.fotos(p.id).catch(() => [] as FotoSlide[]);
          if (fotos.length) { ponerFotos(doc, nuevo.rels, fotos, paq); limpiarAnimaciones(doc); }
          zip.file(nuevo.archivo, serializar(doc), SIN_CARPETAS);
        }
        zip.file(paq.relsDe(nuevo.archivo), serializar(nuevo.rels), SIN_CARPETAS);
        final.push(nuevo.archivo);
      }
      continue;
    }
    if (tipo.tipo === 'levantamiento') {
      if (levantamientoHecho) continue;          // los 5 slides de fase se reemplazan de una vez
      levantamientoHecho = true;
      for (const pl of pendientesLev) {
        const origen = slideDeFase.get(pl.fase);
        if (!origen) continue;
        aviso(`Levantamiento ${++hechos} de ${totalFichas}: ${pl.colegio_nombre}`);
        const doc = await paq.leer(origen);
        llenarLevantamiento(doc, pl, ubicaciones.get(pl.colegio_clave), op.semana);
        const nuevo = await paq.nuevoSlide(origen, doc);
        zip.file(paq.relsDe(nuevo.archivo), serializar(nuevo.rels), SIN_CARPETAS);
        final.push(nuevo.archivo);
      }
      continue;
    }
    // Portada, cumplimiento, cierre: se quedan, solo se actualiza la semana
    const doc = await paq.leer(ref.archivo);
    ponerSemana(doc, op.semana.numero, op.semana.anio);
    zip.file(ref.archivo, serializar(doc), SIN_CARPETAS);
    // El separador de Cumplimiento y lo que sigue ya no se quitan
    if (separador) separador = null;
    final.push(ref.archivo);
  }
  cerrarSeccion();

  aviso('Armando el archivo…');
  paq.ordenar(final);
  return paq.guardar();
}
