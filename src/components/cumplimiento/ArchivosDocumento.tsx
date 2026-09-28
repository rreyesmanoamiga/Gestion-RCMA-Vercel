// Panel de archivos de un documento de Cumplimiento: lista, subir (varios a la
// vez), quitar, y —para la Coordinación— Verificar / Rechazar.
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, Upload, Trash2, ExternalLink, Loader2, CheckCircle2, XCircle, AlertTriangle, FileText } from 'lucide-react';
import {
  useArchivosDocumento, subirArchivos, accionCumplimiento, useRefrescarExpediente,
  REVISION_CFG, fmtTamano, type Revision,
} from '@/lib/cumplimientoArchivos';

const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function RevisionBadge({ revision }: { revision: Revision | string | null | undefined }) {
  if (!revision || !REVISION_CFG[revision]) return null;
  const c = REVISION_CFG[revision];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.cls}`}>{c.label}</span>;
}

export default function ArchivosDocumento({
  documentoId, revision, revisionMotivo, esAdmin, puedeSubir = true, bloqueado, antesDeVerificar, onCambio,
}: {
  documentoId: string;
  revision: Revision | string | null | undefined;
  revisionMotivo?: string | null;
  esAdmin: boolean;
  puedeSubir?: boolean;
  bloqueado?: boolean;           // colegio: documento verificado y en vigor
  antesDeVerificar?: () => Promise<boolean>; // guarda la vigencia antes de verificar
  onCambio?: (tipo?: 'verificado' | 'rechazado') => void;
}) {
  const { data: archivos = [], isLoading } = useArchivosDocumento(documentoId);
  const refrescar = useRefrescarExpediente();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<{ pct: number; nombre: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const verificado = revision === 'verificado';
  const bloqueadoColegio = !esAdmin && (bloqueado ?? verificado);

  const listo = (tipo?: 'verificado' | 'rechazado') => { refrescar(); onCambio?.(tipo); };

  const onArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const lista = Array.from(files);
    setSubiendo({ pct: 0, nombre: lista[0].name });
    try {
      await subirArchivos(documentoId, lista, (pct, nombre) => setSubiendo({ pct, nombre }));
      toast.success(lista.length === 1 ? 'Archivo subido' : `${lista.length} archivos subidos`,
        { description: esAdmin ? undefined : 'La Coordinación RCMA lo revisará y te avisará por correo.' });
      listo();
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo subir el archivo');
      listo();
    } finally {
      setSubiendo(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const quitar = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Quitar "${nombre}"? Se borra también de OneDrive.`)) return;
    setTrabajando(id);
    try { await accionCumplimiento('eliminar_archivo', { archivo_id: id }); toast.success('Archivo quitado'); listo(); }
    catch (e: any) { toast.error(e.message); }
    finally { setTrabajando(null); }
  };

  const verificar = async () => {
    setTrabajando('verificar');
    try {
      if (antesDeVerificar && !(await antesDeVerificar())) return;
      const r = await accionCumplimiento<{ correo: boolean; destinatario: string | null; aviso_desactivado?: boolean }>('verificar', { documento_id: documentoId });
      toast.success('Documento verificado', { description: r.aviso_desactivado ? 'Avisos a este colegio apagados: no se envió correo.' : r.correo ? `Se avisó a ${r.destinatario}` : 'Sin correo de administrador en el Directorio; no se envió aviso.' });
      listo('verificado');
    } catch (e: any) { toast.error(e.message); }
    finally { setTrabajando(null); }
  };

  const rechazar = async () => {
    if (!motivo.trim()) { toast.error('Escribe el motivo del rechazo'); return; }
    setTrabajando('rechazar');
    try {
      const r = await accionCumplimiento<{ correo: boolean; destinatario: string | null; archivos_borrados: number; aviso_desactivado?: boolean }>('rechazar', { documento_id: documentoId, motivo });
      toast.success('Documento rechazado', { description: `${r.archivos_borrados} archivo(s) eliminados${r.aviso_desactivado ? ' · avisos a este colegio apagados: no se envió correo' : r.correo ? ` · se avisó a ${r.destinatario}` : ''}` });
      setRechazando(false); setMotivo('');
      listo('rechazado');
    } catch (e: any) { toast.error(e.message); }
    finally { setTrabajando(null); }
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" /> Archivos del documento {archivos.length > 0 && <span className="text-slate-400">({archivos.length})</span>}
        </p>
        <RevisionBadge revision={revision} />
      </div>

      {revision === 'rechazado' && revisionMotivo && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <p className="font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Rechazado — motivo:</p>
          <p className="mt-0.5">{revisionMotivo}</p>
        </div>
      )}

      <div className="p-4 space-y-2">
        {isLoading ? (
          <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando archivos…</p>
        ) : archivos.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Todavía no hay archivos para este documento.</p>
        ) : archivos.map(a => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#00295A] hover:underline truncate block">{a.nombre_original}</a>
              <p className="text-[11px] text-slate-400 truncate">
                {a.origen === 'colegio' ? 'Colegio' : 'RCMA'} · {a.subido_por_nombre || a.subido_por_email} · {fmtFechaHora(a.created_at)}{a.tamano ? ` · ${fmtTamano(a.tamano)}` : ''}
              </p>
            </div>
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-[#00295A]" title="Abrir"><ExternalLink className="w-4 h-4" /></a>
            {puedeSubir && (esAdmin || (!bloqueadoColegio && a.origen === 'colegio' && revision === 'por_revisar')) && (
              <button type="button" onClick={() => quitar(a.id, a.nombre_original)} disabled={!!trabajando || !!subiendo}
                className="p-1.5 text-slate-300 hover:text-red-600 disabled:opacity-40" title="Quitar">
                {trabajando === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        ))}

        {subiendo && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-xs text-sky-800 truncate">Subiendo {subiendo.nombre}… {subiendo.pct}%</p>
            <div className="h-1.5 bg-sky-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${subiendo.pct}%` }} /></div>
          </div>
        )}

        {puedeSubir && !bloqueadoColegio && (
          <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => onArchivos(e.target.files)} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!subiendo || !!trabajando}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm font-semibold text-slate-600 hover:border-[#00295A] hover:text-[#00295A] disabled:opacity-50 transition">
              {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {archivos.length ? 'Agregar más archivos' : 'Subir archivo(s)'}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Puedes elegir varios a la vez · máximo 100 MB por archivo · se guardan en OneDrive</p>
          </>
        )}
        {bloqueadoColegio && (
          <p className="text-[11px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Documento verificado por la Coordinación RCMA.</p>
        )}
      </div>

      {esAdmin && (archivos.length > 0 || revision === 'por_revisar') && (
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
          {!rechazando ? (
            <div className="flex gap-2">
              <button type="button" onClick={verificar} disabled={!!trabajando || !!subiendo || verificado}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-40">
                {trabajando === 'verificar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {verificado ? 'Ya verificado' : 'Verificar'}
              </button>
              <button type="button" onClick={() => setRechazando(true)} disabled={!!trabajando || !!subiendo}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50 disabled:opacity-40">
                <XCircle className="w-4 h-4" /> Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Se borrarán los {archivos.length} archivo(s) y se le avisará al administrador del colegio con este motivo.</p>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
                placeholder="Ej. El documento no corresponde / está vencido / falta la página de firmas…"
                className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setRechazando(false); setMotivo(''); }} disabled={trabajando === 'rechazar'}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-lg">Cancelar</button>
                <button type="button" onClick={rechazar} disabled={trabajando === 'rechazar'}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                  {trabajando === 'rechazar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Rechazar y avisar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
