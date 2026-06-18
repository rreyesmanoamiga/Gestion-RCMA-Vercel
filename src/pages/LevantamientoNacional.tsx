import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { COLEGIOS } from '@/lib/colegios';

// Mapa de código corto → datos del colegio (fuente: TicketMAS)
const DATOS_COLEGIO: Record<string, { nombre: string; director: string; admin: string }> = {
  ACA: { nombre: 'Mano Amiga Acapulco',         director: 'Guadalupe García Gaspar',           admin: 'Noemi Ignacio Garzón'            },
  AGS: { nombre: 'Mano Amiga Aguascalientes',    director: 'María del Pilar Gómez Cañizo',      admin: 'Gabriela García Pérez'           },
  CAN: { nombre: 'Mano Amiga Cancún',            director: 'Francisco Paul Martínez Contreras', admin: 'ÁNGEL MARTÍN KU UUH'             },
  CHA: { nombre: 'Mano Amiga Chalco',            director: 'José Manuel Fierro Partida',        admin: 'Elizabeth Reyes Rivas'           },
  CIM: { nombre: 'Mano Amiga La Cima',           director: 'Daniel Garcia de la Torre',         admin: 'Juan Carlos Cepeda Scott'        },
  CON: { nombre: 'Mano Amiga Conkal',            director: 'Carolina Rodriguez Galván',         admin: 'Margarita Pech Rodriguez'        },
  GDL: { nombre: 'Mano Amiga Guadalajara',       director: 'Lorena López Taymani',              admin: 'Jose Ramon Iturbero Apecechea'   },
  LEO: { nombre: 'Mano Amiga León',              director: 'Víctor Hugo Martínez Guerrero',     admin: 'José Antonio Ávalos Ortega'      },
  LER: { nombre: 'Mano Amiga Lerma',             director: 'Alejandro de la Garza Ransom',      admin: 'María Candelaria Morones'        },
  MOR: { nombre: 'Mano Amiga Morelia',           director: 'César Augusto González Rodríguez',  admin: 'Rodrigo Vargas Hernández'        },
  MTY: { nombre: 'Mano Amiga Monterrey',         director: 'Adriana Gómez Díaz',                admin: 'Claudia Nelly Rojas Hernández'   },
  PIE: { nombre: 'Mano Amiga Piedras Negras',    director: 'Paolo René Oscos Snowball',         admin: 'Ana Gabriela Gauna López'        },
  PUE: { nombre: 'Mano Amiga Puebla',            director: 'Juan Francisco Serrano Garcia',     admin: 'Erika Iliana Aguilar Tlapanco'   },
  QRO: { nombre: 'Mano Amiga Querétaro',         director: 'Justino Gómez Pedraza',             admin: 'Claudia Janett Arreola Camacho'  },
  SCA: { nombre: 'Mano Amiga Santa Catarina',    director: 'Jesús Gerardo Castillo Oliva',      admin: 'Alma Nelly Blanco Lopez'         },
  TAP: { nombre: 'Mano Amiga Tapachula',         director: 'José Octavio Ramos Martínez',       admin: 'Eliabet Salas Escobar'           },
  TIJ: { nombre: 'Mano Amiga Tijuana',           director: 'Francisco Daniel Robles Noriega',   admin: 'Juana Rosa Cornejo Ledesma'      },
  TOR: { nombre: 'Mano Amiga Torreón',           director: 'Ma. Teresa Robles Limones',         admin: 'Maria Alicia Vilchis Esquivel'   },
  VSJ: { nombre: 'Mano Amiga Villa de Santiago', director: '',                                   admin: ''                                },
  ZOM: { nombre: 'Mano Amiga Zompopa',           director: '',                                   admin: ''                                },
};

// Extrae el código corto de la clave: 'MA QRO' → 'QRO'
function codigoCorto(clave: string): string {
  return clave.replace(/^MA\s+/, '').trim();
}
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  MapPin, ClipboardList, DollarSign, FileText, Upload,
  Calendar, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Plus, X, Edit2, Save, Download, Eye, Loader2
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plantel {
  id: string;
  colegio_clave: string;
  colegio_nombre: string;
  zona: string;
  eco_nombre: string;
  asignacion: string;
  fase: string;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  notas: string | null;
}

interface Entregable {
  id: string;
  plantel_id: string;
  mecanica_suelos: boolean;
  levant_arq: boolean;
  levant_estructural: boolean;
  levant_instalaciones: boolean;
  levant_conjunto: boolean;
  observaciones: string | null;
  acta_cierre_url: string | null;
  acta_cierre_nombre: string | null;
  acta_firmada: boolean;
  entregables_completos: boolean;
}

interface Pago {
  id: string;
  plantel_id: string;
  mes_numero: number;
  mes_etiqueta: string;
  concepto: string;
  monto_programado: number;
  monto_pagado: number | null;
  pagado: boolean;
  fecha_pago: string | null;
  notas: string | null;
}

interface Comunicado {
  id: string;
  plantel_id: string;
  fecha_emision: string;
  fecha_visita: string | null;
  director_nombre: string | null;
  director_correo: string | null;
  notas: string | null;
  onedrive_url: string | null;
  onedrive_path: string | null;
  archivo_nombre: string | null;
}

interface Reporte {
  id: string;
  plantel_id: string | null;
  fecha_reporte: string;
  archivo_nombre: string;
  onedrive_url: string | null;
  onedrive_path: string | null;
  notas: string | null;
}

interface DirectorioItem {
  id: string;
  codigo: string;
  nombre: string;
  territorio: string;
  dir_nombre: string;
  dir_correo: string;
}

// Fecha local sin desfase de timezone
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// ─── Constants ────────────────────────────────────────────────────────────────
const FASES = [
  { key: 'COMUNICADO', label: 'Comunicado',    color: 'bg-slate-100 text-slate-700'   },
  { key: 'FASE1',      label: 'Fase 1 – Campo', color: 'bg-blue-100 text-blue-700'    },
  { key: 'FASE2',      label: 'Fase 2 – Gab.',  color: 'bg-violet-100 text-violet-700'},
  { key: 'FASE3',      label: 'Fase 3 – Rev.',  color: 'bg-amber-100 text-amber-700'  },
  { key: 'FASE4',      label: 'Fase 4 – ECO',   color: 'bg-orange-100 text-orange-700'},
  { key: 'FASE5',      label: 'Fase 5 – Cierre','color': 'bg-emerald-100 text-emerald-700'},
];

const faseColor = (f: string) => FASES.find(x => x.key === f)?.color ?? 'bg-slate-100 text-slate-700';
const faseLabel = (f: string) => FASES.find(x => x.key === f)?.label ?? f;

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white';
const btnPrimary = 'px-4 py-2 bg-[#0C3B6E] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] transition-colors flex items-center gap-2 disabled:opacity-50';
const btnSecondary = 'px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'planteles',    label: 'Planteles',    icon: MapPin        },
  { key: 'pagos',        label: 'Pagos',        icon: DollarSign    },
  { key: 'comunicados',  label: 'Comunicados',  icon: FileText      },
  { key: 'reportes',     label: 'Reportes',     icon: Upload        },
  { key: 'entregables',  label: 'Entregables',  icon: ClipboardList },
];

// ─── PDF Generator ─────────────────────────────────────────────────────────────
function generarComunicadoPDF(plantel: Plantel, comunicado: Comunicado, dirNombre: string) {
  const fechaEmision = comunicado.fecha_emision
    ? new Date(comunicado.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const fechaVisita = comunicado.fecha_visita
    ? new Date(comunicado.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
    : '(por confirmar)';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 40px; line-height: 1.6; }
  .fecha { text-align: right; margin-bottom: 24px; }
  .asunto { margin-bottom: 12px; }
  .saludo { margin-bottom: 20px; }
  .intro { margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f0f0f0; font-weight: bold; }
  ul { margin: 8px 0 16px 24px; }
  li { margin-bottom: 4px; }
  .firma { margin-top: 40px; }
  .pie { margin-top: 4px; color: #555; }
  .footer { margin-top: 60px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
<div class="fecha">${fechaEmision}</div>
<div class="asunto"><strong>Asunto: Inicio de Proyectos de Levantamientos y Estudios.</strong></div>
<div class="saludo">Estimado/a <strong>${dirNombre || comunicado.director_nombre || ''}.</strong></div>
<div class="intro">
Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de <strong>levantamientos y estudios técnicos</strong> en las instalaciones de <strong>${plantel.colegio_nombre}</strong>.<br><br>
Este proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.
</div>
<strong>Detalles de la Visita</strong>
<table>
  <tr><th>Proveedor a Cargo</th><td>Navarro y Cal y Mayor Asociados S.A de C.V.</td></tr>
  <tr><th>Fecha de Ingreso</th><td>${fechaVisita}</td></tr>
</table>
<strong>Alcance de los Trabajos a Realizar</strong>
<p>Los trabajos técnicos que se llevarán a cabo incluyen:</p>
<ul>
  <li>Estudio de Mecánica de Suelos.</li>
  <li>Levantamientos Arquitectónicos.</li>
  <li>Levantamientos Estructurales.</li>
  <li>Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).</li>
  <li>Levantamiento de Planta de Conjunto.</li>
</ul>
<strong>Contacto del Proveedor</strong>
<p>El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:</p>
<table>
  <tr><th>Rol</th><th>Nombre</th><th>Correo Electrónico</th><th>Teléfono</th></tr>
  <tr><td>Líder de Proyecto</td><td>Arq. Fátima Vázquez</td><td>fvazquez@navarrocym.com.mx</td><td>(55) 5182 1276</td></tr>
</table>
<p>Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores, minimizando cualquier posible afectación a las actividades cotidianas del colegio/clínica.</p>
<p>Quedamos a su disposición para cualquier duda o aclaración.</p>
<div class="firma">
  <p>Atentamente,</p>
  <br>
  <p><strong>Ing. Ricardo Joanathan Reyes Medina</strong></p>
  <p class="pie">Coordinador de Obras y Mantenimiento RCMA.</p>
  <p class="pie">Coordinación de Obras y Mantenimiento RCMA</p>
</div>
<div class="footer">Coordinación de Obras y Mantenimiento RCMA</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast.error('Permite ventanas emergentes para generar el PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function LevantamientoNacional() {
  const [tab, setTab] = useState('planteles');
  const qc = useQueryClient();

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: planteles = [], isLoading: loadingP } = useQuery<Plantel[]>({
    queryKey: ['lev_planteles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_planteles').select('*').order('colegio_nombre');
      if (error) throw error;
      return data;
    },
  });

  const { data: entregables = [] } = useQuery<Entregable[]>({
    queryKey: ['lev_entregables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_entregables').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: pagos = [] } = useQuery<Pago[]>({
    queryKey: ['lev_pagos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_pagos').select('*').order('mes_numero');
      if (error) throw error;
      return data;
    },
  });

  const { data: comunicados = [] } = useQuery<Comunicado[]>({
    queryKey: ['lev_comunicados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_comunicados').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: reportes = [] } = useQuery<Reporte[]>({
    queryKey: ['lev_reportes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_reportes').select('*').order('fecha_reporte', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: directorio = [] } = useQuery<DirectorioItem[]>({
    queryKey: ['directorio'],
    queryFn: async () => {
      const { data, error } = await supabase.from('directorio').select('id,codigo,nombre,territorio,dir_nombre,dir_correo').order('nombre');
      if (error) throw error;
      return data;
    },
  });

  // ─── Stats ────────────────────────────────────────────────────────────────
  const totalContrato = 10342976.48;
  const totalPagado = pagos.filter(p => p.pagado).reduce((s, p) => s + (p.monto_pagado ?? p.monto_programado), 0);
  const completados = planteles.filter(p => p.fase === 'FASE5').length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Levantamiento Nacional"
        subtitle="Proyecto de Levantamientos y Estudios Técnicos — Contrato 110-057-MANO_AMIGA"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Planteles', value: planteles.length, color: 'text-[#0C3B6E]' },
          { label: 'Completados', value: completados, color: 'text-emerald-600' },
          { label: 'En Proceso', value: planteles.length - completados, color: 'text-amber-600' },
          { label: 'Pagado', value: `$${(totalPagado / 1e6).toFixed(2)}M`, color: 'text-[#F9A825]', sub: `de $${(totalContrato / 1e6).toFixed(2)}M` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-[#0C3B6E] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'planteles'   && <TabPlanteles planteles={planteles} loading={loadingP} qc={qc} directorio={directorio} />}
      {tab === 'pagos'       && <TabPagos pagos={pagos} planteles={planteles} qc={qc} />}
      {tab === 'comunicados' && <TabComunicados comunicados={comunicados} planteles={planteles} directorio={directorio} qc={qc} />}
      {tab === 'reportes'    && <TabReportes reportes={reportes} planteles={planteles} qc={qc} />}
      {tab === 'entregables' && <TabEntregables entregables={entregables} planteles={planteles} qc={qc} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PLANTELES
// ══════════════════════════════════════════════════════════════════════════════
function TabPlanteles({ planteles, loading, qc, directorio }: {
  planteles: Plantel[]; loading: boolean; qc: any; directorio: DirectorioItem[];
}) {
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Plantel | null>(null);
  const [territorio, setTerritorio] = useState('');
  const [colegio, setColegio]     = useState('');
  const [form, setForm] = useState({
    asignacion: 'PROVEEDOR', fase: 'COMUNICADO', fecha_inicio: '', fecha_termino: '', notas: ''
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Datos automáticos al seleccionar colegio
  const colegioInfo = COLEGIOS.find(c => c.colegio === colegio);
  const datosColegio = colegio ? DATOS_COLEGIO[codigoCorto(colegio)] : undefined;

  const colegiosFiltrados = useMemo(() =>
    territorio ? COLEGIOS.filter(c => c.territorio === territorio) : COLEGIOS,
    [territorio]
  );

  const openNew = () => {
    setEditItem(null);
    setTerritorio(''); setColegio('');
    setForm({ asignacion: 'PROVEEDOR', fase: 'COMUNICADO', fecha_inicio: '', fecha_termino: '', notas: '' });
    setShowForm(true);
  };

  const openEdit = (p: Plantel) => {
    setEditItem(p);
    // Restaurar territorio y colegio desde colegios.ts
    const info = COLEGIOS.find(c => c.colegio === p.colegio_clave);
    setTerritorio(info?.territorio ?? p.zona ?? '');
    setColegio(p.colegio_clave);
    setForm({
      asignacion: p.asignacion ?? 'PROVEEDOR',
      fase: p.fase,
      fecha_inicio: p.fecha_inicio ?? '',
      fecha_termino: p.fecha_termino ?? '',
      notas: p.notas ?? '',
    });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!colegio) throw new Error('Selecciona un colegio');
      const info  = COLEGIOS.find(c => c.colegio === colegio);
      const datos = DATOS_COLEGIO[codigoCorto(colegio)];
      const payload = {
        colegio_clave:  colegio,
        colegio_nombre: datos?.nombre ?? colegio,
        zona:           info?.territorio ?? territorio,
        eco_nombre:     info?.eco ?? null,
        asignacion:     form.asignacion || null,
        fase:           form.fase,
        fecha_inicio:   form.fecha_inicio || null,
        fecha_termino:  form.fecha_termino || null,
        notas:          form.notas || null,
        updated_at:     new Date().toISOString(),
      };
      if (editItem) {
        const { error } = await supabase.from('levantamiento_planteles').update(payload).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('levantamiento_planteles').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_planteles'] });
      toast.success(editItem ? 'Plantel actualizado' : 'Plantel agregado');
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className={btnPrimary}><Plus className="w-4 h-4" />Agregar Plantel</button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{editItem ? 'Editar Plantel' : 'Nuevo Plantel'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">

              {/* Territorio + Colegio — igual que el resto del sistema */}
              <ColegioSelector
                territorio={territorio}
                colegio={colegio}
                onTerritorioChange={val => { setTerritorio(val); setColegio(''); }}
                onColegioChange={val => setColegio(val)}
                required
              />

              {/* Info automática al seleccionar colegio */}
              {colegio && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nombre Oficial</p>
                      <p className="text-slate-700 font-medium">{datosColegio?.nombre ?? colegio}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Territorio</p>
                      <p className="text-slate-700">{colegioInfo?.territorio ?? territorio}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">ECO / Líder de Proyecto</p>
                      <p className="text-slate-700">{colegioInfo?.eco ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Director</p>
                      <p className="text-slate-700">{datosColegio?.director || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Administrador</p>
                      <p className="text-slate-700">{datosColegio?.admin || '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Asignación + Fase */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Asignación</label>
                  <select className={inputCls} value={form.asignacion} onChange={e => set('asignacion', e.target.value)}>
                    <option value="PROVEEDOR">PROVEEDOR</option>
                    <option value="ECO">ECO</option>
                    <option value="MA SERVICIOS">MA SERVICIOS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fase</label>
                  <select className={inputCls} value={form.fase} onChange={e => set('fase', e.target.value)}>
                    {FASES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha Inicio</label>
                  <input type="date" className={inputCls} value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha Cierre</label>
                  <input type="date" className={inputCls} value={form.fecha_termino} onChange={e => set('fecha_termino', e.target.value)} />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Notas</label>
                <textarea className={inputCls} rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !colegio} className={btnPrimary}>
                {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Colegio</th>
              <th className="text-left px-4 py-3">Territorio</th>
              <th className="text-left px-4 py-3">ECO / Líder</th>
              <th className="text-left px-4 py-3">Asignación</th>
              <th className="text-left px-4 py-3">Fase</th>
              <th className="text-left px-4 py-3">Inicio</th>
              <th className="text-left px-4 py-3">Cierre</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {planteles.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400">Sin planteles registrados</td></tr>
            )}
            {planteles.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <div>{p.colegio_nombre}</div>
                  <div className="text-xs text-slate-400">{p.colegio_clave}</div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{p.zona}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{p.eco_nombre ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{p.asignacion}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${faseColor(p.fase)}`}>
                    {faseLabel(p.fase)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {p.fecha_inicio ? new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {p.fecha_termino ? new Date(p.fecha_termino + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-[#0C3B6E]">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PAGOS (Flujograma)
// ══════════════════════════════════════════════════════════════════════════════
function TabPagos({ pagos, planteles, qc }: { pagos: Pago[]; planteles: Plantel[]; qc: any }) {
  const [selectedPlantel, setSelectedPlantel] = useState('');
  const [editingPago, setEditingPago] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ monto_pagado: '', fecha_pago: '', pagado: false, notas: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ mes_numero: '', mes_etiqueta: '', concepto: 'Mecánica de Suelos', monto_programado: '', plantel_id: '' });

  const pagosFiltrados = selectedPlantel ? pagos.filter(p => p.plantel_id === selectedPlantel) : pagos;

  const updateMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('levantamiento_pagos').update({
        monto_pagado: editForm.monto_pagado ? parseFloat(editForm.monto_pagado) : null,
        fecha_pago: editForm.fecha_pago || null,
        pagado: editForm.pagado,
        notas: editForm.notas || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lev_pagos'] }); setEditingPago(null); toast.success('Pago actualizado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('levantamiento_pagos').insert({
        plantel_id: addForm.plantel_id,
        mes_numero: parseInt(addForm.mes_numero),
        mes_etiqueta: addForm.mes_etiqueta,
        concepto: addForm.concepto,
        monto_programado: parseFloat(addForm.monto_programado) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lev_pagos'] }); setShowAdd(false); toast.success('Pago agregado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (p: Pago) => {
    setEditingPago(p.id);
    setEditForm({ monto_pagado: p.monto_pagado?.toString() ?? '', fecha_pago: p.fecha_pago ?? '', pagado: p.pagado, notas: p.notas ?? '' });
  };

  const totalProg = pagosFiltrados.reduce((s, p) => s + p.monto_programado, 0);
  const totalPag = pagosFiltrados.filter(p => p.pagado).reduce((s, p) => s + (p.monto_pagado ?? p.monto_programado), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className={`${inputCls} w-64`} value={selectedPlantel} onChange={e => setSelectedPlantel(e.target.value)}>
          <option value="">Todos los planteles</option>
          {planteles.map(p => <option key={p.id} value={p.id}>{p.colegio_nombre}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)} className={btnPrimary}><Plus className="w-4 h-4" />Agregar Pago</button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Programado</p>
          <p className="text-lg font-black text-slate-700">${totalProg.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600">Pagado</p>
          <p className="text-lg font-black text-emerald-700">${totalPag.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-xs text-amber-600">Pendiente</p>
          <p className="text-lg font-black text-amber-700">${(totalProg - totalPag).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Modal agregar */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Agregar Pago</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Plantel</label>
                <select className={inputCls} value={addForm.plantel_id} onChange={e => setAddForm(f => ({ ...f, plantel_id: e.target.value }))}>
                  <option value="">Seleccionar…</option>
                  {planteles.map(p => <option key={p.id} value={p.id}>{p.colegio_nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Mes #</label>
                  <input type="number" className={inputCls} value={addForm.mes_numero} onChange={e => setAddForm(f => ({ ...f, mes_numero: e.target.value }))} placeholder="0 = anticipo" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Etiqueta</label>
                  <input className={inputCls} value={addForm.mes_etiqueta} onChange={e => setAddForm(f => ({ ...f, mes_etiqueta: e.target.value }))} placeholder="MES 1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Concepto</label>
                <select className={inputCls} value={addForm.concepto} onChange={e => setAddForm(f => ({ ...f, concepto: e.target.value }))}>
                  <option>Mecánica de Suelos</option>
                  <option>Cala Estructural</option>
                  <option>Levantamiento General</option>
                  <option>Anticipo</option>
                  <option>Otros</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Monto Programado</label>
                <input type="number" className={inputCls} value={addForm.monto_programado} onChange={e => setAddForm(f => ({ ...f, monto_programado: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !addForm.plantel_id} className={btnPrimary}>
                {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Plantel</th>
              <th className="text-left px-4 py-3">Mes</th>
              <th className="text-left px-4 py-3">Concepto</th>
              <th className="text-right px-4 py-3">Programado</th>
              <th className="text-right px-4 py-3">Pagado</th>
              <th className="text-left px-4 py-3">Fecha Pago</th>
              <th className="text-center px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagosFiltrados.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400">Sin pagos registrados</td></tr>
            )}
            {pagosFiltrados.map(p => {
              const plantelNombre = planteles.find(pl => pl.id === p.plantel_id)?.colegio_nombre ?? '—';
              const editing = editingPago === p.id;
              return (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.pagado ? 'bg-emerald-50/30' : ''}`}>
                  <td className="px-4 py-3 text-slate-700 font-medium">{plantelNombre}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.mes_etiqueta || `MES ${p.mes_numero}`}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{p.concepto}</td>
                  <td className="px-4 py-3 text-right text-slate-700">${p.monto_programado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">
                    {editing ? (
                      <input type="number" className="w-28 px-2 py-1 border border-slate-300 rounded text-sm text-right"
                        value={editForm.monto_pagado} onChange={e => setEditForm(f => ({ ...f, monto_pagado: e.target.value }))} />
                    ) : (
                      <span className={p.pagado ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                        {p.monto_pagado != null ? `$${p.monto_pagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {editing ? (
                      <input type="date" className="px-2 py-1 border border-slate-300 rounded text-sm"
                        value={editForm.fecha_pago} onChange={e => setEditForm(f => ({ ...f, fecha_pago: e.target.value }))} />
                    ) : (
                      p.fecha_pago ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX') : '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing ? (
                      <input type="checkbox" checked={editForm.pagado} onChange={e => setEditForm(f => ({ ...f, pagado: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-600" />
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.pagado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing ? (
                      <div className="flex gap-1">
                        <button onClick={() => updateMut.mutate(p.id)} className="text-emerald-600 hover:text-emerald-800">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingPago(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-[#0C3B6E]">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: COMUNICADOS
// ══════════════════════════════════════════════════════════════════════════════
function TabComunicados({ comunicados, planteles, directorio, qc }: {
  comunicados: Comunicado[]; planteles: Plantel[]; directorio: DirectorioItem[]; qc: any;
}) {
  const [showForm, setShowForm]     = useState(false);
  const [previewCom, setPreviewCom] = useState<Comunicado | null>(null);
  const [deleteCom, setDeleteCom]   = useState<Comunicado | null>(null);
  const [form, setForm] = useState({
    plantel_id: '', fecha_emision: hoyLocal(), fecha_visita: '', notas: ''
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const plantelSel  = planteles.find(p => p.id === form.plantel_id);
  const datosCom    = plantelSel ? DATOS_COLEGIO[codigoCorto(plantelSel.colegio_clave)] : undefined;

  // Carga jsPDF dinámicamente (igual que Insumos/Reports)
  const loadJsPDF = async () => {
    let JsPDF = (window as any).jspdf?.jsPDF;
    if (!JsPDF) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => res(); s.onerror = () => rej(new Error('No se pudo cargar jsPDF'));
        document.head.appendChild(s);
      });
      JsPDF = (window as any).jspdf?.jsPDF;
    }
    return JsPDF;
  };

  // Genera PDF con jsPDF — devuelve Blob para subir a OneDrive
  const buildPDFBlob = async (plantel: Plantel, c: { fecha_emision: string; fecha_visita: string | null; director_nombre: string | null }): Promise<Blob> => {
    const JsPDF = await loadJsPDF();
    if (!JsPDF) throw new Error('No se pudo cargar el generador de PDF');

    const datos      = DATOS_COLEGIO[codigoCorto(plantel.colegio_clave)];
    const dirNombre  = c.director_nombre ?? datos?.director ?? '';
    const fechaEmision = c.fecha_emision
      ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const fechaVisita = c.fecha_visita
      ? new Date(c.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '(por confirmar)';

    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W  = 210;
    const ML = 20;   // margen izquierdo
    const MR = 22;   // margen derecho
    const TW = W - ML - MR;  // ancho útil: 168mm
    let y = 0;

    // ── HEADER ────────────────────────────────────────────────────────────
    doc.setFillColor(12, 59, 110); doc.rect(0, 0, W, 34, 'F');
    doc.setFillColor(249, 168, 37); doc.rect(0, 0, 5, 34, 'F');
    doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Comunicado Institucional', ML, 13);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
    doc.text('Coordinación de Obras y Mantenimiento RCMA  ·  ' + fechaEmision, ML, 21);
    doc.setFontSize(7.5); doc.setTextColor(130, 160, 190);
    doc.text('Documento interno — Mano Amiga', ML, 29);

    // Logo Mano Amiga (igual que Insumos)
    try {
      const logoImg = await new Promise<string>((res, rej) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
        img.onerror = rej; img.src = '/logo.png';
      });
      doc.addImage(logoImg, 'PNG', W - 36, 3, 24, 24);
    } catch { /* sin logo */ }

    y = 44;

    // ── ASUNTO ────────────────────────────────────────────────────────────
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
    doc.text('Asunto: Inicio de Proyectos de Levantamientos y Estudios.', ML, y); y += 8;

    // ── SALUDO ────────────────────────────────────────────────────────────
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text('Estimado/a ' + dirNombre + '.', ML, y); y += 10;

    // ── CUERPO ────────────────────────────────────────────────────────────
    const bodyLines = doc.splitTextToSize(
      'Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de levantamientos y estudios técnicos en las instalaciones de ' + plantel.colegio_nombre + '.',
      TW - 4);
    doc.setFontSize(9); doc.text(bodyLines, ML, y); y += bodyLines.length * 5.5 + 4;

    const body2 = doc.splitTextToSize(
      'Este proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.',
      TW - 4);
    doc.text(body2, ML, y); y += body2.length * 5.5 + 8;

    // ── TABLA DETALLES VISITA ─────────────────────────────────────────────
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
    doc.text('Detalles de la Visita', ML, y); y += 5;
    doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 4;

    const col1W = 70;
    // fila 1
    doc.setFillColor(241, 245, 249); doc.rect(ML, y - 3, col1W, 8, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
    doc.text('Proveedor a Cargo', ML + 2, y + 2);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    const prov = doc.splitTextToSize('Navarro y Cal y Mayor Asociados S.A de C.V.', TW - col1W - 2);
    doc.text(prov, ML + col1W + 2, y + 2); y += 10;

    // fila 2
    doc.setFillColor(241, 245, 249); doc.rect(ML, y - 3, col1W, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
    doc.text('Fecha de Ingreso', ML + 2, y + 2);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(fechaVisita, ML + col1W + 2, y + 2); y += 14;

    // ── ALCANCE ───────────────────────────────────────────────────────────
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
    doc.text('Alcance de los Trabajos a Realizar', ML, y); y += 5;
    doc.setDrawColor(200, 210, 220); doc.line(ML, y, W - MR, y); y += 5;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text('Los trabajos técnicos que se llevarán a cabo incluyen:', ML, y); y += 7;

    const alcance = [
      'Estudio de Mecánica de Suelos.',
      'Levantamientos Arquitectónicos.',
      'Levantamientos Estructurales.',
      'Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).',
      'Levantamiento de Planta de Conjunto.',
    ];
    alcance.forEach(item => {
      doc.setFillColor(12, 59, 110); doc.circle(ML + 3, y - 1.5, 0.8, 'F');
      const lines = doc.splitTextToSize(item, TW - 8);
      doc.text(lines, ML + 7, y); y += lines.length * 5.5 + 1;
    });
    y += 5;

    // ── CONTACTO PROVEEDOR ────────────────────────────────────────────────
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
    doc.text('Contacto del Proveedor', ML, y); y += 5;
    doc.setDrawColor(200, 210, 220); doc.line(ML, y, W - MR, y); y += 5;

    // Párrafo introductorio (faltaba en versión anterior)
    const contactoIntro = doc.splitTextToSize(
      'El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:',
      TW - 4);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(contactoIntro, ML, y); y += contactoIntro.length * 5.5 + 5;

    // Tabla contacto — anchos en % del TW para no salirse nunca
    // TW = 174mm. Distribución: Rol 22%, Nombre 26%, Correo 34%, Tel 18%
    const c1 = Math.floor(TW * 0.22);
    const c2 = Math.floor(TW * 0.26);
    const c3 = Math.floor(TW * 0.34);
    const c4 = TW - c1 - c2 - c3;

    // Header fila
    doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 8, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Rol',                ML + 2,           y + 2);
    doc.text('Nombre',             ML + c1 + 2,      y + 2);
    doc.text('Correo',             ML + c1 + c2 + 2, y + 2);
    doc.text('Teléfono',           ML + c1 + c2 + c3 + 2, y + 2); y += 10;

    // Datos fila — cada celda con splitTextToSize dentro de su columna
    doc.setFillColor(241, 245, 249); doc.rect(ML, y - 4, TW, 9, 'F');
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30); doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize('Líder de Proyecto',          c1 - 3), ML + 2,           y + 1);
    doc.text(doc.splitTextToSize('Arq. Fátima Vázquez',        c2 - 3), ML + c1 + 2,      y + 1);
    doc.text(doc.splitTextToSize('fvazquez@navarrocym.com.mx', c3 - 3), ML + c1 + c2 + 2, y + 1);
    doc.text(doc.splitTextToSize('(55) 5182 1276',             c4 - 3), ML + c1 + c2 + c3 + 2, y + 1);
    y += 13;

    // ── CIERRE ────────────────────────────────────────────────────────────
    const cierre1 = doc.splitTextToSize(
      'Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores, minimizando cualquier posible afectación a las actividades cotidianas del colegio/clínica.',
      TW - 4
    );
    const cierre2 = doc.splitTextToSize(
      'Quedamos a su disposición para cualquier duda o aclaración.',
      TW - 4
    );
    doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    doc.text(cierre1, ML, y); y += cierre1.length * 5.5 + 5;
    doc.text(cierre2, ML, y); y += cierre2.length * 5.5 + 9;

    // ── FIRMA ─────────────────────────────────────────────────────────────
    doc.text('Atentamente,', ML, y); y += 16;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
    doc.text('Ing. Ricardo Joanathan Reyes Medina', ML, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80); doc.setFontSize(8);
    doc.text('Coordinador de Obras y Mantenimiento RCMA', ML, y); y += 4;
    doc.text('Coordinación de Obras y Mantenimiento RCMA', ML, y);

    // ── FOOTER ────────────────────────────────────────────────────────────
    doc.setFillColor(12, 59, 110); doc.rect(0, 287, W, 10, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
    doc.text('Coordinación de Obras y Mantenimiento RCMA  —  Sistema RCMA', W / 2, 293, { align: 'center' });

    return doc.output('blob') as Blob;
  };

  // HTML para vista previa inline (iframe)
  const buildPreviewHTML = (plantel: Plantel, c: { fecha_emision: string; fecha_visita: string | null; director_nombre: string | null }) => {
    const datos      = DATOS_COLEGIO[codigoCorto(plantel.colegio_clave)];
    const dirNombre  = c.director_nombre ?? datos?.director ?? '';
    const fechaEmision = c.fecha_emision
      ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const fechaVisita = c.fecha_visita
      ? new Date(c.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '(por confirmar)';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      *{box-sizing:border-box;}
      html,body{margin:0;padding:0;width:100%;overflow-x:hidden;}
      body{font-family:Arial,sans-serif;font-size:13px;color:#222;line-height:1.6;background:#f0f0f0;}
      .page{background:#fff;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.12);}
      .header{background:#0C3B6E;color:#fff;padding:18px 32px 14px;border-left:6px solid #F9A825;display:flex;justify-content:space-between;align-items:center;}
      .header-text h1{margin:0;font-size:16px;} .header-text p{margin:3px 0 0;font-size:10px;color:#b0c4de;}
      .header img{height:44px;width:auto;flex-shrink:0;}
      .body{padding:28px 32px;}
      .asunto{font-weight:bold;color:#0C3B6E;margin-bottom:14px;font-size:13px;}
      p{margin:0 0 12px;word-wrap:break-word;overflow-wrap:break-word;}
      .section-title{font-weight:bold;color:#0C3B6E;font-size:13px;margin:18px 0 4px;}
      hr{border:none;border-top:1px solid #e2e8f0;margin:0 0 10px;}
      table{width:100%;border-collapse:collapse;margin:10px 0;table-layout:fixed;}
      th{background:#0C3B6E;color:#fff;padding:7px 10px;text-align:left;font-size:11.5px;word-wrap:break-word;}
      td{padding:7px 10px;font-size:11.5px;border-bottom:1px solid #e2e8f0;word-wrap:break-word;overflow-wrap:break-word;}
      tr:nth-child(even) td{background:#f8fafc;}
      .table-visita th{width:38%;}
      .table-contacto th:nth-child(1){width:18%;}
      .table-contacto th:nth-child(2){width:22%;}
      .table-contacto th:nth-child(3){width:38%;}
      .table-contacto th:nth-child(4){width:22%;}
      ul{margin:6px 0 12px 22px;padding:0;} li{margin-bottom:4px;word-wrap:break-word;}
      .firma{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;}
      .footer{background:#0C3B6E;color:#b0c4de;text-align:center;font-size:10px;padding:8px 32px;}
    </style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-text">
          <h1>Comunicado Institucional</h1>
          <p>Coordinación de Obras y Mantenimiento RCMA &nbsp;·&nbsp; ${fechaEmision}</p>
          <p style="margin-top:2px;font-size:9px;color:#8facc8;">Documento interno — Mano Amiga</p>
        </div>
        <img src="/logo.png" alt="Mano Amiga" onerror="this.style.display='none'">
      </div>
      <div class="body">
        <div class="asunto">Asunto: Inicio de Proyectos de Levantamientos y Estudios.</div>
        <p>Estimado/a <strong>${dirNombre}</strong>.</p>
        <p>Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de <strong>levantamientos y estudios técnicos</strong> en las instalaciones de <strong>${plantel.colegio_nombre}</strong>.</p>
        <p>Este proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.</p>
        <div class="section-title">Detalles de la Visita</div><hr>
        <table class="table-visita">
          <tr><th>Proveedor a Cargo</th><td>Navarro y Cal y Mayor Asociados S.A de C.V.</td></tr>
          <tr><th>Fecha de Ingreso</th><td>${fechaVisita}</td></tr>
        </table>
        <div class="section-title">Alcance de los Trabajos a Realizar</div><hr>
        <p>Los trabajos técnicos que se llevarán a cabo incluyen:</p>
        <ul>
          <li>Estudio de Mecánica de Suelos.</li>
          <li>Levantamientos Arquitectónicos.</li>
          <li>Levantamientos Estructurales.</li>
          <li>Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).</li>
          <li>Levantamiento de Planta de Conjunto.</li>
        </ul>
        <div class="section-title">Contacto del Proveedor</div><hr>
        <p>El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:</p>
        <table class="table-contacto">
          <tr><th>Rol</th><th>Nombre</th><th>Correo Electrónico</th><th>Teléfono</th></tr>
          <tr><td>Líder de Proyecto</td><td>Arq. Fátima Vázquez</td><td>fvazquez@navarrocym.com.mx</td><td>(55) 5182 1276</td></tr>
        </table>
        <p>Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores, minimizando cualquier posible afectación a las actividades cotidianas del colegio/clínica.</p>
        <p>Quedamos a su disposición para cualquier duda o aclaración.</p>
        <div class="firma">
          <p>Atentamente,</p><br>
          <strong>Ing. Ricardo Joanathan Reyes Medina</strong>
          <p style="color:#555;font-size:12px;margin:2px 0 0;">Coordinador de Obras y Mantenimiento RCMA</p>
          <p style="color:#555;font-size:12px;margin:2px 0 0;">Coordinación de Obras y Mantenimiento RCMA</p>
        </div>
      </div>
      <div class="footer">Coordinación de Obras y Mantenimiento RCMA — Sistema RCMA</div>
    </div>
    </body></html>`;
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      setSaving(true);
      try {
        const plantel = planteles.find(p => p.id === form.plantel_id);
        if (!plantel) throw new Error('Selecciona un plantel');

        const dirNombre = datosCom?.director ?? null;
        const blob = await buildPDFBlob(plantel, { fecha_emision: form.fecha_emision, fecha_visita: form.fecha_visita || null, director_nombre: dirNombre });
        const fecha = new Date(form.fecha_emision + 'T12:00:00');
        const anio  = fecha.getFullYear();
        const mes   = fecha.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        const carpeta   = `Levantamiento Nacional/Comunicados/${anio}/${mes}`;
        const fileName  = `Comunicado_${plantel.colegio_clave}_${form.fecha_emision}.pdf`;
        const fileObj   = new File([blob], fileName, { type: 'application/pdf' });

        const webUrl = await spUpload(fileObj, carpeta, fileName);

        const { error } = await supabase.from('levantamiento_comunicados').insert({
          plantel_id:      form.plantel_id,
          fecha_emision:   form.fecha_emision,
          fecha_visita:    form.fecha_visita || null,
          director_nombre: dirNombre,
          director_correo: null,
          notas:           form.notas || null,
          onedrive_url:    webUrl || null,
          onedrive_path:   carpeta,
          archivo_nombre:  fileName,
        });
        if (error) throw error;
      } finally {
        setSaving(false);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_comunicados'] });
      toast.success('Comunicado guardado y subido a OneDrive ✓');
      setShowForm(false);
      setForm({ plantel_id: '', fecha_emision: hoyLocal(), fecha_visita: '', notas: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (c: Comunicado) => {
      // Borrar de OneDrive si existe
      if (c.onedrive_path && c.archivo_nombre) {
        await spDelete(c.onedrive_path, c.archivo_nombre);
      }
      const { error } = await supabase.from('levantamiento_comunicados').delete().eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_comunicados'] });
      toast.success('Comunicado eliminado');
      setDeleteCom(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePreview = (c: Comunicado) => {
    const plantel = planteles.find(p => p.id === c.plantel_id);
    if (!plantel) { toast.error('Plantel no encontrado'); return; }
    setPreviewCom(c);
  };

  const handlePrint = async (c: Comunicado) => {
    const plantel = planteles.find(p => p.id === c.plantel_id);
    if (!plantel) return;
    try {
      const blob = await buildPDFBlob(plantel, c);
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { toast.error('Permite ventanas emergentes'); return; }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) {
      toast.error('Error generando PDF: ' + e.message);
    }
  };

  // HTML para vista previa inline en iframe
  const previewHTML = previewCom
    ? (() => { const pl = planteles.find(p => p.id === previewCom.plantel_id); return pl ? buildPreviewHTML(pl, previewCom) : ''; })()
    : '';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className={btnPrimary}><Plus className="w-4 h-4" />Nuevo Comunicado</button>
      </div>

      {/* Modal Nuevo Comunicado */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Nuevo Comunicado</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Plantel</label>
                <select className={inputCls} value={form.plantel_id} onChange={e => set('plantel_id', e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {planteles.map(p => <option key={p.id} value={p.id}>{p.colegio_nombre}</option>)}
                </select>
              </div>
              {datosCom && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                  <strong>Director:</strong> {datosCom.director || '—'}<br />
                  <strong>Administrador:</strong> {datosCom.admin || '—'}
                </div>
              )}
              {form.plantel_id && !datosCom && (
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">No se encontraron datos para este plantel.</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha de Emisión</label>
                  <input type="date" className={inputCls} value={form.fecha_emision} onChange={e => set('fecha_emision', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha de Visita</label>
                  <input type="date" className={inputCls} value={form.fecha_visita} onChange={e => set('fecha_visita', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Notas</label>
                <textarea className={inputCls} rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                📁 Se guardará en: <strong>Levantamiento Nacional / Comunicados / {new Date(form.fecha_emision + 'T12:00:00').getFullYear()} / {new Date(form.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long' }).toUpperCase()}</strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || saving || !form.plantel_id} className={btnPrimary}>
                {(saveMut.isPending || saving) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vista Previa */}
      {previewCom && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Vista Previa — Comunicado</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePrint(previewCom)} className={btnPrimary}>
                  <Download className="w-4 h-4" />Imprimir / PDF
                </button>
                <button onClick={() => setPreviewCom(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <iframe
                srcDoc={previewHTML}
                className="w-full h-full min-h-[600px] border-0"
                title="Vista previa comunicado"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar */}
      {deleteCom && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900">¿Eliminar comunicado?</h3>
            <p className="text-sm text-slate-600">
              Se eliminará el comunicado de <strong>{planteles.find(p => p.id === deleteCom.plantel_id)?.colegio_nombre}</strong> del sistema
              {deleteCom.onedrive_path ? ' y del OneDrive' : ''}.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteCom(null)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => deleteMut.mutate(deleteCom)} disabled={deleteMut.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Plantel</th>
              <th className="text-left px-4 py-3">Director</th>
              <th className="text-left px-4 py-3">Fecha Emisión</th>
              <th className="text-left px-4 py-3">Fecha Visita</th>
              <th className="text-left px-4 py-3">OneDrive</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comunicados.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin comunicados registrados</td></tr>
            )}
            {comunicados.map(c => {
              const plantel = planteles.find(p => p.id === c.plantel_id);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{plantel?.colegio_nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{c.director_nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {c.fecha_emision ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {c.fecha_visita ? new Date(c.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.onedrive_url
                      ? <a href={c.onedrive_url} target="_blank" rel="noreferrer" className="text-xs text-[#0C3B6E] hover:underline flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Ver en Drive</a>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handlePreview(c)} className="text-slate-400 hover:text-[#0C3B6E]" title="Vista previa">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePrint(c)} className="text-slate-400 hover:text-[#0C3B6E]" title="Imprimir / PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteCom(c)} className="text-slate-400 hover:text-red-500" title="Eliminar">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// TAB: REPORTES DIARIOS
// ══════════════════════════════════════════════════════════════════════════════
async function spDelete(carpeta: string, fileName: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? '';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  await fetch(`${SUPABASE_URL}/functions/v1/sharepoint-upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', carpeta, fileName }),
  });
}

async function spUpload(file: File, carpeta: string, fileName: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('carpeta', carpeta);
  formData.append('fileName', fileName);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? '';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sharepoint-upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string },
    body: formData,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error ?? 'Error al subir');
  return result.webUrl ?? '';
}

function carpetaDesde(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  const mes = d.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
  return `Levantamiento Nacional/${d.getFullYear()}/${mes}`;
}

function TabReportes({ reportes, planteles, qc }: { reportes: Reporte[]; planteles: Plantel[]; qc: any }) {
  const hoy = hoyLocal();
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Reporte | null>(null);
  const [form, setForm]           = useState({ plantel_id: '', plantel_id_2: '', fecha_reporte: hoy, notas: '' });
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditItem(null); setFile(null);
    setForm({ plantel_id: '', plantel_id_2: '', fecha_reporte: hoy, notas: '' });
    setShowForm(true);
  };

  const openEdit = (r: Reporte) => {
    setEditItem(r); setFile(null);
    setForm({ plantel_id: r.plantel_id ?? '', plantel_id_2: r.plantel_id_2 ?? '', fecha_reporte: r.fecha_reporte, notas: r.notas ?? '' });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        const nuevaCarpeta = carpetaDesde(form.fecha_reporte);

        if (editItem) {
          const carpetaVieja   = editItem.onedrive_path ?? '';
          const carpetaCambia  = carpetaVieja !== nuevaCarpeta;
          let webUrl           = editItem.onedrive_url ?? null;
          let archivoNombre    = editItem.archivo_nombre;

          if (file) {
            // Nuevo archivo: borra viejo en OneDrive y sube en la nueva ruta
            if (carpetaVieja && editItem.archivo_nombre) {
              await spDelete(carpetaVieja, editItem.archivo_nombre);
            }
            archivoNombre = `${form.fecha_reporte}_${file.name}`;
            webUrl = await spUpload(file, nuevaCarpeta, archivoNombre);
          } else if (carpetaCambia) {
            // Solo cambió la fecha (mes/año diferente) sin nuevo archivo
            toast.warning('La carpeta cambió. Sube el archivo nuevamente para moverlo en OneDrive.');
          }

          const { error } = await supabase.from('levantamiento_reportes').update({
            plantel_id:     form.plantel_id || null,
            plantel_id_2:   form.plantel_id_2 || null,
            fecha_reporte:  form.fecha_reporte,
            archivo_nombre: archivoNombre,
            onedrive_url:   webUrl,
            onedrive_path:  (file || carpetaCambia) ? nuevaCarpeta : carpetaVieja,
            notas:          form.notas || null,
          }).eq('id', editItem.id);
          if (error) throw error;

        } else {
          // NUEVO reporte
          if (!file) throw new Error('Selecciona un archivo PDF');
          const fileName = `${form.fecha_reporte}_${file.name}`;
          const webUrl   = await spUpload(file, nuevaCarpeta, fileName);
          const { error } = await supabase.from('levantamiento_reportes').insert({
            plantel_id:     form.plantel_id || null,
            plantel_id_2:   form.plantel_id_2 || null,
            fecha_reporte:  form.fecha_reporte,
            archivo_nombre: fileName,
            onedrive_url:   webUrl,
            onedrive_path:  nuevaCarpeta,
            notas:          form.notas || null,
          });
          if (error) throw error;
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_reportes'] });
      toast.success(editItem ? 'Reporte actualizado ✓' : 'Reporte subido a OneDrive ✓');
      setShowForm(false); setFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const carpetaPreview = carpetaDesde(form.fecha_reporte);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className={btnPrimary}><Upload className="w-4 h-4" />Subir Reporte</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{editItem ? 'Editar Reporte' : 'Subir Reporte Diario'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Plantel 1</label>
                  <select className={inputCls} value={form.plantel_id} onChange={e => set('plantel_id', e.target.value)}>
                    <option value="">Sin asignar</option>
                    {planteles.map(p => <option key={p.id} value={p.id}>{p.colegio_nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Plantel 2 (opcional)</label>
                  <select className={inputCls} value={form.plantel_id_2} onChange={e => set('plantel_id_2', e.target.value)}>
                    <option value="">—</option>
                    {planteles.filter(p => p.id !== form.plantel_id).map(p => <option key={p.id} value={p.id}>{p.colegio_nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha del Reporte</label>
                <input type="date" className={inputCls} value={form.fecha_reporte} onChange={e => set('fecha_reporte', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  {editItem ? 'Reemplazar archivo PDF (opcional)' : 'Archivo PDF'}
                </label>
                <input type="file" accept=".pdf" className={inputCls}
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>
              {editItem && !file && (
                <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-500 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-300" />
                  Archivo actual: {editItem.archivo_nombre}
                </div>
              )}
              {file && (
                <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-600 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              )}
              <div className={`rounded-lg p-3 text-xs ${file || !editItem ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                📁 {file || !editItem ? 'Se guardará en' : 'Ruta actual'}:{' '}
                <strong>{carpetaPreview}</strong>
                {editItem && editItem.onedrive_path !== carpetaPreview && editItem.onedrive_path && (
                  <span className="block mt-1 text-red-600">⚠ La carpeta cambió desde <em>{editItem.onedrive_path}</em> — sube el archivo para moverlo en OneDrive.</span>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Notas</label>
                <textarea className={inputCls} rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancelar</button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || uploading || (!editItem && !file)}
                className={btnPrimary}>
                {(saveMut.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editItem ? 'Guardar cambios' : 'Subir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Plantel</th>
              <th className="text-left px-4 py-3">Archivo</th>
              <th className="text-left px-4 py-3">Ruta OneDrive</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportes.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">Sin reportes subidos</td></tr>
            )}
            {reportes.map(r => {
              const plantel = planteles.find(p => p.id === r.plantel_id);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    {r.fecha_reporte ? new Date(r.fecha_reporte + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    <div>{plantel?.colegio_nombre ?? 'General'}</div>
                    {(() => { const p2 = planteles.find(p => p.id === r.plantel_id_2); return p2 ? <div className="text-slate-400">{p2.colegio_nombre}</div> : null; })()}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.archivo_nombre}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{r.onedrive_path ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.onedrive_url && (
                        <a href={r.onedrive_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#0C3B6E]">
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-[#0C3B6E]">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// TAB: ENTREGABLES (Checklist)
// ══════════════════════════════════════════════════════════════════════════════
function TabEntregables({ entregables, planteles, qc }: { entregables: Entregable[]; planteles: Plantel[]; qc: any }) {
  const [actaModal, setActaModal]   = useState<{ entId: string; plantelNombre: string } | null>(null);
  const [actaFile, setActaFile]     = useState<File | null>(null);
  const [actaUploading, setActaUploading] = useState(false);

  const CHECKS = [
    { field: 'mecanica_suelos',       label: 'Mecánica de Suelos'        },
    { field: 'levant_arq',            label: 'Levant. Arquitectónico'     },
    { field: 'levant_estructural',    label: 'Levant. Estructural'        },
    { field: 'levant_instalaciones',  label: 'Levant. Instalaciones'      },
    { field: 'levant_conjunto',       label: 'Planta de Conjunto'         },
  ];

  const updateMut = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      const { error } = await supabase.from('levantamiento_entregables')
        .update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lev_entregables'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: async (plantelId: string) => {
      const { error } = await supabase.from('levantamiento_entregables').insert({ plantel_id: plantelId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lev_entregables'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const actaMut = useMutation({
    mutationFn: async () => {
      if (!actaModal) return;
      setActaUploading(true);
      try {
        let webUrl: string | null = null;
        let fileName: string | null = null;

        if (actaFile) {
          fileName = `Acta_Cierre_${actaModal.plantelNombre.replace(/\s+/g, '_')}_${hoyLocal()}.pdf`;
          webUrl = await spUpload(actaFile, 'Levantamiento Nacional/Actas de Cierre', fileName);
        }

        const updatePayload: any = { acta_firmada: true, updated_at: new Date().toISOString() };
        if (fileName)  updatePayload.acta_cierre_nombre = fileName;
        if (webUrl)    updatePayload.acta_cierre_url    = webUrl;

        const { error } = await supabase.from('levantamiento_entregables')
          .update(updatePayload).eq('id', actaModal.entId);
        if (error) throw error;
      } finally {
        setActaUploading(false);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_entregables'] });
      toast.success('Acta de cierre registrada ✓');
      setActaModal(null); setActaFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {planteles.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Agrega planteles primero en la pestaña Planteles</div>
      )}

      {/* Modal Acta de Cierre */}
      {actaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Acta de Cierre — {actaModal.plantelNombre}</h3>
              <button onClick={() => { setActaModal(null); setActaFile(null); }}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600">Sube el PDF del acta firmada. Quedará guardada en OneDrive bajo <strong>Levantamiento Nacional / Actas de Cierre</strong>.</p>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Archivo PDF (opcional)</label>
                <input type="file" accept=".pdf" className={inputCls} onChange={e => setActaFile(e.target.files?.[0] ?? null)} />
              </div>
              {actaFile && (
                <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-600 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {actaFile.name} — {(actaFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                ⚠ Al confirmar se marcará como <strong>Acta Firmada</strong>. Podrás actualizar el estado de entregables por separado.
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => { setActaModal(null); setActaFile(null); }} className={btnSecondary}>Cancelar</button>
              <button onClick={() => actaMut.mutate()} disabled={actaMut.isPending || actaUploading} className={btnPrimary}>
                {(actaMut.isPending || actaUploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Confirmar Firma
              </button>
            </div>
          </div>
        </div>
      )}

      {planteles.map(plantel => {
        const ent   = entregables.find(e => e.plantel_id === plantel.id);
        const total = ent ? CHECKS.filter(c => (ent as any)[c.field]).length : 0;
        const todosCompletos = total === 5;

        // Estado del acta — entregables se derivan del checklist
        const actaFirmada = ent?.acta_firmada ?? false;

        let estadoBadge = null;
        if (actaFirmada && todosCompletos) {
          estadoBadge = <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />Cierre Completo</span>;
        } else if (actaFirmada && !todosCompletos) {
          estadoBadge = <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Circle className="w-3.5 h-3.5" />Acta Firmada — Entregables Pendientes</span>;
        } else if (actaFirmada) {
          estadoBadge = <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"><CheckCircle2 className="w-3.5 h-3.5" />Acta Firmada</span>;
        }

        return (
          <div key={plantel.id} className={`bg-white border rounded-xl p-4 ${actaFirmada && !todosCompletos ? 'border-amber-200' : actaFirmada && todosCompletos ? 'border-emerald-200' : 'border-slate-200'}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-bold text-slate-900">{plantel.colegio_nombre}</h4>
                <p className="text-xs text-slate-400">{plantel.colegio_clave} · {plantel.zona}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${faseColor(plantel.fase)}`}>
                  {faseLabel(plantel.fase)}
                </span>
                <span className="text-xs text-slate-500 font-medium">{total}/5</span>
                {!ent && (
                  <button onClick={() => createMut.mutate(plantel.id)} className="text-xs text-[#0C3B6E] hover:underline">
                    Iniciar checklist
                  </button>
                )}
              </div>
            </div>

            {/* Checklist */}
            {ent ? (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {CHECKS.map(c => {
                    const checked = (ent as any)[c.field] as boolean;
                    return (
                      <button key={c.field}
                        onClick={() => updateMut.mutate({ id: ent.id, field: c.field, value: !checked })}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          checked ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}>
                        {checked ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {/* Barra inferior — Acta de Cierre */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {estadoBadge}
                    {actaFirmada && ent.acta_cierre_url && (
                      <a href={ent.acta_cierre_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-[#0C3B6E] hover:underline">
                        <Eye className="w-3.5 h-3.5" />Ver acta
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Estado entregables — automático según checklist */}
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                      todosCompletos
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      {todosCompletos ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      {todosCompletos ? 'Entregables Completos' : 'Entregables Pendientes por Entrega'}
                    </span>
                    {/* Botón Acta de Cierre */}
                    {!actaFirmada ? (
                      <button
                        onClick={() => setActaModal({ entId: ent.id, plantelNombre: plantel.colegio_nombre })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0C3B6E] text-xs font-medium text-[#0C3B6E] hover:bg-blue-50 transition-all">
                        <Upload className="w-3.5 h-3.5" />Registrar Acta de Cierre
                      </button>
                    ) : (
                      <button
                        onClick={() => setActaModal({ entId: ent.id, plantelNombre: plantel.colegio_nombre })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-400 hover:border-slate-300 transition-all">
                        <Upload className="w-3.5 h-3.5" />Reemplazar acta
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">Sin checklist iniciado</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
