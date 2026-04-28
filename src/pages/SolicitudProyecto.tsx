import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Send, CheckCircle } from 'lucide-react';

const inputClass = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-700 cursor-default";
const labelClass = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";

const TIPOS_PROYECTO = ['CONSTRUCCIÓN NUEVA','MEJORA','PORTAFOLIO','REMODELACIÓN','ADECUACIÓN DE ESPACIO','GARANTÍAS','AMPLIACIÓN','MANTENIMIENTO EXTRAORDINARIO','REVISIÓN'];

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

const thStyle = "bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center";
const tdLabel = "border border-slate-400 px-2 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-700 uppercase w-48";
const tdInput = "border border-slate-400 px-0 py-0";
const tdNum   = "border border-slate-400 px-2 py-1.5 text-sm text-right font-mono";

export default function SolicitudProyecto() {
  const añoActual = new Date().getFullYear().toString();
  const [enviado, setEnviado]   = useState(false);
  const [loading, setLoading]   = useState(false);

  const [form, setForm] = useState({
    nombre_centro:          '',
    razon_social:           '',
    sociedad:               '',
    centro_gestor:          '',
    ciclo_año_fiscal:       añoActual,
    nombre_solicitante:     '',
    puesto_solicitante:     '',
    correo_solicitante:     '',
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
  });

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
  const pct = (m: number) => costo > 0 ? ((m / costo) * 100).toFixed(0) + '%' : '0%';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_centro)       { toast.error('Selecciona el nombre del centro'); return; }
    if (!form.correo_solicitante)  { toast.error('El correo es requerido'); return; }
    if (!form.nombre_proyecto)     { toast.error('El nombre del proyecto es requerido'); return; }
    if (!form.tipo_iniciativa)     { toast.error('Selecciona el tipo de iniciativa'); return; }

    setLoading(true);
    try {
      const { error } = await supabase.from('solicitudes').insert({
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
      });
      if (error) throw error;

      // Notificar al admin que llegó una nueva solicitud
      await supabase.functions.invoke('send-solicitud-recibida', {
        body: {
          tipo:    'nueva_solicitud',
          correo:  form.correo_solicitante,
          nombre:  form.nombre_solicitante,
          proyecto: form.nombre_proyecto,
          centro:  form.nombre_centro,
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
        <button onClick={() => { setEnviado(false); setForm({ nombre_centro:'',razon_social:'',sociedad:'',centro_gestor:'',ciclo_año_fiscal:añoActual,nombre_solicitante:'',puesto_solicitante:'',correo_solicitante:'',nombre_proyecto:'',tipo_iniciativa:'',resumen_proyecto:'',fecha_inicio_propuesta:'',fecha_fin_propuesta:'',costo_aproximado:'',monto_operacion:'',monto_fbc:'',monto_donativos:'',monto_otras:''}); }}
          className="px-6 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
          Nueva Solicitud
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-0">
      {/* Encabezado tipo formato oficial */}
      <div className="border-2 border-slate-800">
        {/* Título principal */}
        <div className="bg-slate-800 text-white text-center py-3">
          <h1 className="text-sm font-black uppercase tracking-widest">Red de Colegios Mano Amiga</h1>
          <h2 className="text-xs font-bold uppercase tracking-wider mt-0.5 text-slate-300">Solicitud de Inicio de Obra o Mantenimiento</h2>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── SECCIÓN I: IDENTIFICACIÓN ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">I. Identificación</span>
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {/* Fila 1: División + Fecha */}
                <tr>
                  <td className={tdLabel}>División</td>
                  <td className={tdInput} colSpan={2}>
                    <input readOnly className={readOnlyClass} value="Red De Colegios Mano Amiga" />
                  </td>
                  <td className={tdLabel}>Fecha de Elaboración</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={new Date().toLocaleDateString('es-MX')} />
                  </td>
                </tr>
                {/* Fila 2: Nombre del Centro */}
                <tr>
                  <td className={tdLabel}>Nombre del Centro *</td>
                  <td className={tdInput} colSpan={2}>
                    <select required className={`${inputClass} bg-white`} value={form.nombre_centro} onChange={e => handleColegio(e.target.value)}>
                      <option value="">Seleccionar colegio...</option>
                      {COLEGIOS_DATA.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
                    </select>
                  </td>
                  <td className={tdLabel}>Ciclo / Año Fiscal</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={añoActual} />
                  </td>
                </tr>
                {/* Fila 3: Razón Social */}
                <tr>
                  <td className={tdLabel}>Razón Social / Soc. Operadora</td>
                  <td className={tdInput} colSpan={2}>
                    <input readOnly className={readOnlyClass} value={form.razon_social} placeholder="Se completa al seleccionar colegio" />
                  </td>
                  <td className={tdLabel}>Sociedad</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={form.sociedad} />
                  </td>
                </tr>
                {/* Fila 4: Centro de Gestor */}
                <tr>
                  <td className={tdLabel}>Centro de Gestor</td>
                  <td className={tdInput} colSpan={2}>
                    <input readOnly className={readOnlyClass} value={form.centro_gestor} placeholder="Se completa al seleccionar colegio" />
                  </td>
                  <td className={tdLabel}></td>
                  <td className={tdInput}></td>
                </tr>
                {/* Fila 5: Nombre del Proyecto */}
                <tr>
                  <td className={tdLabel}>Nombre del Proyecto *</td>
                  <td className={tdInput} colSpan={4}>
                    <input required className={inputClass} value={form.nombre_proyecto}
                      onChange={e => set('nombre_proyecto', e.target.value)}
                      placeholder="Ej. Cambio de cristales dañados edificio secundaria" />
                  </td>
                </tr>
                {/* Fila 6: Solicitante */}
                <tr>
                  <td className={tdLabel}>Nombre del Solicitante *</td>
                  <td className={tdInput} colSpan={2}>
                    <input required className={inputClass} value={form.nombre_solicitante}
                      onChange={e => set('nombre_solicitante', e.target.value)}
                      placeholder="Nombre completo" />
                  </td>
                  <td className={tdLabel}>Puesto del Solicitante</td>
                  <td className={tdInput}>
                    <input className={inputClass} value={form.puesto_solicitante}
                      onChange={e => set('puesto_solicitante', e.target.value)}
                      placeholder="Ej. Administrador" />
                  </td>
                </tr>
                {/* Fila 7: Correo */}
                <tr>
                  <td className={tdLabel}>Correo de Notificación *</td>
                  <td className={tdInput} colSpan={4}>
                    <input required type="email" className={inputClass} value={form.correo_solicitante}
                      onChange={e => set('correo_solicitante', e.target.value)}
                      placeholder="correo@ejemplo.com — recibirás confirmación aquí" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── TIPO DE INICIATIVA ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Tipo de Iniciativa *</span>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              {TIPOS_PROYECTO.map(tipo => (
                <label key={tipo} className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    form.tipo_iniciativa === tipo ? 'border-slate-800 bg-slate-800' : 'border-slate-400 group-hover:border-slate-600'
                  }`}
                    onClick={() => set('tipo_iniciativa', tipo)}>
                    {form.tipo_iniciativa === tipo && <div className="w-2 h-2 bg-white" />}
                  </div>
                  <span className="text-xs font-medium text-slate-700 uppercase">{tipo}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── SECCIÓN II: RESUMEN DEL PROYECTO ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">II. Resumen del Proyecto</span>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className={labelClass + " block mb-1"}>Descripción / Justificación</label>
                <textarea className={`${inputClass} h-28 resize-none`} value={form.resumen_proyecto}
                  onChange={e => set('resumen_proyecto', e.target.value)}
                  placeholder="Describe el proyecto: objetivo, área afectada, características técnicas, medidas, materiales, motivo de la solicitud..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass + " block mb-1"}>Fecha Propuesta de Inicio</label>
                  <input type="date" className={inputClass} value={form.fecha_inicio_propuesta}
                    onChange={e => set('fecha_inicio_propuesta', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass + " block mb-1"}>Fecha en que se Requiere Obra Concluida</label>
                  <input type="date" className={inputClass} value={form.fecha_fin_propuesta}
                    onChange={e => set('fecha_fin_propuesta', e.target.value)} />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">Las fechas propuestas estarán sujetas a la aprobación de los aspectos legales y de construcción, así como del protocolo de autorización.</p>
            </div>
          </div>

          {/* ── SECCIÓN III: PLAN DE FINANCIAMIENTO ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">III. Plan de Financiamiento</span>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thStyle + " w-48"}>Fuente</th>
                  <th className={thStyle}>Monto (MXN)</th>
                  <th className={thStyle + " w-24"}>% del Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Costo total */}
                <tr className="bg-slate-50">
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-black text-slate-800 uppercase">Costo Aproximado Total *</td>
                  <td className={tdInput}>
                    <input type="text" className={inputClass + " text-right font-mono"} required
                      value={formatMXN(form.costo_aproximado)}
                      onChange={e => set('costo_aproximado', parseMXN(e.target.value))}
                      placeholder="$0.00" />
                  </td>
                  <td className={tdNum + " bg-slate-100 font-bold"}>100%</td>
                </tr>
                {/* Operación */}
                <tr>
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-bold text-slate-700 uppercase">Operación</td>
                  <td className={tdInput}>
                    <input type="text" className={inputClass + " text-right font-mono"}
                      value={formatMXN(form.monto_operacion)}
                      onChange={e => set('monto_operacion', parseMXN(e.target.value))}
                      placeholder="$0.00" />
                  </td>
                  <td className={tdNum}>{pct(opMonto)}</td>
                </tr>
                {/* FBC */}
                <tr>
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-bold text-slate-700 uppercase">FBC (Fondo Bajo Custodia)</td>
                  <td className={tdInput}>
                    <input type="text" className={inputClass + " text-right font-mono"}
                      value={formatMXN(form.monto_fbc)}
                      onChange={e => set('monto_fbc', parseMXN(e.target.value))}
                      placeholder="$0.00" />
                  </td>
                  <td className={tdNum}>{pct(fbcMonto)}</td>
                </tr>
                {/* Donativos */}
                <tr>
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-bold text-slate-700 uppercase">Donativos</td>
                  <td className={tdInput}>
                    <input type="text" className={inputClass + " text-right font-mono"}
                      value={formatMXN(form.monto_donativos)}
                      onChange={e => set('monto_donativos', parseMXN(e.target.value))}
                      placeholder="$0.00" />
                  </td>
                  <td className={tdNum}>{pct(donMonto)}</td>
                </tr>
                {/* Otras */}
                <tr>
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-bold text-slate-700 uppercase">Otras Fuentes</td>
                  <td className={tdInput}>
                    <input type="text" className={inputClass + " text-right font-mono"}
                      value={formatMXN(form.monto_otras)}
                      onChange={e => set('monto_otras', parseMXN(e.target.value))}
                      placeholder="$0.00" />
                  </td>
                  <td className={tdNum}>{pct(otrasMonto)}</td>
                </tr>
                {/* Total */}
                <tr className="bg-slate-100">
                  <td className="border border-slate-400 px-3 py-1.5 text-[11px] font-black text-slate-800 uppercase">Total Financiamiento</td>
                  <td className={tdNum + " border border-slate-400 font-black text-slate-900"}>
                    {totalMonto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                  </td>
                  <td className={`${tdNum} border border-slate-400 font-black ${
                    costo > 0 && Math.abs(totalMonto - costo) < 1 ? 'text-emerald-700' : totalMonto > costo && costo > 0 ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    {costo > 0 ? ((totalMonto / costo) * 100).toFixed(0) + '%' : '0%'}
                  </td>
                </tr>
              </tbody>
            </table>
            {costo > 0 && Math.abs(totalMonto - costo) > 1 && (
              <div className="px-3 py-2 bg-amber-50 border-t border-amber-200">
                <p className="text-xs text-amber-700 font-bold">
                  ⚠ El total del financiamiento debe ser igual al costo aproximado. Diferencia: {(totalMonto - costo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                </p>
              </div>
            )}
          </div>

          {/* ── PIE DEL FORMATO ── */}
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-400">
            <p className="text-[10px] text-slate-500 italic text-center">
              Para iniciar el proyecto se deberá tener el visto bueno de la Gerencia y de la Coordinación de Obras y Mantenimientos RCMA. Todas las solicitudes deberán incluir un mínimo de 3 cotizaciones.
            </p>
          </div>

          {/* ── BOTÓN ENVIAR ── */}
          <div className="p-4 flex justify-end bg-white">
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-md">
              <Send className="w-4 h-4" />
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud de Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
