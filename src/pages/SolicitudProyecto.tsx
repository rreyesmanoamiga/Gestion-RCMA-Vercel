import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import { Send, CheckCircle, AlertTriangle } from 'lucide-react';

const inputClass = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-600 cursor-default rounded";
const labelClass = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";

const TIPOS_PROYECTO = ['CONSTRUCCIÓN NUEVA','MEJORA','MANTENIMIENTO EXTRAORDINARIO','REMODELACIÓN','ADECUACIÓN DE ESPACIO','GARANTÍAS','AMPLIACIÓN','MANTENIMIENTO ORDINARIO','REVISIÓN'];

// Territorios por colegio (nombre completo → territorio)
const COLEGIO_TERRITORIO: Record<string, string> = {
  'Mano Amiga Acapulco':          'MEXICO',
  'Mano Amiga Aguascalientes':     'NORTE',
  'Mano Amiga Cancún':             'MEXICO',
  'Mano Amiga Chalco':             'MEXICO',
  'Mano Amiga La Cima':            'NORTE',
  'Mano Amiga Conkal':             'MEXICO',
  'Mano Amiga Guadalajara':        'NORTE',
  'Mano Amiga León':               'NORTE',
  'Mano Amiga Lerma':              'MEXICO',
  'Mano Amiga Morelia':            'MEXICO',
  'Mano Amiga Monterrey':          'NORTE',
  'Mano Amiga Piedras Negras':     'NORTE',
  'Mano Amiga Puebla':             'MEXICO',
  'Mano Amiga Querétaro':          'MEXICO',
  'Mano Amiga Santa Catarina':     'NORTE',
  'Mano Amiga Tapachula':          'MEXICO',
  'Mano Amiga Tijuana':            'NORTE',
  'Mano Amiga Torreón':            'NORTE',
  'Mano Amiga Villas de San Juan': 'NORTE',
  'ZOM':                           'MEXICO',
  'FIA':                           'FMA',
  'FMA':                           'FMA',
  'AUN':                           'FMA',
};

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
};

const COLEGIOS_DATA = [
  { colegio: 'Mano Amiga Acapulco',         razon_social: 'Centro Educativo Cualcan Acapulco, S. C.',                          sociedad: '1214', centro_gestor: 'MXI008' },
  { colegio: 'Mano Amiga Aguascalientes',    razon_social: 'Mano Amiga Aguascalientes S.C.',                                   sociedad: '1250', centro_gestor: 'MXI016' },
  { colegio: 'Mano Amiga Cancún',            razon_social: 'Mano Amiga Cancún, S.C.',                                          sociedad: '1263', centro_gestor: 'MXI020' },
  { colegio: 'Mano Amiga Chalco',            razon_social: 'Mano Amiga de Chalco, S.C.',                                       sociedad: '1135', centro_gestor: 'MXI010' },
  { colegio: 'Mano Amiga La Cima',           razon_social: 'Mano Amiga La Cima A.B.P.',                                        sociedad: '1260', centro_gestor: 'MXI001' },
  { colegio: 'Mano Amiga Conkal',            razon_social: 'Mano Amiga Yucatán Conkal A.C.',                                   sociedad: '1263', centro_gestor: 'MXI014' },
  { colegio: 'Mano Amiga Guadalajara',       razon_social: 'Mano Amiga de Guadalajara, S.C.',                                  sociedad: '1077', centro_gestor: 'MXI004' },
  { colegio: 'Mano Amiga León',              razon_social: 'Mano Amiga de León, A.C.',                                         sociedad: '1145', centro_gestor: 'MXI003' },
  { colegio: 'Mano Amiga Lerma',             razon_social: 'Centro Escolar Lerma, S.C.',                                       sociedad: '1175', centro_gestor: 'MXI009' },
  { colegio: 'Mano Amiga Morelia',           razon_social: 'Mano Amiga Tarimbaro. S. C.',                                      sociedad: '1263', centro_gestor: 'MXI022' },
  { colegio: 'Mano Amiga Monterrey',         razon_social: 'Instituto Mano Amiga de Monterrey, S.C.',                          sociedad: '1010', centro_gestor: 'MXI006' },
  { colegio: 'Mano Amiga Piedras Negras',    razon_social: 'Mano Amiga Piedras Negras AC',                                     sociedad: '1210', centro_gestor: 'MXI007' },
  { colegio: 'Mano Amiga Puebla',            razon_social: 'Mano Amiga de Puebla S.C.',                                        sociedad: '1172', centro_gestor: 'MXI018' },
  { colegio: 'Mano Amiga Querétaro',         razon_social: 'Escuela Mano Amiga del Estado de Querétaro S.C.',                  sociedad: '1170', centro_gestor: 'MXI013' },
  { colegio: 'Mano Amiga Santa Catarina',    razon_social: 'Centro de Desarrollo y Avance, S.C.',                              sociedad: '1259', centro_gestor: 'MXI005' },
  { colegio: 'Mano Amiga Tapachula',         razon_social: 'Mano Amiga Chiapas. S.C',                                          sociedad: '1251', centro_gestor: 'MXI015' },
  { colegio: 'Mano Amiga Tijuana',           razon_social: 'Mano Amiga Baja California S.C.',                                  sociedad: '1256', centro_gestor: 'MXI019' },
  { colegio: 'Mano Amiga Torreón',           razon_social: 'Instituto Mano Amiga de Torreón S.C',                              sociedad: '1134', centro_gestor: 'MXI002' },
  { colegio: 'Mano Amiga Villas de San Juan',razon_social: 'Mano Amiga de León A.C.',                                          sociedad: '1145', centro_gestor: 'MXI012' },
  { colegio: 'ZOM',                          razon_social: 'Mano Amiga  S.C.',                                                 sociedad: '1005', centro_gestor: 'MXI011' },
  { colegio: 'FIA',                          razon_social: 'Fundación Interamericana Anáhuac para el Desarrollo Social, I.A.P.',sociedad: '1192', centro_gestor: 'MXI051' },
  { colegio: 'FMA',                          razon_social: 'Federacion Mano Amiga A. C.',                                      sociedad: '1238', centro_gestor: 'MXM010' },
  { colegio: 'AUN',                          razon_social: 'Mano Amiga por la Educacion, A. C.',                               sociedad: '1258', centro_gestor: 'MXI033' },
];

const formatMXN = (v: string) => {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
  return clean ? '$' + int + dec : '';
};
const parseMXN = (v: string) => v.replace(/[^0-9.]/g, '');
const toNum = (v: string) => parseFloat(v) || 0;


export default function SolicitudProyecto() {
  const añoActual = new Date().getFullYear().toString();
  const [enviado, setEnviado]   = useState(false);
  const { user } = useAuth();
  const { data: miPerfil } = useQuery({
    queryKey: ['mi_perfil_solicitud', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase.from('user_permissions').select('nombre, puesto').eq('user_email', user.email).maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });
  const miNombre = miPerfil?.nombre || user?.user_metadata?.nombre || '';
  const miPuesto = miPerfil?.puesto || '';
  const miCorreo = user?.email || '';

  const [loading, setLoading]   = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [tieneCotizaciones, setTieneCotizaciones] = useState(false);
  const [cotizacionFiles, setCotizacionFiles]     = useState<File[]>([]);
  const [dragActive, setDragActive]               = useState(false);
  const { upload: spUpload, uploading: spUploading } = useSharePointUpload();

  const [form, setForm] = useState({
    nombre_centro:          '',
    razon_social:           '',
    sociedad:               '',
    centro_gestor:          '',
    ciclo_año_fiscal:       añoActual,
    nombre_solicitante:     miNombre,
    puesto_solicitante:     miPuesto,
    correo_solicitante:     miCorreo,
    nombre_proyecto:        '',
    tipo_iniciativa:        '',
    resumen_proyecto:       '',
    fecha_inicio_propuesta: '',
    fecha_fin_propuesta:    '',
    costo_aproximado:       '',
    monto_operacion:        '',
    monto_fbc:              '',
    monto_donativos:        '',
    monto_otras:            '',
    monto_otras_detalle:    '',
    en_nombre_de:           '',
  });

  // Por si el perfil (nombre/puesto) resuelve después del primer render.
  useEffect(() => {
    setForm(p => ({ ...p, nombre_solicitante: miNombre, puesto_solicitante: miPuesto, correo_solicitante: miCorreo }));
  }, [miNombre, miPuesto, miCorreo]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleColegio = (val: string) => {
    const c = COLEGIOS_DATA.find(c => c.colegio === val);
    setForm(p => ({
      ...p,
      nombre_centro:    val,
      razon_social:     c?.razon_social   ?? '',
      sociedad:         c?.sociedad       ?? '',
      centro_gestor:    c?.centro_gestor  ?? '',
    }));
  };

  const costo      = toNum(form.costo_aproximado);
  const opMonto    = toNum(form.monto_operacion);
  const fbcMonto   = toNum(form.monto_fbc);
  const donMonto   = toNum(form.monto_donativos);
  const otrasMonto = toNum(form.monto_otras);
  const totalMonto = opMonto + fbcMonto + donMonto + otrasMonto;
  // "Otras Fuentes" con monto capturado exige especificar a qué se refiere.
  const otrasSinDetalle = otrasMonto > 0 && !form.monto_otras_detalle.trim();
  const otrasDetalleRef = useRef<HTMLInputElement>(null);
  const avisarOtrasFuentes = () => {
    toast.error('Indicaste un monto en "Otras Fuentes": es obligatorio especificar a qué se refiere antes de continuar.');
    otrasDetalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    otrasDetalleRef.current?.focus();
  };
  const pct = (m: number) => costo > 0 ? ((m / costo) * 100).toFixed(0) + '%' : '0%';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_centro)       { toast.error('Selecciona el nombre del centro'); return; }
    if (!form.nombre_solicitante || !form.puesto_solicitante || !form.correo_solicitante) {
      toast.error('Tu perfil no tiene nombre y/o puesto capturados — pide al administrador que los agregue en Accesos antes de continuar.');
      return;
    }
    if (!form.nombre_proyecto)     { toast.error('El nombre del proyecto es requerido'); return; }
    if (!form.tipo_iniciativa)     { toast.error('Selecciona el tipo de iniciativa'); return; }
    if (form.tipo_iniciativa !== 'GARANTÍAS' && (!costo || costo <= 0)) {
      toast.error('Ingresa el costo aproximado del proyecto'); return;
    }
    if (otrasSinDetalle) { avisarOtrasFuentes(); return; }
    if (!tieneCotizaciones || cotizacionFiles.length === 0) {
      toast.warning('Recuerda adjuntar la cotización más adelante en cuanto la tengas disponible.');
    }
    // No se envía todavía — se pide confirmación explícita primero,
    // para evitar envíos accidentales al presionar Enter entre campos.
    setShowConfirmSend(true);
  };

  const doSubmit = async () => {
    // Respaldo: nunca enviar si "Otras Fuentes" tiene monto sin especificar.
    if (otrasSinDetalle) { setShowConfirmSend(false); avisarOtrasFuentes(); return; }
    setShowConfirmSend(false);
    setLoading(true);
    try {
      const { data: nuevaSolicitud, error } = await supabase.from('solicitudes').insert({
        nombre_centro:          form.nombre_centro,
        razon_social:           form.razon_social,
        sociedad:               form.sociedad,
        centro_gestor:          form.centro_gestor,
        ciclo_año_fiscal:       form.ciclo_año_fiscal,
        nombre_solicitante:     form.nombre_solicitante,
        puesto_solicitante:     form.puesto_solicitante,
        correo_solicitante:     form.correo_solicitante,
        nombre_proyecto:        form.nombre_proyecto,
        tipo_iniciativa:        form.tipo_iniciativa,
        resumen_proyecto:       form.resumen_proyecto,
        fecha_inicio_propuesta: form.fecha_inicio_propuesta || null,
        fecha_fin_propuesta:    form.fecha_fin_propuesta    || null,
        costo_aproximado:       costo       || null,
        monto_operacion:        opMonto     || null,
        monto_fbc:              fbcMonto    || null,
        monto_donativos:        donMonto    || null,
        monto_otras:            otrasMonto  || null,
        monto_otras_detalle:    form.monto_otras_detalle.trim() || null,
      }).select('id').single();
      if (error) throw error;

      logAudit({
        accion:       'crear',
        modulo:       'solicitudes',
        registro_id:  nuevaSolicitud?.id ?? null,
        registro_ref: form.nombre_proyecto,
        detalle:      { solicitante: form.nombre_solicitante, centro: form.nombre_centro },
        en_nombre_de: form.en_nombre_de.trim() || null,
      });

      // Subir cotizaciones a SharePoint si las tienen
      if (tieneCotizaciones && cotizacionFiles.length > 0) {
        const solQuery = await supabase.from('solicitudes').select('id')
          .eq('nombre_proyecto', form.nombre_proyecto)
          .eq('correo_solicitante', form.correo_solicitante)
          .order('created_at', { ascending: false }).limit(1).single();
        const solicitudId = solQuery.data?.id ?? '';
        if (solicitudId) {
          const territorio = COLEGIO_TERRITORIO[form.nombre_centro] ?? '';
          for (const file of cotizacionFiles) {
            const result = await spUpload(file, {
              modulo: 'Cotizaciones',
              colegio: form.nombre_centro,
              referencia: form.nombre_proyecto.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40),
            });
            if (result) {
              await supabase.from('solicitud_cotizaciones').insert({
                solicitud_id: solicitudId, nombre: result.fileName,
                web_url: result.webUrl, subido_por: form.correo_solicitante,
              });
            }
          }
          await supabase.functions.invoke('notify-cotizacion-subida', {
            body: { proyecto: form.nombre_proyecto, centro: form.nombre_centro, territorio,
              archivos: cotizacionFiles.map(f => f.name), subido_por: form.correo_solicitante,
              siteUrl: window.location.origin },
          });
        }
      }

      // Notificar al admin que llegó una nueva solicitud (con copia al CAR)
      const territorioSolicitud = COLEGIO_TERRITORIO[form.nombre_centro] ?? '';
      const correoCAR = CAR_CORREOS[territorioSolicitud] ?? '';
      await supabase.functions.invoke('notify-nueva-solicitud', {
        body: {
          nombre:            form.nombre_solicitante,
          puesto:            form.puesto_solicitante,
          proyecto:          form.nombre_proyecto,
          centro:            form.nombre_centro,
          correoSolicitante: form.correo_solicitante,
          territorio:        territorioSolicitud,
          correoCAR,
        },
      });

      setEnviado(true);
    } catch {
      toast.error('Error al enviar la solicitud, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  if (enviado) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">¡Solicitud Enviada!</h2>
        <p className="text-slate-500 text-center max-w-md">
          Tu solicitud de proyecto fue recibida correctamente. Recibirás una confirmación a <strong>{form.correo_solicitante}</strong> cuando sea revisada.
        </p>
        <button onClick={() => { setEnviado(false); setForm({ nombre_centro:'',razon_social:'',sociedad:'',centro_gestor:'',ciclo_año_fiscal:añoActual,nombre_solicitante:miNombre,puesto_solicitante:miPuesto,correo_solicitante:miCorreo,nombre_proyecto:'',tipo_iniciativa:'',resumen_proyecto:'',fecha_inicio_propuesta:'',fecha_fin_propuesta:'',costo_aproximado:'',monto_operacion:'',monto_fbc:'',monto_donativos:'',monto_otras:'',monto_otras_detalle:'',en_nombre_de:''}); setTieneCotizaciones(false); setCotizacionFiles([]); }}
          className="px-6 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
          Nueva Solicitud
        </button>
      </div>
    );
  }

  // Tarjeta de fuente de financiamiento (monto + % del costo)
  const fuente = (label: string, k: 'monto_operacion' | 'monto_fbc' | 'monto_donativos' | 'monto_otras', monto: number) => (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[180px_1fr_70px] items-center gap-2 md:gap-3">
      <label className={labelClass + ' col-span-2 md:col-span-1'}>{label}</label>
      <input type="text" className={inputClass + ' text-right font-mono'} value={formatMXN(form[k])}
        onChange={e => set(k, parseMXN(e.target.value))} placeholder="$0.00" />
      <span className="text-xs font-bold text-slate-500 text-right">{pct(monto)}</span>
    </div>
  );
  const cuadra = costo > 0 && Math.abs(totalMonto - costo) < 1;
  const avanceFin = costo > 0 ? Math.min(100, (totalMonto / costo) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <PageHeader title="Solicitud de Proyecto" subtitle="Solicitud de Inicio de Obra o Mantenimiento · Construcciones, Mejoras y Mantenimiento" />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Datos del solicitante ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-l-4 border-[#ED7102]">
            Datos del Solicitante
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Nombre completo</label>
              <input readOnly className={readOnlyClass} value={form.nombre_solicitante} placeholder="Sin nombre en tu perfil — pide que lo capturen en Accesos" />
            </div>
            <div>
              <label className={labelClass}>Puesto</label>
              <input readOnly className={readOnlyClass} value={form.puesto_solicitante} placeholder="Sin puesto en tu perfil — pide que lo capturen en Accesos" />
            </div>
            <div>
              <label className={labelClass}>Correo de notificación</label>
              <input readOnly className={readOnlyClass} value={form.correo_solicitante} />
            </div>
          </div>
          <p className="px-4 pb-3 text-[11px] text-slate-400 -mt-2">
            Estos datos se toman automáticamente de tu sesión — si algo está mal o vacío, pide que lo corrijan en Accesos.
          </p>
        </section>

        {/* ── 1. Identificación ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-l-4 border-[#ED7102]">
            1. Identificación
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombre del Centro *</label>
              <select required className={inputClass} value={form.nombre_centro} onChange={e => handleColegio(e.target.value)}>
                <option value="">— Seleccionar colegio —</option>
                {COLEGIOS_DATA.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Razón Social / Soc. Operadora</label>
              <input readOnly className={readOnlyClass} value={form.razon_social} placeholder="Se completa al seleccionar colegio" />
            </div>
            <div>
              <label className={labelClass}>Sociedad</label>
              <input readOnly className={readOnlyClass} value={form.sociedad} />
            </div>
            <div>
              <label className={labelClass}>Centro Gestor</label>
              <input readOnly className={readOnlyClass} value={form.centro_gestor} />
            </div>
            <div>
              <label className={labelClass}>Fecha de Elaboración</label>
              <input readOnly className={readOnlyClass} value={new Date().toLocaleDateString('es-MX')} />
            </div>
            <div>
              <label className={labelClass}>Ciclo / Año Fiscal</label>
              <input readOnly className={readOnlyClass} value={añoActual} />
            </div>
          </div>
        </section>

        {/* ── 2. Proyecto ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-l-4 border-[#ED7102]">
            2. Proyecto
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className={labelClass}>Nombre del Proyecto *</label>
              <input required className={inputClass} value={form.nombre_proyecto}
                onChange={e => set('nombre_proyecto', e.target.value)}
                placeholder="Ej. Cambio de cristales dañados edificio secundaria" />
            </div>
            <div>
              <label className={labelClass}>Tipo de Iniciativa *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                {TIPOS_PROYECTO.map(tipo => {
                  const on = form.tipo_iniciativa === tipo;
                  return (
                    <button key={tipo} type="button" onClick={() => set('tipo_iniciativa', tipo)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left transition ${on ? 'border-[#ED7102] bg-[#ED7102] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-white' : 'border-slate-400'}`}>
                        {on && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-[11px] font-bold uppercase leading-tight">{tipo}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={labelClass}>Descripción / Justificación</label>
              <textarea className={inputClass + ' min-h-[110px] resize-none'} value={form.resumen_proyecto}
                onChange={e => set('resumen_proyecto', e.target.value)}
                placeholder="Describe el proyecto: objetivo, área afectada, características técnicas, medidas, materiales, motivo de la solicitud..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fecha Propuesta de Inicio</label>
                <input type="date" className={inputClass} value={form.fecha_inicio_propuesta}
                  onChange={e => set('fecha_inicio_propuesta', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Fecha en que se Requiere Obra Concluida</label>
                <input type="date" className={inputClass} value={form.fecha_fin_propuesta}
                  onChange={e => set('fecha_fin_propuesta', e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">Las fechas propuestas estarán sujetas a la aprobación de los aspectos legales y de construcción, así como del protocolo de autorización.</p>
          </div>
        </section>

        {/* ── 3. Plan de financiamiento ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-l-4 border-[#ED7102]">
            3. Plan de Financiamiento
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-[1fr_auto] md:grid-cols-[180px_1fr_70px] items-center gap-2 md:gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <label className={labelClass + ' col-span-2 md:col-span-1'}>
                Costo Aproximado Total {form.tipo_iniciativa !== 'GARANTÍAS' ? '*' : <span className="normal-case font-medium text-slate-400">(no requerido para Garantías)</span>}
              </label>
              <input type="text" className={inputClass + ' text-right font-mono font-bold'}
                required={form.tipo_iniciativa !== 'GARANTÍAS'}
                value={formatMXN(form.costo_aproximado)}
                onChange={e => set('costo_aproximado', parseMXN(e.target.value))}
                placeholder={form.tipo_iniciativa === 'GARANTÍAS' ? '$0.00 (sin costo)' : '$0.00'} />
              <span className="text-xs font-black text-slate-700 text-right">100%</span>
            </div>

            <div className="space-y-3">
              {fuente('Operación', 'monto_operacion', opMonto)}
              {fuente('FBC (Fondo Bajo Custodia)', 'monto_fbc', fbcMonto)}
              {fuente('Donativos', 'monto_donativos', donMonto)}
              {fuente('Otras Fuentes', 'monto_otras', otrasMonto)}
              {otrasMonto > 0 && (
                <div className={`rounded-lg p-3 border ${otrasSinDetalle ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                  <label className={labelClass + (otrasSinDetalle ? ' !text-red-700' : '')}>¿A qué se refiere "Otras Fuentes"? *</label>
                  <input type="text" ref={otrasDetalleRef}
                    className={otrasSinDetalle ? inputClass + ' !border-2 !border-red-500 !bg-white placeholder:text-red-400 focus:!ring-red-500' : inputClass}
                    aria-invalid={otrasSinDetalle}
                    value={form.monto_otras_detalle}
                    onChange={e => set('monto_otras_detalle', e.target.value)}
                    placeholder="Especifica de dónde proviene este monto (ej. aportación de municipio, venta de activo, etc.)" />
                  {otrasSinDetalle && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      ⚠ Obligatorio: escribe de qué fuente proviene el monto de "Otras Fuentes". Sin este dato no podrás enviar la solicitud.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Total y cuadre contra el costo */}
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className={labelClass}>Total Financiamiento</span>
                <span className="font-mono font-black text-slate-900">
                  {totalMonto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                  <span className={`ml-2 text-xs ${cuadra ? 'text-emerald-600' : totalMonto > costo && costo > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    {costo > 0 ? ((totalMonto / costo) * 100).toFixed(0) + '%' : '0%'}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${cuadra ? 'bg-emerald-500' : totalMonto > costo && costo > 0 ? 'bg-red-500' : 'bg-orange-500'}`}
                  style={{ width: `${avanceFin}%` }} />
              </div>
              {costo > 0 && Math.abs(totalMonto - costo) > 1 && (
                <p className="mt-2 text-xs text-amber-700 font-bold">
                  ⚠ El total del financiamiento debe ser igual al costo aproximado. Diferencia: {(totalMonto - costo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── 4. Cotizaciones ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-l-4 border-[#ED7102]">
            4. Cotizaciones (opcional)
          </div>
          <div className="p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => { setTieneCotizaciones(!tieneCotizaciones); if (tieneCotizaciones) setCotizacionFiles([]); }}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${tieneCotizaciones ? 'bg-[#ED7102]' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${tieneCotizaciones ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-semibold text-slate-700">¿Ya tienes cotizaciones para adjuntar?</span>
            </label>

            {tieneCotizaciones && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Adjunta tus cotizaciones (PDF, imágenes, Word, etc.). Se subirán a SharePoint automáticamente al enviar la solicitud.
                </p>
                <label
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                  onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation(); setDragActive(false);
                    const EXT_PERMITIDAS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.zip'];
                    const dropped = Array.from(e.dataTransfer.files ?? []).filter(f =>
                      EXT_PERMITIDAS.some(ext => f.name.toLowerCase().endsWith(ext))
                    );
                    if (dropped.length === 0) { toast.error('Formato no permitido. Usa PDF, Word, Excel, imagen o ZIP.'); return; }
                    setCotizacionFiles(prev => [...prev, ...dropped]);
                  }}
                  className={`flex items-center gap-3 cursor-pointer border-2 border-dashed rounded-lg px-4 py-3 transition
                  ${dragActive ? 'border-teal-500 bg-teal-100 scale-[1.01]' : cotizacionFiles.length > 0 ? 'border-teal-400 bg-teal-50' : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    {cotizacionFiles.length === 0
                      ? <span className="text-sm text-slate-500">Arrastra tus archivos aquí o haz clic para seleccionarlos...</span>
                      : <span className="text-sm text-teal-700 font-semibold">{cotizacionFiles.length} archivo{cotizacionFiles.length > 1 ? 's' : ''} seleccionado{cotizacionFiles.length > 1 ? 's' : ''} — arrastra más para agregar</span>
                    }
                  </div>
                  <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                    className="hidden"
                    onChange={e => setCotizacionFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
                </label>

                {cotizacionFiles.length > 0 && (
                  <ul className="space-y-1">
                    {cotizacionFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded px-3 py-1.5">
                        <span className="text-xs text-teal-800 font-medium truncate">{f.name}</span>
                        <button type="button" onClick={() => setCotizacionFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 text-xs ml-2 shrink-0">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <p className="text-[11px] text-slate-500 text-center">
          Para iniciar el proyecto se deberá tener el visto bueno de la Gerencia y de la Coordinación de Obras y Mantenimiento RCMA. Todas las solicitudes deberán incluir un mínimo de 3 cotizaciones.
        </p>

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#ED7102] text-white font-bold text-sm rounded-xl hover:bg-[#d66500] disabled:opacity-50 transition shadow-sm">
          <Send className="w-4 h-4" />
          {loading ? 'Enviando solicitud...' : 'Enviar Solicitud de Proyecto'}
        </button>
      </form>

      {showConfirmSend && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">¿Enviar la solicitud?</h2>
            </div>
            <p className="text-sm text-slate-600">
              Verifica que todos los campos estén correctos antes de continuar — una vez enviada, la Coordinación de Obras será notificada de inmediato.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowConfirmSend(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Revisar de nuevo
              </button>
              <button onClick={doSubmit} disabled={loading}
                className="px-4 py-2 text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors">
                {loading ? 'Enviando...' : 'Sí, enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
