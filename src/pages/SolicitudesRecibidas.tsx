import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, CheckCircle, Eye, X, Building2, User, Mail, Calendar, DollarSign } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const PAGE_SIZE = 20;

interface Solicitud {
  id:                    string;
  nombre_centro?:        string;
  razon_social?:         string;
  sociedad?:             string;
  centro_gestor?:        string;
  ciclo_año_fiscal?:     string;
  nombre_solicitante?:   string;
  puesto_solicitante?:   string;
  correo_solicitante?:   string;
  nombre_proyecto?:      string;
  tipo_iniciativa?:      string;
  resumen_proyecto?:     string;
  fecha_inicio_propuesta?: string;
  fecha_fin_propuesta?:    string;
  costo_aproximado?:     number | null;
  monto_operacion?:      number | null;
  monto_fbc?:            number | null;
  monto_donativos?:      number | null;
  monto_otras?:          number | null;
  estatus?:              string;
  created_at?:           string;
  recibida_at?:          string;
}

const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

export default function SolicitudesRecibidas() {
  const [filterEstatus, setFilterEstatus] = useState('all');
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE);
  const [viewing, setViewing]             = useState<Solicitud | null>(null);
  const queryClient = useQueryClient();

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('solicitudes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const solicitudes = raw as Solicitud[];

  const recibirMutation = useMutation({
    mutationFn: async (id: string) => {
      const sol = solicitudes.find(s => s.id === id);
      if (!sol) throw new Error('No encontrada');

      const { error: upErr } = await supabase
        .from('solicitudes')
        .update({ estatus: 'recibida', recibida_at: new Date().toISOString() })
        .eq('id', id);
      if (upErr) throw upErr;

      // Enviar email via Edge Function
      await supabase.functions.invoke('send-solicitud-recibida', {
        body: {
          correo:    sol.correo_solicitante,
          nombre:    sol.nombre_solicitante,
          proyecto:  sol.nombre_proyecto,
          centro:    sol.nombre_centro,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      setViewing(null);
      toast.success('Solicitud marcada como recibida y notificación enviada');
    },
    onError: () => toast.error('Error al procesar la solicitud'),
  });

  const filtered = useMemo(() =>
    solicitudes.filter(s => filterEstatus === 'all' || s.estatus === filterEstatus),
    [solicitudes, filterEstatus]
  );

  const visible   = filtered.slice(0, visibleCount);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const kpis = useMemo(() => ({
    total:    solicitudes.length,
    nuevas:   solicitudes.filter(s => s.estatus === 'pendiente').length,
    recibidas: solicitudes.filter(s => s.estatus === 'recibida').length,
  }), [solicitudes]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solicitudes Recibidas"
        subtitle="Gestión de solicitudes de inicio de obra o mantenimiento"
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Solicitudes', value: kpis.total,     color: 'text-slate-900'   },
          { label: 'Pendientes',        value: kpis.nuevas,    color: 'text-amber-600'   },
          { label: 'Recibidas',         value: kpis.recibidas, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="flex gap-3">
        <select className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700"
          value={filterEstatus} onChange={e => { setFilterEstatus(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todas</option>
          <option value="pendiente">Pendientes</option>
          <option value="recibida">Recibidas</option>
        </select>
        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} solicitud{filtered.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay solicitudes {filterEstatus !== 'all' ? filterEstatus + 's' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(s => (
            <div key={s.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 p-5 ${
              s.estatus === 'pendiente' ? 'border-amber-200' : 'border-slate-200'
            }`}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      s.estatus === 'pendiente'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {s.estatus === 'pendiente' ? 'Pendiente' : 'Recibida'}
                    </span>
                    {s.tipo_iniciativa && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                        {s.tipo_iniciativa}
                      </span>
                    )}
                    {s.created_at && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(s.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-base font-black text-slate-900">{s.nombre_proyecto}</p>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {s.nombre_centro}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.nombre_solicitante} {s.puesto_solicitante ? `— ${s.puesto_solicitante}` : ''}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.correo_solicitante}</span>
                    {s.costo_aproximado != null && (
                      <span className="flex items-center gap-1 font-bold text-slate-800">
                        <DollarSign className="w-3 h-3" />{fmx(s.costo_aproximado)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setViewing(s)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    <Eye className="w-4 h-4" /> Ver detalle
                  </button>
                  {s.estatus === 'pendiente' && (
                    <button onClick={() => recibirMutation.mutate(s.id)}
                      disabled={recibirMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                      <CheckCircle className="w-4 h-4" /> Recibida
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex flex-col items-center gap-2 py-4">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal detalle */}
      {viewing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Detalle de Solicitud</h3>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="border-2 border-slate-700 m-4">
                {/* Header formato */}
                <div className="bg-slate-800 text-white text-center py-2">
                  <p className="text-xs font-black uppercase tracking-widest">Red de Colegios Mano Amiga</p>
                  <p className="text-[10px] text-slate-300 uppercase tracking-wider">Solicitud de Inicio de Obra o Mantenimiento</p>
                </div>

                {/* I. Identificación */}
                <div className="border-b border-slate-400">
                  <div className="bg-slate-200 px-3 py-1 border-b border-slate-400">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">I. Identificación</span>
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {[
                        ['Nombre del Centro', viewing.nombre_centro],
                        ['Razón Social', viewing.razon_social],
                        ['Sociedad', viewing.sociedad],
                        ['Centro de Gestor', viewing.centro_gestor],
                        ['Ciclo / Año Fiscal', viewing.ciclo_año_fiscal],
                        ['Nombre del Proyecto', viewing.nombre_proyecto],
                        ['Tipo de Iniciativa', viewing.tipo_iniciativa],
                        ['Nombre del Solicitante', viewing.nombre_solicitante],
                        ['Puesto', viewing.puesto_solicitante],
                        ['Correo', viewing.correo_solicitante],
                      ].map(([k, v]) => (
                        <tr key={k}>
                          <td className="border border-slate-300 px-2 py-1.5 bg-slate-100 font-bold text-slate-700 w-44">{k}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-800">{v || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* II. Resumen */}
                <div className="border-b border-slate-400">
                  <div className="bg-slate-200 px-3 py-1 border-b border-slate-400">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">II. Resumen del Proyecto</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <p className="text-slate-800 leading-relaxed">{viewing.resumen_proyecto || '—'}</p>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div><span className="font-bold text-slate-600">Fecha inicio:</span> {viewing.fecha_inicio_propuesta || '—'}</div>
                      <div><span className="font-bold text-slate-600">Fecha fin:</span> {viewing.fecha_fin_propuesta || '—'}</div>
                    </div>
                  </div>
                </div>

                {/* III. Financiamiento */}
                <div>
                  <div className="bg-slate-200 px-3 py-1 border-b border-slate-400">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">III. Plan de Financiamiento</span>
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {[
                        ['Costo Aproximado Total', viewing.costo_aproximado],
                        ['Operación', viewing.monto_operacion],
                        ['FBC (Fondo Bajo Custodia)', viewing.monto_fbc],
                        ['Donativos', viewing.monto_donativos],
                        ['Otras Fuentes', viewing.monto_otras],
                      ].map(([k, v]) => (
                        <tr key={k as string}>
                          <td className="border border-slate-300 px-2 py-1.5 bg-slate-100 font-bold text-slate-700 w-44">{k as string}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-slate-800">{fmx(v as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setViewing(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
                Cerrar
              </button>
              {viewing.estatus === 'pendiente' && (
                <button onClick={() => recibirMutation.mutate(viewing.id)}
                  disabled={recibirMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" />
                  {recibirMutation.isPending ? 'Procesando...' : 'Marcar como Recibida'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
