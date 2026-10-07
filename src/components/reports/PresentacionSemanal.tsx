// Botón + ventana para generar la Presentación Semanal (.pptx) desde Reportes.
// Junta los datos del sistema y se los pasa a generarPresentacionSemanal().
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Presentation, X, Loader2, Save, FolderOpen } from 'lucide-react';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import {
  generarPresentacionSemanal, semanaISO,
  type ProyectoSemana, type PlantelSemana, type FotoSlide,
} from '@/lib/presentacionSemanal';

const PLANTILLA_URL = '/plantillas/Seguimiento_Semanal_RCMA.pptx';

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fechaDeInput = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** Carpeta en OneDrive (dentro de "Sistema RCMA Doc"): Presentaciones Semanales / año / mes del miércoles del reporte */
const carpetaOneDrive = (miercoles: Date) =>
  `Presentaciones Semanales/${miercoles.getFullYear()}/${String(miercoles.getMonth() + 1).padStart(2, '0')} - ${MESES[miercoles.getMonth()]}`;
const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

function base64ABytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aFotosSlide(lista: { id?: string; tipo: string; base64: string }[]) {
  const fotos: (FotoSlide & { id?: string })[] = [];
  for (const f of lista) {
    try {
      const bytes = base64ABytes(f.base64);
      const bmp = await createImageBitmap(new Blob([bytes], { type: f.tipo }));
      fotos.push({ id: f.id, bytes, ext: /png/i.test(f.tipo) ? 'png' : 'jpg', ancho: bmp.width, alto: bmp.height });
      bmp.close();
    } catch { /* imagen que no se pudo leer: se omite */ }
  }
  return fotos;
}

/** Fotos de la diapositiva: primero las que se pegaron en los comentarios de la semana
 *  (NEXUS) y después, hasta completar 3, las del Expediente en OneDrive. */
async function fotosDeProyecto(p: ProyectoSemana, inicio: Date, fin: Date): Promise<FotoSlide[]> {
  const idsSemana = p.comentarios
    .filter(c => { const d = new Date(c.fecha); return d >= inicio && d <= fin; })
    .flatMap(c => c.fotos ?? []).reverse().slice(0, 3);
  let fotos: (FotoSlide & { id?: string })[] = [];
  if (idsSemana.length) {
    const { data } = await supabase.functions.invoke('nexus-fotos', { body: { accion: 'base64', ids: idsSemana } });
    const porId = new Map(((data?.fotos ?? []) as { id: string; tipo: string; base64: string }[]).map(f => [f.id, f]));
    fotos = await aFotosSlide(idsSemana.map(id => porId.get(id)).filter(Boolean) as { id: string; tipo: string; base64: string }[]);
  }
  if (fotos.length < 3 && !p.esPendiente) {
    const { data, error } = await supabase.functions.invoke('proyecto-fotos', {
      // En proyectos concluidos se priorizan las fotos de "Después"
      body: { proyecto_id: p.id, modo: 'presentacion', max: 3 + fotos.length, prioridad: p.concluido ? 'despues' : 'reciente' },
    });
    if (!error && !data?.error) {
      const ya = new Set(fotos.map(f => f.id));
      const extra = ((data?.fotos ?? []) as { id?: string; tipo: string; base64: string }[]).filter(f => !f.id || !ya.has(f.id));
      fotos = [...fotos, ...(await aFotosSlide(extra.slice(0, 3 - fotos.length)))];
    }
  }
  return fotos.slice(0, 3);
}

async function cargarDatos(inicio: Date, fin: Date) {
  // Activos + los que se completaron dentro del corte (miércoles a miércoles)
  const { data: segs, error: e1 } = await supabase.from('nexus_seguimientos')
    .select('id, proyecto_id, proyecto_nombre, colegio, estatus, completado_at').in('estatus', ['activo', 'completado']);
  if (e1) throw new Error('No se pudieron leer los seguimientos: ' + e1.message);
  type Seg = { id: string; proyecto_id: string | null; proyecto_nombre?: string; colegio?: string; estatus: string; completado_at?: string | null };
  const todos = (segs ?? []) as Seg[];
  const idsProy = [...new Set(todos.map(s => s.proyecto_id).filter(Boolean))] as string[];

  const [{ data: proys, error: e2 }, { data: coms, error: e3 }, { data: pls, error: e4 }] = await Promise.all([
    idsProy.length
      ? supabase.from('projects').select('id, name, status, progress, colegio, folio, completado_at').in('id', idsProy)
      : Promise.resolve({ data: [], error: null }),
    todos.length
      ? supabase.from('nexus_comentarios').select('seguimiento_id, contenido, autor_nombre, created_at, fotos')
          .in('seguimiento_id', todos.map(s => s.id)).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('levantamiento_planteles').select('colegio_clave, colegio_nombre, fase, fecha_inicio, fecha_termino, notas'),
  ]);
  if (e2) throw new Error('No se pudieron leer los proyectos: ' + e2.message);
  if (e3) throw new Error('No se pudieron leer los comentarios: ' + e3.message);
  if (e4) throw new Error('No se pudo leer Levantamiento: ' + e4.message);

  const proyPorId = new Map((proys ?? []).map((p: any) => [p.id, p]));
  const enCorte = (f?: string | null) => { if (!f) return false; const d = new Date(f); return d >= inicio && d <= fin; };
  const fechaCierre = (s: Seg) => s.completado_at ?? (proyPorId.get(s.proyecto_id!) as any)?.completado_at ?? null;
  const seguimientos = todos.filter(s => s.estatus === 'activo' || enCorte(fechaCierre(s)));
  const proyectos: ProyectoSemana[] = seguimientos
    .filter(s => s.proyecto_id && proyPorId.has(s.proyecto_id))
    .map(s => {
      const p: any = proyPorId.get(s.proyecto_id!);
      return {
        id: p.id,
        colegio: p.colegio ?? s.colegio ?? '',
        nombre: p.name ?? s.proyecto_nombre ?? 'Proyecto',
        estatus: p.status, avance: p.progress, folio: p.folio,
        concluido: s.estatus === 'completado' ? fechaCierre(s) : null,
        comentarios: (coms ?? []).filter((c: any) => c.seguimiento_id === s.id)
          .map((c: any) => ({ fecha: c.created_at, texto: c.contenido ?? '', autor: c.autor_nombre, fotos: (c.fotos ?? []).map((f: any) => f.id) })),
      };
    })
    .filter(p => p.estatus !== 'cancelado');

  // Pendientes NEXUS marcados "Presentar en la semanal" (aún sin ticket)
  const { data: pends, error: e5 } = await supabase.from('nexus_pendientes')
    .select('id, titulo, descripcion, prioridad, fecha_limite, estatus, colegio')
    .eq('presentar_semanal', true).in('estatus', ['pendiente', 'en_proceso']);
  if (e5) throw new Error('No se pudieron leer los pendientes: ' + e5.message);
  const listaPend = (pends ?? []).filter((p: any) => p.colegio);
  const { data: comsPend, error: e6 } = listaPend.length
    ? await supabase.from('nexus_comentarios').select('pendiente_id, contenido, autor_nombre, created_at, fotos')
        .in('pendiente_id', listaPend.map((p: any) => p.id)).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (e6) throw new Error('No se pudieron leer los comentarios de pendientes: ' + e6.message);
  for (const p of listaPend as any[]) {
    proyectos.push({
      id: 'pend:' + p.id, colegio: p.colegio, nombre: p.titulo ?? 'Pendiente',
      estatus: p.estatus, esPendiente: true, prioridad: p.prioridad, fechaLimite: p.fecha_limite, descripcion: p.descripcion,
      comentarios: (comsPend ?? []).filter((c: any) => c.pendiente_id === p.id)
        .map((c: any) => ({ fecha: c.created_at, texto: c.contenido ?? '', autor: c.autor_nombre, fotos: (c.fotos ?? []).map((f: any) => f.id) })),
    });
  }

  const planteles: PlantelSemana[] = (pls ?? []).map((p: any) => ({
    colegio_clave: p.colegio_clave ?? '', colegio_nombre: p.colegio_nombre ?? p.colegio_clave ?? '',
    fase: p.fase ?? '', fecha_inicio: p.fecha_inicio, fecha_termino: p.fecha_termino, notas: p.notas,
  }));
  return { proyectos, planteles };
}

export default function PresentacionSemanal({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [conFotos, setConFotos] = useState(true);
  const [sinProyecto, setSinProyecto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [avance, setAvance] = useState('');
  const [error, setError] = useState('');
  const [linkOneDrive, setLinkOneDrive] = useState<string | null>(null);
  const { uploadCustom } = useSharePointUpload();

  const semana = semanaISO(fechaDeInput(fecha));

  const generar = async () => {
    setTrabajando(true); setError(''); setLinkOneDrive(null); setAvance('Leyendo datos del sistema…');
    try {
      const [{ proyectos, planteles }, plantilla] = await Promise.all([
        cargarDatos(semana.inicio, semana.fin),
        fetch(PLANTILLA_URL).then(r => { if (!r.ok) throw new Error('No se encontró la plantilla'); return r.arrayBuffer(); }),
      ]);
      const blob = await generarPresentacionSemanal({
        plantilla, semana, proyectos, planteles,
        incluirSinProyecto: sinProyecto,
        fotos: conFotos ? (id: string) => { const p = proyectos.find(x => x.id === id); return p ? fotosDeProyecto(p, semana.inicio, semana.fin) : Promise.resolve([]); } : undefined,
        progreso: setAvance,
      });
      const nombre = `Seguimiento_Semanal_S${semana.numero}_${semana.anio}.pptx`;
      const carpeta = carpetaOneDrive(semana.fin);
      const cerrados = proyectos.filter(p => p.concluido).length;
      const enPrep = proyectos.filter(p => p.esPendiente).length;
      const resumen = `${proyectos.length - cerrados - enPrep} activo(s), ${cerrados} concluido(s) y ${enPrep} en preparación`;

      // Se guarda solo en OneDrive (si se vuelve a generar la misma semana, se reemplaza)
      setAvance('Guardando en OneDrive…');
      const archivo = new File([blob], nombre, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const link = await uploadCustom(archivo, carpeta, nombre);
      if (link) {
        setLinkOneDrive(link);
        setAvance(`Listo: ${resumen}.`);
        toast.success(`Presentación guardada en OneDrive: ${carpeta}/${nombre}`, { duration: 8000 });
      } else {
        // Si OneDrive falla, se descarga para no perder la presentación
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
        setAvance(`Listo: ${resumen}. No se pudo guardar en OneDrive, así que se descargó a tu equipo.`);
      }
    } catch (e) {
      console.error('[presentacion semanal]', e);
      setError((e as Error).message ?? String(e));
      setAvance('');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <button className={className} onClick={() => { setAbierto(true); setAvance(''); setError(''); }}>
        <Presentation className="w-4 h-4 text-orange-600" /> Presentación Semanal (.pptx)
      </button>

      {abierto && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !trabajando && setAbierto(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Presentation className="w-5 h-5 text-orange-600" /> Presentación Semanal
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Usa la plantilla institucional y la llena con los proyectos en Seguimiento NEXUS (activos y los concluidos en el corte) y el Levantamiento.
                  Cumplimiento Normativo se queda como en la plantilla para llenarlo a mano.
                  Se guarda en OneDrive: Presentaciones Semanales / año / mes.
                </p>
              </div>
              <button onClick={() => setAbierto(false)} disabled={trabajando} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Semana</span>
              <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} disabled={trabajando}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-xs text-slate-500 mt-1 block">
                Semana {semana.numero} · {semana.anio} — corte del miércoles {fmt(semana.inicio)} al miércoles {fmt(semana.fin)}
              </span>
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={conFotos} onChange={e => setConFotos(e.target.checked)} disabled={trabajando} />
                Incluir fotos (primero las pegadas en los comentarios de la semana, luego las del Expediente)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={sinProyecto} onChange={e => setSinProyecto(e.target.checked)} disabled={trabajando} />
                Incluir colegios sin proyecto activo
              </label>
            </div>

            {avance && (
              <p className="text-xs text-slate-600 flex items-center gap-2">
                {trabajando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {avance}
              </p>
            )}
            {linkOneDrive && (
              <a href={linkOneDrive} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                <FolderOpen className="w-3.5 h-3.5" /> Abrir en OneDrive ({carpetaOneDrive(semana.fin)})
              </a>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}

            <button onClick={generar} disabled={trabajando}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#ED7102] text-white text-sm font-bold hover:bg-[#d66500] disabled:opacity-50">
              {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {trabajando ? 'Generando…' : 'Generar y guardar en OneDrive'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
