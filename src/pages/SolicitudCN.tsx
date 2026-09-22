import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import { useAuth } from '@/lib/AuthContext';
import { useDirectorio, type DirectorioColegio, findColegio } from '@/lib/directorio';
import { toast } from 'sonner';
import { Send, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

const inputClass    = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-700 cursor-default";
const labelClass    = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";

const thStyle = "bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center";
const tdLabel = "border border-slate-400 px-2 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-700 uppercase w-48";
const tdInput = "border border-slate-400 px-0 py-0";

// Esqueleto fijo (nombre, código interno, territorio) para las filas de oficina/FMA
// que no están individualizadas en Directorio — mismo criterio que Ticket MAS.
const COLEGIOS_CN_FMA = [
  { nombre: 'OF. MTY',  codigo: 'MTY-OF',  territorio: 'FMA' },
  { nombre: 'OF. CDMX', codigo: 'CDMX-OF', territorio: 'FMA' },
  { nombre: 'GENERAL',  codigo: 'FMA-GEN', territorio: 'FMA' },
];

function buildColegiosCN(directorioRows: DirectorioColegio[]) {
  const deColegios = directorioRows
    .filter(r => r.territorio === 'NORTE' || r.territorio === 'MEXICO')
    .map(r => ({
      nombre: r.nombre, razon: r.nombre_oficial, territorio: r.territorio,
      sociedad: r.sociedad ?? '', centro_gestor: r.centro_gestor ?? '',
    }));
  const general = findColegio(directorioRows, 'GENERAL');
  const deFMA = COLEGIOS_CN_FMA.map(f => ({
    nombre: f.nombre, razon: general?.nombre_oficial ?? 'Federación Mano Amiga A.C.', territorio: f.territorio,
    sociedad: general?.sociedad ?? '', centro_gestor: general?.centro_gestor ?? '',
  }));
  return [...deColegios, ...deFMA];
}

interface Concepto { id: string; nombre: string; materia: string; }

export default function SolicitudCN() {
  const { user } = useAuth();
  const [enviado, setEnviado]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);

  const { data: directorioRows = [] } = useDirectorio();
  const colegiosCN = useMemo(() => buildColegiosCN(directorioRows), [directorioRows]);

  const { data: conceptos = [] } = useQuery({
    queryKey: ['compliance_conceptos_activos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos')
        .select('id, nombre, materia').eq('activo', true).order('orden');
      if (error) throw error;
      return (data ?? []) as Concepto[];
    },
  });

  // Autollenado de Nombre / Puesto / Correo del usuario que tiene la sesión iniciada —
  // los captura el admin al invitar al usuario en Accesos, así que aquí sólo se muestran.
  const { data: miPerfil } = useQuery({
    queryKey: ['mi_perfil_solicitud_cn', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase.from('user_permissions')
        .select('nombre, puesto').eq('user_email', user.email).maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });

  const [form, setForm] = useState({
    colegio: '', razon_social: '', sociedad: '', centro_gestor: '', territorio: '',
    nombre_solicitante: '', puesto_solicitante: '', correo_solicitante: user?.email ?? '',
    concepto_id: '', concepto_nombre: '', especificacion: '',
    descripcion: '', fecha_requerida: '', costo_estimado: '',
    en_nombre_de: '',
  });

  useEffect(() => {
    if (miPerfil) {
      setForm(p => ({
        ...p,
        nombre_solicitante: miPerfil.nombre ?? p.nombre_solicitante,
        puesto_solicitante: miPerfil.puesto ?? p.puesto_solicitante,
      }));
    }
    if (user?.email) setForm(p => ({ ...p, correo_solicitante: user.email! }));
  }, [miPerfil, user?.email]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleColegio = (val: string) => {
    const c = colegiosCN.find(c => c.nombre === val);
    setForm(p => ({
      ...p,
      colegio: val,
      razon_social:  c?.razon ?? '',
      sociedad:      c?.sociedad ?? '',
      centro_gestor: c?.centro_gestor ?? '',
      territorio:    c?.territorio ?? '',
    }));
  };

  const handleConcepto = (id: string) => {
    const c = conceptos.find(c => c.id === id);
    setForm(p => ({ ...p, concepto_id: id, concepto_nombre: c?.nombre ?? '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.colegio)             { toast.error('Selecciona el colegio'); return; }
    if (!form.correo_solicitante)  { toast.error('El correo es requerido'); return; }
    if (!form.concepto_id)         { toast.error('Selecciona el concepto base del catálogo'); return; }
    if (!form.especificacion.trim()) { toast.error('Especifica el trámite (ej. "Señaléticas y puntos de reunión")'); return; }
    if (!form.nombre_solicitante)  { toast.error('El nombre del solicitante es requerido'); return; }
    setShowConfirmSend(true);
  };

  const doSubmit = async () => {
    setShowConfirmSend(false);
    setLoading(true);
    try {
      const { data: nueva, error } = await supabase.from('compliance_solicitudes_cn').insert({
        colegio:             form.colegio,
        territorio:          form.territorio,
        razon_social:        form.razon_social,
        sociedad:            form.sociedad,
        centro_gestor:       form.centro_gestor,
        concepto_id:         form.concepto_id,
        concepto_nombre:     form.concepto_nombre,
        especificacion:      form.especificacion.trim(),
        nombre_solicitante:  form.nombre_solicitante,
        puesto_solicitante:  form.puesto_solicitante,
        correo_solicitante:  form.correo_solicitante,
        descripcion:         form.descripcion.trim() || null,
        fecha_requerida:     form.fecha_requerida || null,
        costo_estimado:      form.costo_estimado ? Number(form.costo_estimado) : null,
      }).select('id').single();
      if (error) throw error;

      logAudit({
        accion: 'crear', modulo: 'solicitudes_cn', registro_id: nueva?.id ?? null,
        registro_ref: `${form.concepto_nombre} — ${form.especificacion}`,
        detalle: { solicitante: form.nombre_solicitante, colegio: form.colegio },
        en_nombre_de: form.en_nombre_de.trim() || null,
      });

      await supabase.functions.invoke('notify-nueva-solicitud-cn', {
        body: {
          nombre: form.nombre_solicitante, puesto: form.puesto_solicitante,
          concepto: form.concepto_nombre, especificacion: form.especificacion,
          colegio: form.colegio, territorio: form.territorio,
          correoSolicitante: form.correo_solicitante,
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
        <h2 className="text-2xl font-black text-slate-900">¡Solicitud CN Enviada!</h2>
        <p className="text-slate-500 text-center max-w-md">
          Tu solicitud de trámite de Cumplimiento Normativo / Protección Civil fue recibida. Recibirás una confirmación a <strong>{form.correo_solicitante}</strong> cuando sea revisada.
        </p>
        <button onClick={() => { setEnviado(false); setForm(p => ({ ...p, colegio:'', razon_social:'', sociedad:'', centro_gestor:'', territorio:'', concepto_id:'', concepto_nombre:'', especificacion:'', descripcion:'', fecha_requerida:'', costo_estimado:'', en_nombre_de:'' })); }}
          className="px-6 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
          Nueva Solicitud CN
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-0">
      <div className="border-2 border-slate-800">
        <div className="bg-slate-800 text-white py-3 px-4 flex items-center justify-between">
          <div className="text-center flex-1">
            <h1 className="text-sm font-black uppercase tracking-widest">Red de Colegios Mano Amiga</h1>
            <h2 className="text-xs font-bold uppercase tracking-wider mt-0.5 text-slate-300">Solicitud CN — Cumplimiento Normativo / Protección Civil</h2>
          </div>
          <img src="/colegio-mano-amiga.png" alt="Mano Amiga" className="h-12 w-auto object-contain ml-4 rounded" />
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── I. IDENTIFICACIÓN ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">I. Identificación</span>
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
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
                <tr>
                  <td className={tdLabel}>Colegio *</td>
                  <td className={tdInput} colSpan={2}>
                    <select required className={`${inputClass} bg-white`} value={form.colegio} onChange={e => handleColegio(e.target.value)}>
                      <option value="">Seleccionar colegio...</option>
                      {colegiosCN.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                  </td>
                  <td className={tdLabel}>Territorio</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={form.territorio} />
                  </td>
                </tr>
                <tr>
                  <td className={tdLabel}>Razón Social</td>
                  <td className={tdInput} colSpan={2}>
                    <input readOnly className={readOnlyClass} value={form.razon_social} placeholder="Se completa al seleccionar colegio" />
                  </td>
                  <td className={tdLabel}>Sociedad</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={form.sociedad} />
                  </td>
                </tr>
                <tr>
                  <td className={tdLabel}>Nombre del Solicitante *</td>
                  <td className={tdInput} colSpan={2}>
                    <input readOnly className={readOnlyClass} value={form.nombre_solicitante} placeholder="Autollenado por tu perfil" />
                  </td>
                  <td className={tdLabel}>Puesto</td>
                  <td className={tdInput}>
                    <input readOnly className={readOnlyClass} value={form.puesto_solicitante} />
                  </td>
                </tr>
                <tr>
                  <td className={tdLabel}>Correo de Notificación *</td>
                  <td className={tdInput} colSpan={4}>
                    <input readOnly className={readOnlyClass} value={form.correo_solicitante} />
                  </td>
                </tr>
                <tr>
                  <td className={tdLabel}>¿Llenando a nombre de otra persona?</td>
                  <td className={tdInput} colSpan={4}>
                    <input className={inputClass} value={form.en_nombre_de}
                      onChange={e => set('en_nombre_de', e.target.value)}
                      placeholder="Opcional — si estás capturando esta solicitud por otra persona, escribe su nombre aquí" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── II. CONCEPTO DEL TRÁMITE (catálogo + especificación libre) ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">II. Concepto del Trámite</span>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className={labelClass + " block mb-1"}>Concepto Base (Catálogo de Cumplimiento) *</label>
                <select required className={`${inputClass} bg-white`} value={form.concepto_id} onChange={e => handleConcepto(e.target.value)}>
                  <option value="">Seleccionar concepto del catálogo...</option>
                  {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.materia}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass + " block mb-1"}>Especifica el trámite *</label>
                <input required className={inputClass} value={form.especificacion}
                  onChange={e => set('especificacion', e.target.value)}
                  placeholder='Ej. "Señaléticas y puntos de reunión" o "Planos de rutas de evacuación" — para no perder detalle cuando el concepto base no lo incluye' />
                <p className="text-[10px] text-slate-500 italic mt-1">Usa este campo para precisar exactamente qué se necesita dentro del concepto elegido.</p>
              </div>
            </div>
          </div>

          {/* ── III. DESCRIPCIÓN Y COSTO ── */}
          <div className="border-b border-slate-400">
            <div className="bg-slate-200 px-3 py-1.5 border-b border-slate-400">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">III. Descripción y Costo Estimado</span>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className={labelClass + " block mb-1"}>Descripción / Justificación</label>
                <textarea className={`${inputClass} h-24 resize-none`} value={form.descripcion}
                  onChange={e => set('descripcion', e.target.value)}
                  placeholder="Contexto del trámite: motivo, área involucrada, urgencia, observación de inspección, etc." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass + " block mb-1"}>Fecha en que se Requiere Resuelto</label>
                  <input type="date" className={inputClass} value={form.fecha_requerida}
                    onChange={e => set('fecha_requerida', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass + " block mb-1"}>Costo Estimado (opcional)</label>
                  <input type="number" step="0.01" className={inputClass} value={form.costo_estimado}
                    onChange={e => set('costo_estimado', e.target.value)} placeholder="$0.00" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-3 border-b border-slate-400">
            <p className="text-[10px] text-slate-500 italic text-center">
              Al ser aprobada, esta solicitud se convertirá en un Trámite CN dentro de Seguimiento de Trámites, donde se le dará seguimiento hasta su conclusión.
            </p>
          </div>

          <div className="p-4 flex justify-end bg-white">
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-md">
              <Send className="w-4 h-4" />
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud CN'}
            </button>
          </div>
        </form>
      </div>

      {showConfirmSend && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">¿Enviar la Solicitud CN?</h2>
            </div>
            <p className="text-sm text-slate-600">
              Verifica que todos los campos estén correctos antes de continuar — una vez enviada, la Coordinación será notificada de inmediato.
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
