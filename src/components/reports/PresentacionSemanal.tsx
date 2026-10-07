// Botón + ventana para generar la Presentación Semanal (.pptx) desde Reportes.
// Junta los datos del sistema y se los pasa a generarPresentacionSemanal().
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Presentation, X, Loader2, Download } from 'lucide-react';
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
const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

function base64ABytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fotosDeProyecto(proyectoId: string, concluido = false): Promise<FotoSlide[]> {
  const { data, error } = await supabase.functions.invoke('proyecto-fotos', {
    // En proyectos concluidos se priorizan las fotos de "Después"
    body: { proyecto_id: proyectoId, modo: 'presentacion', max: 3, prioridad: concluido ? 'despues' : 'reciente' },
  });
  if (error || data?.error) return [];
  const lista = (data?.fotos ?? []) as { tipo: string; base64: string }[];
  const fotos: FotoSlide[] = [];
  for (const f of lista) {
    try {
      const bytes = base64ABytes(f.base64);
      const bmp = await createImageBitmap(new Blob([bytes], { type: f.tipo }));
      fotos.push({ bytes, ext: /png/i.test(f.tipo) ? 'png' : 'jpg', ancho: bmp.width, alto: bmp.height });
      bmp.close();
    } catch { /* imagen que no se pudo leer: se omite */ }
  }
  return fotos;
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
      ? supabase.from('nexus_comentarios').select('seguimiento_id, contenido, autor_nombre, created_at')
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
          .map((c: any) => ({ fecha: c.created_at, texto: c.contenido ?? '', autor: c.autor_nombre })),
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
    ? await supabase.from('nexus_comentarios').select('pendiente_id, contenido, autor_nombre, created_at')
        .in('pendiente_id', listaPend.map((p: any) => p.id)).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (e6) throw new Error('No se pudieron leer los comentarios de pendientes: ' + e6.message);
  for (const p of listaPend as any[]) {
    proyectos.push({
      id: 'pend:' + p.id, colegio: p.colegio, nombre: p.titulo ?? 'Pendiente',
      estatus: p.estatus, esPendiente: true, prioridad: p.prioridad, fechaLimite: p.fecha_limite, descripcion: p.descripcion,
      comentarios: (comsPend ?? []).filter((c: any) => c.pendiente_id === p.id)
        .map((c: any) => ({ fecha: c.created_at, texto: c.contenido ?? '', autor: c.autor_nombre })),
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

  const semana = semanaISO(fechaDeInput(fecha));

  const generar = async () => {
    setTrabajando(true); setError(''); setAvance('Leyendo datos del sistema…');
    try {
      const [{ proyectos, planteles }, plantilla] = await Promise.all([
        cargarDatos(semana.inicio, semana.fin),
        fetch(PLANTILLA_URL).then(r => { if (!r.ok) throw new Error('No se encontró la plantilla'); return r.arrayBuffer(); }),
      ]);
      const blob = await generarPresentacionSemanal({
        plantilla, semana, proyectos, planteles,
        incluirSinProyecto: sinProyecto,
        fotos: conFotos ? (id: string) => fotosDeProyecto(id, !!proyectos.find(p => p.id === id)?.concluido) : undefined,
        progreso: setAvance,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Seguimiento_Semanal_S${semana.numero}_${semana.anio}.pptx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      const cerrados = proyectos.filter(p => p.concluido).length;
      const enPrep = proyectos.filter(p => p.esPendiente).length;
      setAvance(`Listo: ${proyectos.length - cerrados - enPrep} activo(s), ${cerrados} concluido(s) y ${enPrep} en preparación.`);
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
                Incluir fotos del Expediente (3 más recientes por proyecto)
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
            {error && <p className="text-xs text-red-600">{error}</p>}

            <button onClick={generar} disabled={trabajando}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#ED7102] text-white text-sm font-bold hover:bg-[#d66500] disabled:opacity-50">
              {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {trabajando ? 'Generando…' : 'Generar y descargar'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
