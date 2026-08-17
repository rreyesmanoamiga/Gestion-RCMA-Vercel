import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { AlertTriangle, Clock, CheckCircle2, Bell, X, Mail, UserPlus, Trash2 } from 'lucide-react';
import {
  useComplianceDocs, esRetraso, diasDiferencia, formatFecha,
  LoadingBlock, ErrorBlock, DetalleModal, COLEGIO_A_CODIGO,
  type ComplianceDoc,
} from '@/lib/complianceShared';

interface SysUser { user_email: string; nombre: string | null; territorio: string | null; colegio: string | null; }
interface NotifRecipient { id: string; email: string; nombre: string | null; colegio: string | null; territorio: string | null; activo: boolean; created_at: string; }

const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

function NotificacionesModal({ docs, onClose }: { docs: ComplianceDoc[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [territorioSel, setTerritorioSel] = useState('');
  const [colegioSel, setColegioSel] = useState('');
  const [usuarioSel, setUsuarioSel] = useState('');
  const [incluirTodos, setIncluirTodos] = useState(false);

  const colegioTerritorioMap = useMemo(() => {
    const m = new Map<string, string>();
    docs.forEach(d => { if (!m.has(d.colegio)) m.set(d.colegio, d.territorio); });
    return m;
  }, [docs]);

  const { data: recipients = [], isLoading: loadingRecipients } = useQuery({
    queryKey: ['compliance_notification_recipients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_notification_recipients').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as NotifRecipient[];
    },
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['sys_users_compliance_notif'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('user_email, nombre, territorio, colegio');
      if (error) throw error;
      return (data ?? []) as SysUser[];
    },
  });

  // Colegios que pertenecen al territorio elegido (resuelto desde los docs reales)
  const colegiosDeTerritorio = useMemo(() => {
    if (!territorioSel) return [];
    return Array.from(colegioTerritorioMap.entries())
      .filter(([, terr]) => terr === territorioSel)
      .map(([col]) => col)
      .sort();
  }, [territorioSel, colegioTerritorioMap]);

  const codigoColegioSel = colegioSel ? COLEGIO_A_CODIGO[colegioSel] : null;
  const usuariosDelColegio = useMemo(() => {
    if (!codigoColegioSel) return [];
    return allUsers.filter(u => u.colegio === codigoColegioSel);
  }, [allUsers, codigoColegioSel]);

  const agregar = useMutation({
    mutationFn: async () => {
      if (!incluirTodos && !usuarioSel) throw new Error('Elige un usuario o activa "Todos los colegios"');
      const u = allUsers.find(x => x.user_email === usuarioSel);
      const email = incluirTodos ? usuarioSel : (u?.user_email ?? usuarioSel);
      const nombre = incluirTodos ? (u?.nombre ?? usuarioSel) : (u?.nombre ?? usuarioSel);
      if (!email) throw new Error('Selecciona un usuario válido');
      const { error } = await supabase.from('compliance_notification_recipients').insert({
        email: email.toLowerCase().trim(),
        nombre,
        colegio: incluirTodos ? null : colegioSel,
        territorio: incluirTodos ? null : territorioSel,
        activo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_notification_recipients'] });
      toast.success('Destinatario agregado');
      setUsuarioSel(''); setColegioSel(''); setTerritorioSel(''); setIncluirTodos(false);
    },
    onError: (err: any) => {
      if (err?.message?.includes('duplicate') || err?.code === '23505') toast.error('Ese usuario ya está agregado para ese colegio');
      else toast.error(err?.message ?? 'No se pudo agregar');
    },
  });

  const toggleActivo = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('compliance_notification_recipients').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compliance_notification_recipients'] }),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_notification_recipients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_notification_recipients'] }); toast.success('Destinatario eliminado'); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="font-bold text-slate-900">Notificaciones de Cumplimiento</h3>
              <p className="text-xs text-slate-500 mt-0.5">Quién recibe avisos de vencidos y por vencer, por colegio</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
          <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 leading-relaxed">
            <p><strong>Vencidos:</strong> lunes y jueves, 8:00 AM.</p>
            <p><strong>Por vencer:</strong> lunes, 8:30 AM — se repite cada semana mientras el documento siga dentro de los 2 meses antes de su vencimiento.</p>
            <p className="mt-1">Los fines de semana no se envía nada.</p>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase mb-3">Agregar destinatario</p>

          <label className="flex items-center gap-2 text-xs text-slate-600 mb-3">
            <input type="checkbox" checked={incluirTodos} onChange={e => { setIncluirTodos(e.target.checked); setColegioSel(''); setTerritorioSel(''); setUsuarioSel(''); }} />
            Recibe notificaciones de TODOS los colegios (no solo uno)
          </label>

          {incluirTodos ? (
            <div className="flex gap-2">
              <select value={usuarioSel} onChange={e => setUsuarioSel(e.target.value)} className={inputCls + ' flex-1'}>
                <option value="">Selecciona un usuario...</option>
                {allUsers.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.user_email}</option>)}
              </select>
              <button onClick={() => agregar.mutate()} disabled={agregar.isPending || !usuarioSel}
                className="px-3 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />{agregar.isPending ? '...' : 'Agregar'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <select value={territorioSel} onChange={e => { setTerritorioSel(e.target.value); setColegioSel(''); setUsuarioSel(''); }} className={inputCls}>
                <option value="">Selecciona territorio...</option>
                <option value="NORTE">NORTE</option>
                <option value="MEXICO">MEXICO</option>
              </select>
              {territorioSel && (
                <select value={colegioSel} onChange={e => { setColegioSel(e.target.value); setUsuarioSel(''); }} className={inputCls}>
                  <option value="">Selecciona colegio...</option>
                  {colegiosDeTerritorio.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
                </select>
              )}
              {colegioSel && (
                <div className="flex gap-2">
                  <select value={usuarioSel} onChange={e => setUsuarioSel(e.target.value)} className={inputCls + ' flex-1'}>
                    <option value="">
                      {usuariosDelColegio.length === 0 ? `Sin usuarios registrados en ${colegioSel.replace('Mano Amiga ', '')}` : 'Selecciona un usuario...'}
                    </option>
                    {usuariosDelColegio.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email}</option>)}
                  </select>
                  <button onClick={() => agregar.mutate()} disabled={agregar.isPending || !usuarioSel}
                    className="px-3 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" />{agregar.isPending ? '...' : 'Agregar'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {loadingRecipients ? (
            <div className="py-8 text-center"><p className="text-sm text-slate-400">Cargando...</p></div>
          ) : recipients.length === 0 ? (
            <div className="py-10 text-center px-5">
              <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">Sin destinatarios configurados</p>
              <p className="text-xs text-slate-400 mt-1">Mientras tanto, los avisos siguen llegando al correo admin por defecto.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recipients.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${r.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {(r.nombre || r.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{r.nombre || '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{r.email}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.colegio ? r.colegio.replace('Mano Amiga ', '') : 'Todos los colegios'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActivo.mutate({ id: r.id, activo: !r.activo })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${r.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <button onClick={() => eliminar.mutate(r.id)} disabled={eliminar.isPending}
                      className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CumplimientoAlertas() {
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [detalle, setDetalle] = useState<ComplianceDoc | null>(null);
  const [showNotif, setShowNotif] = useState(false);

  const vencidos = useMemo(() => {
    return docs
      .filter(d => esRetraso(d, hoy))
      .map(d => ({ ...d, dias: -diasDiferencia(d.fecha_limite_recepcion as string, hoy) }))
      .sort((a, b) => b.dias - a.dias);
  }, [docs, hoy]);

  const porExpirar = useMemo(() => {
    return docs
      .filter(d => d.vigente === 'Por expirar' && d.vigente_hasta)
      .map(d => ({ ...d, dias: diasDiferencia(d.vigente_hasta as string, hoy) }))
      .sort((a, b) => a.dias - b.dias);
  }, [docs, hoy]);

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Alertas" subtitle="Documentos vencidos y por expirar — priorizados de mayor a menor urgencia" />
        <button onClick={() => setShowNotif(true)}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 mt-1">
          <Bell className="w-3.5 h-3.5" /> Notificaciones
        </button>
      </div>

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        vencidos.length === 0 && porExpirar.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-[#00295A] mb-2">Sin alertas activas</h2>
            <p className="text-sm text-slate-500">Ningún documento está vencido o por expirar en este momento.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {vencidos.length > 0 && (
              <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                    Vencidos — {vencidos.length} documento{vencidos.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {vencidos.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                        <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vencía {formatFecha(d.fecha_limite_recepcion)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
                      </div>
                      <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                        {d.dias} día{d.dias !== 1 ? 's' : ''} de retraso
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {porExpirar.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#ED7102]" />
                  <p className="text-xs font-bold text-[#ED7102] uppercase tracking-wide">
                    Por expirar — {porExpirar.length} documento{porExpirar.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {porExpirar.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                        <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vence {formatFecha(d.vigente_hasta)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
                      </div>
                      <span className="text-xs font-bold text-white bg-[#ED7102] px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                        {d.dias} día{d.dias !== 1 ? 's' : ''} restantes
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {detalle && <DetalleModal doc={detalle} onClose={() => setDetalle(null)} onSaved={() => setDetalle(null)} />}
      {showNotif && <NotificacionesModal docs={docs} onClose={() => setShowNotif(false)} />}
    </div>
  );
}

