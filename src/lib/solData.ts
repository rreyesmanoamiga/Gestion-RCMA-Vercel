// src/lib/solData.ts — lecturas/escrituras del Programa SOL en Supabase.
// Toda escritura la hace solo el administrador (la base de datos lo exige por RLS).
import { supabase } from '@/lib/supabaseClient';
import {
  calcularIndice, cicloDe, trimestreDe, codigoCorto, siguienteFolio, sumarDias, normalizar,
  type ParsedSOL, type SolRespuesta, type SolInspeccion, type SolCriterio,
} from '@/lib/sol';

/** Trae todas las filas de una consulta en páginas de 1,000 (el límite por consulta de Supabase). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function traerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const PAG = 1000;
  const out: T[] = [];
  for (let i = 0; ; i += PAG) {
    const { data, error } = await consulta(i, i + PAG - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAG) break;
  }
  return out;
}

export async function fetchCriterios(soloActivos = true): Promise<SolCriterio[]> {
  let q = supabase.from('sol_criterios').select('*').order('numero');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SolCriterio[];
}

export async function buscarInspeccionExistente(colegio: string, fecha: string, tipo: string) {
  const { data } = await supabase.from('sol_inspecciones').select('id').eq('colegio', colegio).eq('fecha', fecha).eq('tipo', tipo).maybeSingle();
  return data?.id as string | undefined;
}

/** Recalcula y guarda los índices de una inspección a partir de sus respuestas. */
export function camposIndice(resps: Pick<SolRespuesta, 'area' | 'tipo' | 'calificacion' | 'na'>[]) {
  const c = calcularIndice(resps);
  return {
    indice: c.indice, indice_s: c.s, indice_o: c.o, indice_l: c.l, por_area: c.porArea,
    criterios_calificados: c.calificados, criterios_na: c.na,
  };
}

const sinId = (r: SolRespuesta, inspeccion_id: string) => ({
  inspeccion_id, criterio_numero: r.criterio_numero, area: r.area, tipo: r.tipo, texto: r.texto,
  calificacion: r.na ? null : r.calificacion, na: r.na, observacion: r.observacion, foto: r.foto,
});

export interface ResultadoImport {
  inspeccionId: string; reemplazada: boolean;
  hallazgosNuevos: number; hallazgosActualizados: number; hallazgosAuto: number;
  tarjetasNuevas: number; tarjetasActualizadas: number;
}

/** Guarda todo lo leído de un Excel SOL-F01. Si ya existía la inspección (campus + fecha + tipo), la reemplaza. */
export async function importarInspeccion(p: ParsedSOL, opts: { archivoUrl?: string | null; usuario?: string | null }): Promise<ResultadoImport> {
  if (!p.colegio || !p.fecha || !p.tipo) throw new Error('Faltan campus, fecha o tipo de inspección.');
  const colegio = p.colegio, fecha = p.fecha;
  const existente = await buscarInspeccionExistente(colegio, fecha, p.tipo);

  const cabecera = {
    colegio, territorio: p.territorio, fecha, tipo: p.tipo,
    ciclo: cicloDe(fecha), trimestre: trimestreDe(fecha),
    inspectores: p.inspectores || null, director: p.director || null, duenos: p.duenos,
    origen: 'excel' as const, version_formato: p.version || null,
    ...camposIndice(p.respuestas),
    updated_at: new Date().toISOString(),
    ...(opts.archivoUrl ? { archivo_url: opts.archivoUrl } : {}),
  };

  let inspeccionId: string;
  if (existente) {
    const { error } = await supabase.from('sol_inspecciones').update(cabecera).eq('id', existente);
    if (error) throw error;
    const { error: e2 } = await supabase.from('sol_respuestas').delete().eq('inspeccion_id', existente);
    if (e2) throw e2;
    inspeccionId = existente;
  } else {
    const { data, error } = await supabase.from('sol_inspecciones').insert({ ...cabecera, created_by: opts.usuario ?? null }).select('id').single();
    if (error) throw error;
    inspeccionId = data.id;
  }

  if (p.respuestas.length) {
    const { error } = await supabase.from('sol_respuestas').insert(p.respuestas.map(r => sinId(r, inspeccionId)));
    if (error) throw error;
  }

  const cc = codigoCorto(colegio);

  // ── Hallazgos ──
  let hExist = await traerTodo<{ id: string; folio: string | null; fecha: string; hallazgo: string; inspeccion_id: string | null; criterio_numero: number | null; estatus: string; ticket_mas_id: string | null }>(
    (a, b) => supabase.from('sol_hallazgos').select('id, folio, fecha, hallazgo, inspeccion_id, criterio_numero, estatus, ticket_mas_id').eq('colegio', colegio).range(a, b));
  const hFolios = hExist.map(h => h.folio);
  const ceros = new Set(p.respuestas.filter(r => r.tipo === 'S' && r.calificacion === 0).map(r => normalizar(r.area)));
  let hallazgosNuevos = 0, hallazgosActualizados = 0, hallazgosAuto = 0;
  const RANGO: Record<string, number> = { abierto: 0, en_proceso: 1, cerrado: 2 };

  if (p.hallazgos.length) {
    // Si antes se importó esta misma inspección con la hoja Hallazgos vacía, se habían creado
    // hallazgos automáticos desde los criterios. Ahora que la hoja trae los suyos, se quitan
    // esos automáticos que nadie ha trabajado (abiertos y sin Ticket) para no duplicar.
    const autos = hExist.filter(x => x.inspeccion_id === inspeccionId && x.criterio_numero !== null && x.estatus === 'abierto' && !x.ticket_mas_id);
    if (autos.length) {
      const { error } = await supabase.from('sol_hallazgos').delete().in('id', autos.map(x => x.id));
      if (error) throw error;
      const ids = new Set(autos.map(x => x.id));
      hExist = hExist.filter(x => !ids.has(x.id));
    }
    for (const h of p.hallazgos) {
      const f = h.fecha ?? fecha;
      const match = hExist.find(x => x.fecha === f && normalizar(x.hallazgo) === normalizar(h.hallazgo));
      if (match) {
        // Nunca se pierde lo que el administrador ya avanzó: el estatus solo sube
        // (abierto → en proceso → cerrado) y una celda vacía del Excel no borra datos.
        const upd: Record<string, unknown> = {};
        if (h.area) upd.area = h.area;
        if (h.tipo) upd.tipo = h.tipo;
        if (h.accion) upd.accion = h.accion;
        if (h.responsable) upd.responsable = h.responsable;
        if (h.fecha_compromiso) upd.fecha_compromiso = h.fecha_compromiso;
        if (h.folio_ticket) upd.folio_ticket_excel = h.folio_ticket;
        if ((RANGO[h.estatus] ?? 0) > (RANGO[match.estatus] ?? 0)) {
          upd.estatus = h.estatus;
          if (h.estatus === 'cerrado') upd.fecha_cierre = h.fecha_cierre ?? fecha;
        }
        if (Object.keys(upd).length) {
          const { error } = await supabase.from('sol_hallazgos').update(upd).eq('id', match.id);
          if (error) throw error;
        }
        hallazgosActualizados++;
      } else {
        const folio = siguienteFolio(hFolios, `${cc}-H-`); hFolios.push(folio);
        const { error } = await supabase.from('sol_hallazgos').insert({
          folio, colegio, territorio: p.territorio, inspeccion_id: inspeccionId, fecha: f, hallazgo: h.hallazgo,
          area: h.area, tipo: h.tipo, accion: h.accion, responsable: h.responsable, fecha_compromiso: h.fecha_compromiso,
          estatus: h.estatus, fecha_cierre: h.estatus === 'cerrado' ? (h.fecha_cierre ?? fecha) : null, folio_ticket_excel: h.folio_ticket,
          riesgo_grave: h.tipo === 'S' && !!h.area && ceros.has(normalizar(h.area)),
        });
        if (error) throw error;
        hallazgosNuevos++;
      }
    }
  } else {
    // El campus no llenó la hoja Hallazgos: se crean desde los criterios con 0 o 1 (Manual 8.3)
    const yaDeEsta = new Set(hExist.filter(x => x.inspeccion_id === inspeccionId).map(x => x.criterio_numero));
    const nuevos = p.respuestas.filter(r => !r.na && (r.calificacion === 0 || r.calificacion === 1) && !yaDeEsta.has(r.criterio_numero));
    const filas = nuevos.map(r => {
      const folio = siguienteFolio(hFolios, `${cc}-H-`); hFolios.push(folio);
      const grave = r.tipo === 'S' && r.calificacion === 0;
      return {
        folio, colegio, territorio: p.territorio, inspeccion_id: inspeccionId, criterio_numero: r.criterio_numero,
        fecha, area: r.area, tipo: r.tipo,
        hallazgo: r.observacion ? `${r.texto} — ${r.observacion}` : r.texto,
        fecha_compromiso: grave ? fecha : sumarDias(fecha, 30), estatus: 'abierto', riesgo_grave: grave,
      };
    });
    if (filas.length) {
      const { error } = await supabase.from('sol_hallazgos').insert(filas);
      if (error) throw error;
    }
    hallazgosAuto = filas.length;
  }

  // ── Tarjetas rojas ──
  const tExist = await traerTodo<{ id: string; folio: string | null; folio_excel: string | null; articulo: string; fecha: string; estatus: string }>(
    (a, b) => supabase.from('sol_tarjetas_rojas').select('id, folio, folio_excel, articulo, fecha, estatus').eq('colegio', colegio).range(a, b));
  const tFolios = tExist.map(t => t.folio);
  let tarjetasNuevas = 0, tarjetasActualizadas = 0;
  for (const t of p.tarjetas) {
    const tFecha = t.fecha ?? fecha;
    const match = tExist.find(x => normalizar(x.articulo) === normalizar(t.articulo)
      && ((t.folio_excel && x.folio_excel === t.folio_excel) || x.fecha === tFecha));
    if (match) {
      // Igual que en hallazgos: no se regresa a pendiente lo que el admin avanzó y las celdas vacías no borran datos.
      const upd: Record<string, unknown> = {};
      if (t.area) upd.area = t.area;
      if (t.cantidad !== null) upd.cantidad = t.cantidad;
      if (t.motivo) upd.motivo = t.motivo;
      if (t.destino) upd.destino = t.destino;
      if (t.responsable) upd.responsable = t.responsable;
      if (t.fecha_limite) upd.fecha_limite = t.fecha_limite;
      if (t.observaciones) upd.observaciones = t.observaciones;
      if (t.estatus === 'resuelto' && match.estatus !== 'resuelto') { upd.estatus = 'resuelto'; upd.fecha_resolucion = fecha; }
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('sol_tarjetas_rojas').update(upd).eq('id', match.id);
        if (error) throw error;
      }
      tarjetasActualizadas++;
    } else {
      const folio = siguienteFolio(tFolios, `${cc}-TR-`); tFolios.push(folio);
      const { error } = await supabase.from('sol_tarjetas_rojas').insert({
        folio, folio_excel: t.folio_excel, colegio, territorio: p.territorio, inspeccion_id: inspeccionId,
        fecha: tFecha, articulo: t.articulo, area: t.area, cantidad: t.cantidad, motivo: t.motivo, destino: t.destino,
        responsable: t.responsable, fecha_limite: t.fecha_limite ?? sumarDias(tFecha, 30), observaciones: t.observaciones,
        estatus: t.estatus, fecha_resolucion: t.estatus === 'resuelto' ? fecha : null,
      });
      if (error) throw error;
      tarjetasNuevas++;
    }
  }

  return { inspeccionId, reemplazada: !!existente, hallazgosNuevos, hallazgosActualizados, hallazgosAuto, tarjetasNuevas, tarjetasActualizadas };
}

/** Crea una inspección vacía (captura manual) con los criterios activos del catálogo. */
export async function crearInspeccionManual(args: { colegio: string; territorio: string | null; fecha: string; tipo: string; usuario?: string | null }): Promise<string> {
  const existente = await buscarInspeccionExistente(args.colegio, args.fecha, args.tipo);
  if (existente) return existente;
  const criterios = await fetchCriterios(true);
  const { data, error } = await supabase.from('sol_inspecciones').insert({
    colegio: args.colegio, territorio: args.territorio, fecha: args.fecha, tipo: args.tipo,
    ciclo: cicloDe(args.fecha), trimestre: trimestreDe(args.fecha), origen: 'manual', created_by: args.usuario ?? null,
  }).select('id').single();
  if (error) throw error;
  const filas = criterios.map(c => ({
    inspeccion_id: data.id, criterio_numero: c.numero, area: c.area, tipo: c.tipo, texto: c.texto,
    calificacion: null, na: false, observacion: null, foto: null,
  }));
  if (filas.length) {
    const { error: e2 } = await supabase.from('sol_respuestas').insert(filas);
    if (e2) throw e2;
  }
  return data.id;
}

/** Guarda las respuestas editadas de una inspección y recalcula su índice. */
export async function guardarRespuestas(insp: Pick<SolInspeccion, 'id'>, resps: SolRespuesta[], extra: Record<string, unknown> = {}) {
  const filas = resps.map(r => sinId(r, insp.id));
  const { error } = await supabase.from('sol_respuestas').upsert(filas, { onConflict: 'inspeccion_id,criterio_numero' });
  if (error) throw error;
  const { error: e2 } = await supabase.from('sol_inspecciones')
    .update({ ...camposIndice(resps), ...extra, updated_at: new Date().toISOString() }).eq('id', insp.id);
  if (e2) throw e2;
}

/** Crea los hallazgos que falten para los criterios con 0 o 1 de una inspección. */
export async function generarHallazgosFaltantes(insp: SolInspeccion, resps: SolRespuesta[]): Promise<number> {
  const hExist = await traerTodo<{ folio: string | null; inspeccion_id: string | null; criterio_numero: number | null }>(
    (a, b) => supabase.from('sol_hallazgos').select('folio, inspeccion_id, criterio_numero').eq('colegio', insp.colegio).range(a, b));
  const ya = new Set(hExist.filter(h => h.inspeccion_id === insp.id).map(h => h.criterio_numero));
  const folios = hExist.map(h => h.folio);
  const cc = codigoCorto(insp.colegio);
  const filas = resps
    .filter(r => !r.na && (r.calificacion === 0 || r.calificacion === 1) && !ya.has(r.criterio_numero))
    .map(r => {
      const folio = siguienteFolio(folios, `${cc}-H-`); folios.push(folio);
      const grave = r.tipo === 'S' && r.calificacion === 0;
      return {
        folio, colegio: insp.colegio, territorio: insp.territorio, inspeccion_id: insp.id, criterio_numero: r.criterio_numero,
        fecha: insp.fecha, area: r.area, tipo: r.tipo, hallazgo: r.observacion ? `${r.texto} — ${r.observacion}` : r.texto,
        fecha_compromiso: grave ? insp.fecha : sumarDias(insp.fecha, 30), estatus: 'abierto', riesgo_grave: grave,
      };
    });
  if (filas.length) {
    const { error } = await supabase.from('sol_hallazgos').insert(filas);
    if (error) throw error;
  }
  return filas.length;
}

/** Carpeta de OneDrive para los archivos SOL de un campus/ciclo. */
export const carpetaSOL = (colegio: string, ciclo: string, sub: string) =>
  `Programa SOL/${colegio.replace(/[/\\:*?"<>|]/g, '_')}/${ciclo}/${sub}`;
