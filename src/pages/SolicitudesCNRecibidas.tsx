import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, CheckCircle, Eye, X, Building2, User, Mail, ShieldCheck, Ban, Trash2, FileSignature } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import { useScope } from '@/hooks/useScope';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';

const PAGE_SIZE = 20;

interface SolicitudCN {
  id: string;
  folio?: string;
  colegio?: string;
  territorio?: string;
  razon_social?: string;
  sociedad?: string;
  centro_gestor?: string;
  concepto_nombre?: string;
  especificacion?: string;
  nombre_solicitante?: string;
  puesto_solicitante?: string;
  correo_solicitante?: string;
  descripcion?: string;
  fecha_requerida?: string;
  costo_estimado?: number | null;
  estatus?: string;
  recibida_at?: string;
  motivo_rechazo?: string;
  tramite_id?: string | null;
  ticket_mas_cn_habilitado_at?: string | null;
  created_at?: string;
}

const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

export default function SolicitudesCNRecibidas() {
  const { isAdmin } = usePermissions();
  const { filtrarPorAlcance } = useScope();
  const qc = useQueryClient();

  const [filterEstatus, setFilterEstatus] = useState('all');
  const [viewing, setViewing] = useState<SolicitudCN | null>(null);
  const [rechazarModal, setRechazarModal] = useState<SolicitudCN | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: rawSolicitudes = [], isLoading } = useQuery({
    queryKey: ['compliance_solicitudes_cn'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_solicitudes_cn')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SolicitudCN[];
    },
    enabled: isAdmin,
  });

  const solicitudes = useMemo(
    () => filtrarPorAlcance(rawSolicitudes, s => s.territorio, s => s.colegio),
    [rawSolicitudes, filtrarPorAlcance]
  );

  // Paso 1: marcar como recibida — igual que Solicitud de Proyecto en Obras.
  // El Trámite CN todavía NO existe aquí: se genera hasta que se AUTORICE
  // el Ticket MAS CN (igual que Obras genera el Proyecto al autorizar el Ticket MAS).
  const recibirMutation = useMutation({
    mutationFn: async (s: SolicitudCN) => {
      const { error } = await supabase.from('compliance_solicitudes_cn')
        .update({ estatus: 'recibida', recibida_at: new Date().toISOString() })
        .eq('id', s.id);
      if (error) throw error;

      logAudit({ accion: 'editar', modulo: 'solicitudes_cn', registro_id: s.id, registro_ref: s.folio ?? s.especificacion ?? '',
        detalle: { estatus_nuevo: 'recibida' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_solicitudes_cn'] });
      toast.success('Solicitud marcada como recibida');
      setViewing(null);
    },
    onError: () => toast.error('Error al procesar la solicitud'),
  });

  // Paso 2: habilitar Ticket MAS CN — activa SOLO el permiso de enviar (no
  // "ver") en user_permissions, así el solicitante cae en modo "solo
  // formulario" y nunca ve el listado completo de tickets de otros colegios.
  const habilitarTicketMutation = useMutation({
    mutationFn: async (s: SolicitudCN) => {
      if (!s.correo_solicitante) throw new Error('Esta solicitud no tiene correo de solicitante');

      const { data: actualizado, error: permErr } = await supabase
        .from('user_permissions')
        .update({ enviar_ticket_mas_cn: true })
        .eq('user_email', s.correo_solicitante)
        .select('user_email');
      if (permErr) throw permErr;
      if (!actualizado || actualizado.length === 0) {
        throw new Error(`${s.correo_solicitante} no tiene cuenta en Accesos — créala ahí primero`);
      }

      const { error: upErr } = await supabase.from('compliance_solicitudes_cn')
        .update({ ticket_mas_cn_habilitado_at: new Date().toISOString() })
        .eq('id', s.id);
      if (upErr) throw upErr;

      logAudit({ accion: 'editar', modulo: 'solicitudes_cn', registro_id: s.id, registro_ref: s.folio ?? s.especificacion ?? '',
        detalle: { accion_especial: 'ticket_mas_cn_habilitado', correo: s.correo_solicitante } });

      await supabase.functions.invoke('notify-nueva-solicitud-cn', {
        body: { aprobada: true, concepto: s.concepto_nombre, especificacion: s.especificacion,
          colegio: s.colegio, correoSolicitante: s.correo_solicitante },
      }).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_solicitudes_cn'] });
      toast.success('Ticket MAS CN habilitado y correo enviado');
      setViewing(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'No se pudo habilitar el Ticket MAS CN'),
  });

  const rechazarMutation = useMutation({
    mutationFn: async () => {
      if (!rechazarModal) return;
      const { error } = await supabase.from('compliance_solicitudes_cn')
        .update({ estatus: 'rechazada', motivo_rechazo: motivoRechazo.trim() || null })
        .eq('id', rechazarModal.id);
      if (error) throw error;
      logAudit({ accion: 'cancelar', modulo: 'solicitudes_cn', registro_id: rechazarModal.id,
        registro_ref: rechazarModal.folio ?? rechazarModal.especificacion ?? '',
        detalle: { estatus_nuevo: 'rechazada', motivo: motivoRechazo } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_solicitudes_cn'] });
      toast.success('Solicitud rechazada');
      setRechazarModal(null); setViewing(null); setMotivoRechazo('');
    },
    onError: () => toast.error('Error al rechazar la solicitud'),
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_solicitudes_cn').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_solicitudes_cn'] });
      toast.success('Solicitud eliminada');
    },
  });

  const filtradas = useMemo(
    () => solicitudes.filter(s => filterEstatus === 'all' || s.estatus === filterEstatus),
    [solicitudes, filterEstatus]
  );
  const visibles = filtradas.slice(0, visibleCount);

  const counts = {
    pendientes: solicitudes.filter(s => s.estatus === 'pendiente').length,
    recibidas:  solicitudes.filter(s => s.estatus === 'recibida').length,
    rechazadas: solicitudes.filter(s => s.estatus === 'rechazada').length,
  };

  if (!isAdmin) return <AccesoRestringido mensaje="Sólo la Coordinación puede revisar Solicitudes CN." />;

  return (
    <div className="w-full p-4 space-y-4">
      <PageHeader title="Solicitudes CN Recibidas" subtitle="Revisión de solicitudes de Cumplimiento Normativo / Protección Civil" icon={<ShieldCheck className="w-5 h-5" />} />

      <div className="flex items-center gap-3 flex-wrap">
        {[
          { k: 'all', label: `Todas (${solicitudes.length})` },
          { k: 'pendiente', label: `Pendientes (${counts.pendientes})` },
          { k: 'recibida', label: `Recibidas (${counts.recibidas})` },
          { k: 'rechazada', label: `Rechazadas (${counts.rechazadas})` },
        ].map(f => (
          <button key={f.k} onClick={() => { setFilterEstatus(f.k); setVisibleCount(PAGE_SIZE); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${filterEstatus === f.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Cargando solicitudes...</div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400 font-medium">No hay solicitudes {filterEstatus !== 'all' ? filterEstatus + 's' : ''}.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visibles.map(s => (
            <div key={s.id} className={`bg-white rounded-xl border p-4 shadow-sm ${
              s.estatus === 'pendiente' ? 'border-amber-200' : s.estatus === 'rechazada' ? 'border-red-200 opacity-75' : 'border-slate-200'
            }`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      s.estatus === 'pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      s.estatus === 'rechazada' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {s.estatus === 'pendiente' ? 'Pendiente' : s.estatus === 'rechazada' ? 'Rechazada' : 'Recibida'}
                    </span>
                    {s.estatus === 'recibida' && s.ticket_mas_cn_habilitado_at && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-blue-50 text-blue-700 border-blue-200">Ticket MAS CN Habilitado</span>
                    )}
                    <h3 className="font-bold text-slate-800 text-sm">{s.concepto_nombre} — {s.especificacion}</h3>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{s.colegio}</span>
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{s.nombre_solicitante}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{s.correo_solicitante}</span>
                    <span>{s.created_at ? format(new Date(s.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setViewing(s)} title="Ver detalle" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition"><Eye className="w-4 h-4" /></button>
                  {s.estatus === 'pendiente' && (
                    <>
                      <button onClick={() => recibirMutation.mutate(s)} title="Marcar como Recibida"
                        className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 transition"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => { setRechazarModal(s); setMotivoRechazo(''); }} title="Rechazar"
                        className="p-1.5 rounded hover:bg-red-50 text-red-500 transition"><Ban className="w-4 h-4" /></button>
                    </>
                  )}
                  {s.estatus === 'recibida' && !s.ticket_mas_cn_habilitado_at && (
                    <button onClick={() => habilitarTicketMutation.mutate(s)} title="Habilitar Ticket MAS CN"
                      className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition"><FileSignature className="w-4 h-4" /></button>
                  )}
                  {s.estatus === 'recibida' && s.ticket_mas_cn_habilitado_at && (
                    <span title="Ticket MAS CN ya habilitado" className="p-1.5 text-emerald-500"><FileSignature className="w-4 h-4" /></span>
                  )}
                  <button onClick={() => { if (window.confirm('¿Eliminar esta solicitud?')) eliminarMutation.mutate(s.id); }} title="Eliminar"
                    className="p-1.5 rounded hover:bg-red-50 text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {filtradas.length > visibleCount && (
            <div className="flex flex-col items-center gap-2 py-4">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" /> Cargar más ({filtradas.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Detalle */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-800">Detalle de Solicitud CN</h2>
              <button onClick={() => setViewing(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <p><strong>Colegio:</strong> {viewing.colegio} ({viewing.territorio})</p>
              <p><strong>Concepto:</strong> {viewing.concepto_nombre}</p>
              <p><strong>Especificación:</strong> {viewing.especificacion}</p>
              <p><strong>Descripción:</strong> {viewing.descripcion || '—'}</p>
              <p><strong>Solicitante:</strong> {viewing.nombre_solicitante} — {viewing.puesto_solicitante}</p>
              <p><strong>Correo:</strong> {viewing.correo_solicitante}</p>
              <p><strong>Fecha requerida:</strong> {viewing.fecha_requerida || '—'}</p>
              <p><strong>Costo estimado:</strong> {fmx(viewing.costo_estimado)}</p>
              {viewing.motivo_rechazo && <p className="text-red-600"><strong>Motivo de rechazo:</strong> {viewing.motivo_rechazo}</p>}
            </div>
            {viewing.estatus === 'pendiente' && (
              <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
                <button onClick={() => { setRechazarModal(viewing); setMotivoRechazo(''); }}
                  className="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Rechazar</button>
                <button onClick={() => recibirMutation.mutate(viewing)}
                  className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Marcar como Recibida</button>
              </div>
            )}
            {viewing.estatus === 'recibida' && !viewing.ticket_mas_cn_habilitado_at && (
              <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
                <button onClick={() => habilitarTicketMutation.mutate(viewing)}
                  className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Habilitar Ticket MAS CN</button>
              </div>
            )}
            {viewing.estatus === 'recibida' && viewing.ticket_mas_cn_habilitado_at && (
              <div className="p-4 border-t border-slate-100 text-xs text-slate-400 italic">Ticket MAS CN ya habilitado — el solicitante puede continuar el trámite.</div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Rechazar */}
      {rechazarModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Rechazar Solicitud CN</h2>
            <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm h-24 resize-none"
              placeholder="Motivo del rechazo (opcional)" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setRechazarModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => rechazarMutation.mutate()} className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg">Confirmar Rechazo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
