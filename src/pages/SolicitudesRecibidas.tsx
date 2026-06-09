import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, CheckCircle, Eye, X, Building2, User, Mail, Calendar, DollarSign, Printer, Trash2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
  FMA:    'fguerra@manoamiga.edu.mx',
};

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
  const handlePrint = (s: Solicitud) => {
    const fmxP = (n?: number | null) =>
      n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';
    const costo = s.costo_aproximado ?? 0;
    const pct = (m?: number | null) => costo > 0 && m != null ? ((m / costo) * 100).toFixed(0) + '%' : '0%';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Solicitud — ${s.nombre_proyecto}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
    .header { background:#1e293b; color:white; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; }
    .header-text h1 { font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:0.05em; }
    .header-text h2 { font-size:10px; color:#94a3b8; text-transform:uppercase; margin-top:2px; }
    .header img { height:48px; width:auto; object-fit:contain; }
    .section-title { background:#e2e8f0; padding:5px 10px; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.05em; color:#475569; border-bottom:1px solid #cbd5e1; }
    table { width:100%; border-collapse:collapse; }
    td { border:1px solid #cbd5e1; padding:5px 8px; font-size:11px; }
    .label { background:#f8fafc; font-weight:700; color:#475569; width:160px; text-transform:uppercase; font-size:10px; }
    .value { color:#1e293b; }
    .th { background:#1e293b; color:white; font-size:10px; font-weight:700; text-transform:uppercase; padding:6px 8px; text-align:center; }
    .num { text-align:right; font-family:monospace; }
    .total-row td { background:#f1f5f9; font-weight:900; }
    .footer { margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px; text-align:center; font-size:9px; color:#94a3b8; }
    @media print { body { padding:10px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-text">
      <h1>Red de Colegios Mano Amiga</h1>
      <h2>Solicitud de Inicio de Obra o Mantenimiento</h2>
    </div>
    <img src="/colegio-mano-amiga.png" alt="Logo" />
  </div>

  <div class="section-title">I. Identificación</div>
  <table>
    <tr><td class="label">División</td><td class="value" colspan="3">Red de Colegios Mano Amiga</td></tr>
    <tr><td class="label">Nombre del Centro</td><td class="value">${s.nombre_centro || '—'}</td><td class="label">Ciclo / Año Fiscal</td><td class="value">${s.ciclo_año_fiscal || '—'}</td></tr>
    <tr><td class="label">Razón Social</td><td class="value">${s.razon_social || '—'}</td><td class="label">Sociedad</td><td class="value">${s.sociedad || '—'}</td></tr>
    <tr><td class="label">Centro de Gestor</td><td class="value" colspan="3">${s.centro_gestor || '—'}</td></tr>
    <tr><td class="label">Nombre del Proyecto</td><td class="value" colspan="3">${s.nombre_proyecto || '—'}</td></tr>
    <tr><td class="label">Tipo de Iniciativa</td><td class="value" colspan="3">${s.tipo_iniciativa || '—'}</td></tr>
    <tr><td class="label">Solicitante</td><td class="value">${s.nombre_solicitante || '—'}</td><td class="label">Puesto</td><td class="value">${s.puesto_solicitante || '—'}</td></tr>
    <tr><td class="label">Correo</td><td class="value" colspan="3">${s.correo_solicitante || '—'}</td></tr>
  </table>

  <div class="section-title" style="margin-top:10px;">II. Resumen del Proyecto</div>
  <table>
    <tr><td class="label">Descripción / Justificación</td><td class="value" colspan="3" style="white-space:pre-wrap;">${s.resumen_proyecto || '—'}</td></tr>
    <tr><td class="label">Fecha propuesta inicio</td><td class="value">${s.fecha_inicio_propuesta || '—'}</td><td class="label">Fecha conclusión</td><td class="value">${s.fecha_fin_propuesta || '—'}</td></tr>
  </table>

  <div class="section-title" style="margin-top:10px;">III. Plan de Financiamiento</div>
  <table>
    <tr><td class="th" style="width:200px;">Fuente</td><td class="th">Monto (MXN)</td><td class="th" style="width:80px;">% del Total</td></tr>
    <tr><td class="label">Costo Aproximado Total</td><td class="num">${fmxP(s.costo_aproximado)}</td><td class="num" style="font-weight:900;">100%</td></tr>
    <tr><td class="label">Operación</td><td class="num">${fmxP(s.monto_operacion)}</td><td class="num">${pct(s.monto_operacion)}</td></tr>
    <tr><td class="label">FBC</td><td class="num">${fmxP(s.monto_fbc)}</td><td class="num">${pct(s.monto_fbc)}</td></tr>
    <tr><td class="label">Donativos</td><td class="num">${fmxP(s.monto_donativos)}</td><td class="num">${pct(s.monto_donativos)}</td></tr>
    <tr><td class="label">Otras Fuentes</td><td class="num">${fmxP(s.monto_otras)}</td><td class="num">${pct(s.monto_otras)}</td></tr>
  </table>

  <div class="footer">
    Para iniciar el proyecto se deberá tener el visto bueno de la Gerencia y de la Coordinación de Obras y Mantenimientos RCMA.<br/>
    Sistema RCMA — Coordinación de Obras © ${new Date().getFullYear()}
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }
  };
  const [filterEstatus, setFilterEstatus] = useState('all');
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE);
  const [viewing, setViewing]             = useState<Solicitud | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [cotModal, setCotModal]           = useState<any>(null);
  const [cotFiles, setCotFiles]           = useState<File[]>([]);
  const { upload: spUpload, uploading: spUploading } = useSharePointUpload();
  const queryClient = useQueryClient();

  // Query cotizaciones by solicitud
  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['solicitud_cotizaciones', cotModal?.id],
    queryFn: async () => {
      if (!cotModal?.id) return [];
      const { data } = await supabase.from('solicitud_cotizaciones').select('*').eq('solicitud_id', cotModal.id).order('created_at');
      return data ?? [];
    },
    enabled: !!cotModal?.id,
  });

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

  const uploadCotMutation = useMutation({
    mutationFn: async (sol: any) => {
      for (const file of cotFiles) {
        const result = await spUpload(file, {
          modulo: 'Anteproyectos',
          colegio: sol.nombre_centro,
          territorio: sol.territorio ?? '',
          referencia: 'Cotizaciones/' + sol.nombre_proyecto?.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40),
        });
        if (result) {
          await supabase.from('solicitud_cotizaciones').insert({
            solicitud_id: sol.id, nombre: result.fileName,
            web_url: result.webUrl, subido_por: 'rreyes@manoamiga.edu.mx',
          });
        }
      }
      // Notificar
      const territorio = sol.territorio ?? '';
      await supabase.functions.invoke('notify-cotizacion-subida', {
        body: { proyecto: sol.nombre_proyecto, centro: sol.nombre_centro, territorio,
          archivos: cotFiles.map((f: File) => f.name), subido_por: 'Ricardo Reyes — Admin RCMA', siteUrl: window.location.origin },
      });
    },
    onSuccess: () => {
      setCotFiles([]);
      queryClient.invalidateQueries({ queryKey: ['solicitud_cotizaciones'] });
      toast.success('Cotizaciones subidas y notificación enviada ✓');
    },
    onError: () => toast.error('Error al subir cotizaciones'),
  });

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
          tipo:        'solicitud_recibida',
          correo:      sol.correo_solicitante,
          nombre:      sol.nombre_solicitante,
          proyecto:    sol.nombre_proyecto,
          centro:      sol.nombre_centro,
          correoAdmin: 'rreyes@manoamiga.edu.mx',
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('solicitudes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      setDeletingId(null);
      toast.success('Solicitud eliminada');
    },
    onError: () => toast.error('Error al eliminar la solicitud'),
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
                  <button onClick={() => { setCotModal(s); setCotFiles([]); }}
                    className="flex items-center gap-1.5 px-3 py-2 border border-teal-300 text-teal-700 rounded-md text-sm font-medium hover:bg-teal-50 transition-colors">
                    📎 Cotizaciones
                  </button>
                  {s.estatus === 'pendiente' && (
                    <button onClick={() => recibirMutation.mutate(s.id)}
                      disabled={recibirMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                      <CheckCircle className="w-4 h-4" /> Recibida
                    </button>
                  )}
                  <button onClick={() => setDeletingId(s.id)}
                    className="p-2 border border-red-200 rounded-md text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                <div className="bg-slate-800 text-white py-2 px-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">Red de Colegios Mano Amiga</p>
                    <p className="text-[10px] text-slate-300 uppercase tracking-wider">Solicitud de Inicio de Obra o Mantenimiento</p>
                  </div>
                  <img src="/colegio-mano-amiga.png" alt="Logo" className="h-10 w-auto object-contain rounded" />
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

            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
              <button onClick={() => handlePrint(viewing)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                <Printer className="w-4 h-4" /> Imprimir / PDF
              </button>
              <div className="flex gap-3">
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
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deletingId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar solicitud?</h2>
            <p className="text-sm text-slate-500 mt-2">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md disabled:opacity-50 transition-colors">
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>


  {/* ── Modal Cotizaciones ─────────────────────────────────────────────── */}
  {cotModal && (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) setCotModal(null); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <div>
            <h3 className="font-black text-slate-900 text-sm">📎 Cotizaciones</h3>
            <p className="text-xs text-slate-500 mt-0.5">{cotModal.nombre_proyecto} — {cotModal.nombre_centro}</p>
          </div>
          <button onClick={() => setCotModal(null)} className="p-1 rounded hover:bg-slate-200">✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Cotizaciones existentes */}
          {cotizaciones.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Archivos subidos:</p>
              <div className="space-y-2">
                {cotizaciones.map((cot: any) => (
                  <div key={cot.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span className="text-sm">📄</span>
                    <span className="text-xs text-blue-700 font-semibold flex-1 truncate">{cot.nombre}</span>
                    <a href={cot.web_url} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 font-bold hover:underline">Ver →</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subir nuevas */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Subir cotizaciones:</p>
            <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg px-4 py-3 transition ${spUploading ? 'opacity-50 pointer-events-none bg-slate-50' : 'border-teal-300 hover:bg-teal-50 bg-white'}`}>
              <span className="text-xl">📎</span>
              <span className="text-sm font-semibold text-teal-700">{spUploading ? 'Subiendo...' : 'Seleccionar archivos'}</span>
              <input type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" className="hidden"
                onChange={e => setCotFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
            </label>
            {cotFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {cotFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 border rounded-lg px-3 py-1.5">
                    <span className="text-xs text-slate-700 flex-1 truncate">📄 {f.name}</span>
                    <button onClick={() => setCotFiles(prev => prev.filter((_,j) => j !== i))} className="text-red-400 text-xs font-bold">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={() => setCotModal(null)}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Cerrar
          </button>
          <button disabled={cotFiles.length === 0 || spUploading || uploadCotMutation.isPending}
            onClick={() => uploadCotMutation.mutate(cotModal)}
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
            {uploadCotMutation.isPending ? 'Subiendo...' : 'Subir y Notificar'}
          </button>
        </div>
      </div>
    </div>
  )}  );
}
