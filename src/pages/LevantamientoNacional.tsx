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

// Necesitaremos la importación de jsPDF para la generación limpia de archivos con márgenes fijos.
import { jsPDF } from 'jspdf';

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

// ─── PDF Generator (Actualizado usando jsPDF con Márgenes Precisos) ───────────
function generarComunicadoPDF(plantel: Plantel, comunicado: Comunicado, dirNombre: string) {
  const fechaEmision = comunicado.fecha_emision
    ? new Date(comunicado.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const fechaVisita = comunicado.fecha_visita
    ? new Date(comunicado.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
    : '(por confirmar)';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  // Configuración de márgenes e impresión limpia
  let yPos = 25;
  const marginX = 25;
  const maxLineWidth = 165;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);

  // Fecha (Alineada a la derecha)
  doc.text(fechaEmision, 190, yPos, { align: 'right' });
  yPos += 15;

  // Asunto
  doc.setFont('Helvetica', 'bold');
  doc.text('Asunto: Inicio de Proyectos de Levantamientos y Estudios.', marginX, yPos);
  yPos += 12;

  // Saludo
  doc.setFont('Helvetica', 'normal');
  doc.text('Estimado/a ', marginX, yPos);
  doc.setFont('Helvetica', 'bold');
  const dirTexto = `${dirNombre || comunicado.director_nombre || ''}.`;
  doc.text(dirTexto, marginX + doc.getTextWidth('Estimado/a '), yPos);
  yPos += 12;

  // Cuerpo del mensaje
  doc.setFont('Helvetica', 'normal');
  const cuerpoTexto = `Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de levantamientos y estudios técnicos en las instalaciones de ${plantel.colegio_nombre}.\n\nEste proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.`;
  const lineasCuerpo = doc.splitTextToSize(cuerpoTexto, maxLineWidth);
  doc.text(lineasCuerpo, marginX, yPos);
  yPos += (lineasCuerpo.length * 6) + 4;

  // Detalles de la Visita (Tabla simulada limpia)
  doc.setFont('Helvetica', 'bold');
  doc.text('Detalles de la Visita', marginX, yPos);
  yPos += 6;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, yPos, maxLineWidth, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Proveedor a Cargo:', marginX + 4, yPos + 5.5);
  doc.setFont('Helvetica', 'normal');
  doc.text('Navarro y Cal y Mayor Asociados S.A de C.V.', marginX + 50, yPos + 5.5);
  yPos += 8;

  doc.rect(marginX, yPos, maxLineWidth, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Fecha de Ingreso:', marginX + 4, yPos + 5.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(fechaVisita, marginX + 50, yPos + 5.5);
  yPos += 14;

  // Alcance de los Trabajos
  doc.setFont('Helvetica', 'bold');
  doc.text('Alcance de los Trabajos a Realizar', marginX, yPos);
  yPos += 6;
  doc.setFont('Helvetica', 'normal');
  doc.text('Los trabajos técnicos que se llevarán a cabo incluyen:', marginX, yPos);
  yPos += 6;

  const puntosAlcance = [
    '- Estudio de Mecánica de Suelos.',
    '- Levantamientos Arquitectónicos.',
    '- Levantamientos Estructurales.',
    '- Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).',
    '- Levantamiento de Planta de Conjunto.'
  ];
  puntosAlcance.forEach(punto => {
    doc.text(punto, marginX + 5, yPos);
    yPos += 5.5;
  });
  yPos += 4;

  // Contacto del Proveedor
  doc.setFont('Helvetica', 'bold');
  doc.text('Contacto del Proveedor', marginX, yPos);
  yPos += 6;
  doc.setFont('Helvetica', 'normal');
  const provTexto = 'El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:';
  const lineasProv = doc.splitTextToSize(provTexto, maxLineWidth);
  doc.text(lineasProv, marginX, yPos);
  yPos += (lineasProv.length * 6) + 4;

  // Tabla de contacto reducida
  doc.setFillColor(230, 230, 230);
  doc.rect(marginX, yPos, maxLineWidth, 6, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Rol', marginX + 2, yPos + 4.5);
  doc.text('Nombre', marginX + 35, yPos + 4.5);
  doc.text('Correo Electrónico', marginX + 80, yPos + 4.5);
  doc.text('Teléfono', marginX + 135, yPos + 4.5);
  yPos += 6;

  doc.setFont('Helvetica', 'normal');
  doc.text('Líder Proyecto', marginX + 2, yPos + 4.5);
  doc.text('Arq. Fátima Vázquez', marginX + 35, yPos + 4.5);
  doc.text('fvazquez@navarrocym.com.mx', marginX + 80, yPos + 4.5);
  doc.text('(55) 5182 1276', marginX + 135, yPos + 4.5);
  yPos += 12;

  doc.setFontSize(11);
  const cierreTexto = 'Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores. Quedamos a su disposición.';
  const lineasCierre = doc.splitTextToSize(cierreTexto, maxLineWidth);
  doc.text(lineasCierre, marginX, yPos);
  yPos += (lineasCierre.length * 6) + 12;

  // Firma
  doc.text('Atentamente,', marginX, yPos);
  yPos += 14;
  doc.setFont('Helvetica', 'bold');
  doc.text('Ing. Ricardo Joanathan Reyes Medina', marginX, yPos);
  yPos += 5;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Coordinador de Obras y Mantenimiento RCMA.', marginX, yPos);

  // Footer institucional fijo al final de la página
  doc.setFontSize(9);
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, 262, 190, 262);
  doc.text('Coordinación de Obras y Mantenimiento RCMA', 105, 267, { align: 'center' });

  // Guardar de forma directa
  doc.save(`Comunicado_${plantel.colegio_clave}.pdf`);
  toast.success('PDF generado exitosamente con jsPDF');
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
    const info = COLEGIOS.find(c => c.colegio === p.colegio_clave);
    setTerritorio(info?.territorio ?? p.zona ?? '');
    setColegio(p.colegio_clave);
    setForm({
      asignacion: p.asignacion ?? 'PROVEEDOR',
      fase: p.fase,
      fecha_inicio: p.fecha_inicio ?? '',
      fecha_termino: p.fecha_termino ?? '',
      notas: p.notas ?? '', // 👈 ¡REPARADO AQUÍ! Corregido de p.notes a p.notas
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
        notas:          form.notas || null, // 👈 ¡REPARADO AQUÍ! Corregido de form.notes a form.notas
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

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{editItem ? 'Editar Plantel' : 'Nuevo Plantel'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <ColegioSelector
                territorio={territorio}
                colegio={colegio}
                onTerritorioChange={val => { setTerritorio(val); setColegio(''); }}
                onColegioChange={val => setColegio(val)}
                required
              />
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
// TAB: PAGOS 
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
                  <input type="number" className={inputCls} value={