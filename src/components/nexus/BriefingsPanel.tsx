// NEXUS · Briefings: los PDF de Resumen matutino, Preparación de reuniones y Resumen semanal
// guardados en OneDrive (Sistema RCMA Doc/Briefings/AAAA/MM - Mes).
// Todo pasa por la función "briefings" (solo admin; la llave de Microsoft no sale del servidor).
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { FileText, UploadCloud, ExternalLink, Trash2, Loader2, Sun, CalendarClock, CalendarRange, FolderOpen } from 'lucide-react';

interface Briefing { id: string; nombre: string; tamano: number; url: string; creado: string | null; mes: string }
interface Listado { anios: string[]; anio: string; archivos: Briefing[] }

async function accionBriefings<T = any>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('briefings', { body: { accion, ...datos } });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

const CHUNK = 5 * 1024 * 1024; // múltiplo de 320 KiB, como pide OneDrive
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** La fecha va en el nombre del PDF (…_2026-11-06.pdf); si no, la de hoy */
const fechaDe = (nombre: string) => /(\d{4}-\d{2}-\d{2})/.exec(nombre)?.[1] ?? hoyISO();

const TIPOS = [
  { re: /resumen\s*_?semanal/i, label: 'Resumen semanal', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CalendarRange },
  { re: /resumen\s*_?matutino/i, label: 'Resumen matutino', cls: 'bg-orange-50 text-orange-700 border-orange-200', Icon: Sun },
  { re: /briefing\s*_?reuniones|reuniones/i, label: 'Preparación de reuniones', cls: 'bg-blue-50 text-blue-800 border-blue-200', Icon: CalendarClock },
];
const tipoDe = (nombre: string) => TIPOS.find(t => t.re.test(nombre)) ?? { label: 'Otro', cls: 'bg-slate-50 text-slate-600 border-slate-200', Icon: FileText };
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const kb = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export default function BriefingsPanel() {
  const qc = useQueryClient();
  const [anio, setAnio] = useState<string>('');
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<Briefing | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['nexus_briefings', anio],
    queryFn: () => accionBriefings<Listado>('listar', anio ? { anio } : {}),
  });
  const archivos = data?.archivos ?? [];
  const porMes = archivos.reduce<Record<string, Briefing[]>>((m, a) => { (m[a.mes] ??= []).push(a); return m; }, {});
  Object.values(porMes).forEach(l => l.sort((a, b) => fechaDe(b.nombre).localeCompare(fechaDe(a.nombre)) || a.nombre.localeCompare(b.nombre)));

  const subir = async (lista: File[]) => {
    const pdfs = lista.filter(f => /\.pdf$/i.test(f.name));
    if (pdfs.length < lista.length) toast.error('Solo se pueden subir archivos PDF');
    let ok = 0;
    for (const f of pdfs) {
      setSubiendo(f.name);
      try {
        const { uploadUrl } = await accionBriefings<{ uploadUrl: string }>('iniciar_subida', { nombre: f.name, tamano: f.size, fecha: fechaDe(f.name) });
        for (let inicio = 0; inicio < f.size; inicio += CHUNK) {
          const fin = Math.min(inicio + CHUNK, f.size);
          const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${inicio}-${fin - 1}/${f.size}` }, body: f.slice(inicio, fin) });
          if (!res.ok && res.status !== 202) throw new Error(`OneDrive respondió ${res.status}`);
        }
        ok++;
      } catch (e) {
        toast.error(`No se pudo subir "${f.name}": ${(e as Error).message}`);
      }
    }
    setSubiendo(null);
    if (ok) { toast.success(ok === 1 ? 'Briefing guardado en OneDrive' : `${ok} briefings guardados en OneDrive`); qc.invalidateQueries({ queryKey: ['nexus_briefings'] }); }
  };

  const eliminar = async () => {
    if (!borrar) return;
    try {
      await accionBriefings('eliminar', { item_id: borrar.id });
      toast.success('Briefing eliminado');
      qc.invalidateQueries({ queryKey: ['nexus_briefings'] });
    } catch (e) { toast.error((e as Error).message); }
    setBorrar(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2 -mt-2">
        <p className="text-sm text-slate-500">Resúmenes matutinos, preparación de reuniones y resumen semanal, guardados en OneDrive › Sistema RCMA Doc › Briefings.</p>
        {data && data.anios.length > 1 && (
          <select value={data.anio} onChange={e => setAnio(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white">
            {data.anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* Subir PDF */}
      <label
        onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={e => { e.preventDefault(); setArrastrando(false); }}
        onDrop={e => { e.preventDefault(); setArrastrando(false); if (!subiendo) subir(Array.from(e.dataTransfer.files ?? [])); }}
        className={`flex items-center gap-4 cursor-pointer rounded-xl border-2 border-dashed px-5 py-4 transition ${arrastrando ? 'border-[#ED7102] bg-orange-50' : 'border-slate-300 bg-white hover:border-[#ED7102] hover:bg-orange-50/40'}`}>
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
          {subiendo ? <Loader2 className="w-5 h-5 text-[#ED7102] animate-spin" /> : <UploadCloud className="w-5 h-5 text-[#ED7102]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{subiendo ? `Subiendo ${subiendo}…` : 'Arrastra aquí los PDF del día o haz clic para elegirlos'}</p>
          <p className="text-xs text-slate-500">Se guardan en la carpeta del mes según la fecha del nombre del archivo (…_2026-11-06.pdf). Si ya existe uno igual, se guarda con otro nombre.</p>
        </div>
        <input type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={!!subiendo}
          onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; subir(l); }} />
      </label>

      {/* Listado por mes */}
      {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo OneDrive…</div>}
      {error && <p className="text-sm text-red-600">No se pudo leer la carpeta de briefings: {(error as Error).message}</p>}
      {!isLoading && !error && archivos.length === 0 && (
        <div className="text-center py-12"><FolderOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">Aún no hay briefings guardados{data?.anio ? ` en ${data.anio}` : ''}.</p></div>
      )}
      {Object.entries(porMes).map(([mes, lista]) => (
        <div key={mes}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5" />{mes.replace(/^\d+ - /, '')} {data?.anio}<span className="normal-case tracking-normal font-semibold">· {lista.length} archivo{lista.length !== 1 ? 's' : ''}</span></p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {lista.map(b => {
              const t = tipoDe(b.nombre);
              return (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                  <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-red-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${t.cls}`}><t.Icon className="w-3 h-3" />{t.label}</span>
                      <span className="text-sm font-bold text-slate-800">{fechaLarga(fechaDe(b.nombre))}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{b.nombre} · {kb(b.tamano)}</p>
                  </div>
                  <a href={b.url} target="_blank" rel="noreferrer" title="Abrir en OneDrive"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-700 transition shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir
                  </a>
                  <button type="button" onClick={() => setBorrar(b)} title="Eliminar" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {borrar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setBorrar(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar este briefing?</h2>
            <p className="text-sm text-slate-600 mt-2">Se borra de OneDrive: <span className="font-semibold">{borrar.nombre}</span></p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setBorrar(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="button" onClick={eliminar} className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
