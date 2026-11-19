// Capacitación · Publicar un video y avisar por correo.
// Destinatarios: solo usuarios registrados en Accesos con correo @manoamiga.edu.mx.
// Para: Gerente de Finanzas (editable) · CC: todos los demás, agrupados por puesto · Coordinación siempre en copia.
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Send, Loader2, FolderOpen, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import { ADMIN_EMAIL } from '@/lib/AuthContext';
import {
  accionCapacitacion, GRUPOS, grupoDe, esGerenteFinanzas,
  type Video, type UsuarioAcceso, type Grupo,
} from '@/lib/capacitacion';

const DOMINIO = '@manoamiga.edu.mx';
const labelCls = 'text-[11px] font-bold text-slate-500 uppercase';

export default function PublicarModal({ video, onClose, onPublicado }: {
  video: Video; onClose: () => void; onPublicado?: () => void;
}) {
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['capacitacion_destinatarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('user_email, nombre, puesto, colegio, area');
      if (error) throw error;
      return (data as UsuarioAcceso[])
        .map(u => ({ ...u, user_email: String(u.user_email ?? '').trim().toLowerCase() }))
        .filter(u => u.user_email.endsWith(DOMINIO) && u.user_email !== ADMIN_EMAIL)
        .sort((a, b) => (a.nombre ?? a.user_email).localeCompare(b.nombre ?? b.user_email, 'es'));
    },
  });

  const [para, setPara] = useState<string[]>([]);
  const [cc, setCc] = useState<Set<string>>(new Set());
  const [abiertos, setAbiertos] = useState<Set<Grupo>>(new Set());
  const [sinAviso, setSinAviso] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [iniciado, setIniciado] = useState(false);

  // Primera carga: Para = Gerente de Finanzas; CC = todos los demás
  useEffect(() => {
    if (iniciado || !usuarios.length) return;
    const p = usuarios.filter(esGerenteFinanzas).map(u => u.user_email);
    setPara(p);
    setCc(new Set(usuarios.map(u => u.user_email).filter(e => !p.includes(e))));
    setIniciado(true);
  }, [usuarios, iniciado]);

  const porEmail = useMemo(() => Object.fromEntries(usuarios.map(u => [u.user_email, u])), [usuarios]);
  const enGrupos = useMemo(() => {
    const g: Record<Grupo, UsuarioAcceso[]> = { dn: [], car: [], admin: [], aux: [], otros: [] };
    usuarios.filter(u => !para.includes(u.user_email)).forEach(u => g[grupoDe(u)].push(u));
    return g;
  }, [usuarios, para]);

  const ccLista = [...cc].filter(e => !para.includes(e));
  const total = para.length + ccLista.length + 1; // + Coordinación

  const toggleGrupo = (k: Grupo, on: boolean) => setCc(prev => {
    const n = new Set(prev); enGrupos[k].forEach(u => on ? n.add(u.user_email) : n.delete(u.user_email)); return n;
  });
  const toggleUno = (e: string) => setCc(prev => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n; });
  const quitarPara = (e: string) => { setPara(p => p.filter(x => x !== e)); setCc(prev => new Set(prev).add(e)); };
  const agregarPara = (e: string) => { if (e && !para.includes(e)) setPara(p => [...p, e]); setAgregando(false); };

  const publicar = async () => {
    if (!sinAviso && !para.length) { toast.error('Elige al menos un destinatario en Para'); return; }
    setEnviando(true);
    try {
      const r = await accionCapacitacion<{ enviados: number }>('publicar', { video_id: video.id, para, cc: ccLista, avisar: !sinAviso });
      logAudit({ accion: 'editar', modulo: 'capacitacion', registro_id: video.id, registro_ref: video.titulo,
        detalle: { cambio: 'Publicar video', aviso: !sinAviso, destinatarios: r.enviados } });
      toast.success(sinAviso ? 'Video publicado (sin aviso por correo)' : `Video publicado y aviso enviado a ${r.enviados} personas`);
      onPublicado?.();
      onClose();
    } catch (e) {
      toast.error('No se pudo publicar: ' + (e as Error).message);
    } finally { setEnviando(false); }
  };

  const nombre = (u?: UsuarioAcceso) => u ? (u.nombre?.trim() || u.user_email) : '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publicar video</p>
            <h2 className="text-base font-black text-slate-800">¿A quién le avisamos?</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-4 text-sm max-h-[72vh] overflow-y-auto">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
            <span><b className="text-slate-800">{video.titulo}</b> · guardado en <b>OneDrive › Sistema RCMA Doc › {video.carpeta ?? 'Capacitación'}</b></span>
          </div>

          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <fieldset disabled={sinAviso} className={sinAviso ? 'opacity-40 space-y-4' : 'space-y-4'}>
              <div>
                <p className={`${labelCls} mb-1.5`}>Para</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {para.map(e => (
                    <span key={e} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00295A] text-white text-xs font-bold">
                      {nombre(porEmail[e])}{porEmail[e]?.puesto ? ` · ${porEmail[e]!.puesto}` : ''}
                      <button type="button" onClick={() => quitarPara(e)} className="hover:text-red-200"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {agregando ? (
                    <select autoFocus className="border border-slate-300 rounded-md text-xs px-2 py-1 bg-white" defaultValue=""
                      onChange={ev => agregarPara(ev.target.value)} onBlur={() => setAgregando(false)}>
                      <option value="" disabled>Elige una persona…</option>
                      {usuarios.filter(u => !para.includes(u.user_email)).map(u =>
                        <option key={u.user_email} value={u.user_email}>{nombre(u)}{u.puesto ? ` — ${u.puesto}` : ''}</option>)}
                    </select>
                  ) : (
                    <button type="button" onClick={() => setAgregando(true)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"><Plus className="w-3 h-3" /> Agregar</button>
                  )}
                </div>
                {!para.length && !sinAviso && <p className="text-[11px] text-red-600 font-semibold mt-1">Elige al menos un destinatario en Para.</p>}
              </div>

              <div>
                <p className={`${labelCls} mb-1.5`}>CC · usuarios con acceso al sistema ({DOMINIO}) — {ccLista.length} seleccionados</p>
                <div className="border border-slate-200 rounded-lg divide-y">
                  {GRUPOS.map(g => {
                    const lista = enGrupos[g.k];
                    if (!lista.length) return null;
                    const marcados = lista.filter(u => cc.has(u.user_email)).length;
                    const todos = marcados === lista.length;
                    const abierto = abiertos.has(g.k);
                    return (
                      <div key={g.k}>
                        <div className="flex items-center justify-between px-3 py-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded" checked={todos}
                              ref={el => { if (el) el.indeterminate = marcados > 0 && !todos; }}
                              onChange={e => toggleGrupo(g.k, e.target.checked)} />
                            <b className="text-slate-800">{g.label}</b>
                            <span className="text-slate-400">· {marcados === lista.length ? lista.length : `${marcados} de ${lista.length}`}</span>
                          </label>
                          <button type="button" onClick={() => setAbiertos(p => { const n = new Set(p); n.has(g.k) ? n.delete(g.k) : n.add(g.k); return n; })}
                            className="inline-flex items-center gap-0.5 text-xs text-blue-600 font-bold">
                            Ver {abierto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        </div>
                        {abierto && (
                          <div className="px-3 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                            {lista.map(u => (
                              <label key={u.user_email} className="flex items-start gap-2 text-xs cursor-pointer py-0.5">
                                <input type="checkbox" className="rounded mt-0.5" checked={cc.has(u.user_email)} onChange={() => toggleUno(u.user_email)} />
                                <span><span className="font-semibold text-slate-700">{nombre(u)}</span>
                                  <span className="block text-slate-400">{[u.puesto, u.colegio].filter(Boolean).join(' · ')}</span></span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Tú vas siempre en copia. Los usuarios sin correo {DOMINIO} no se incluyen.</p>
              </div>
            </fieldset>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={sinAviso} onChange={e => setSinAviso(e.target.checked)} />
            Publicar sin avisar (para reemplazos o correcciones del video)
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={publicar} disabled={enviando || isLoading || (!sinAviso && !para.length)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sinAviso ? 'Publicar sin avisar' : `Publicar y avisar a ${total}`}
          </button>
        </div>
      </div>
    </div>
  );
}
