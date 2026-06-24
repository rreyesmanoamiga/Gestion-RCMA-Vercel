import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
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
  VSJ: { nombre: 'Mano Amiga Villas de San Juan', director: '',                                   admin: ''                                },
  ZOM:    { nombre: 'Mano Amiga Zompopa',    director: '',                                        admin: ''                                   },
  CLINCOT: { nombre: 'Clínica Cotija',          director: 'Dr. Samuel Darío Pérez Soriano',  admin: ''                                   },
  CLINLER: { nombre: 'Clínica Lerma',           director: 'Dr. Samuel Darío Pérez Soriano',  admin: ''                                   },
};

// Extrae el código corto de la clave: 'MA QRO' → 'QRO'
function codigoCorto(clave: string): string {
  return clave.replace(/^MA\s+/, '').replace(/^CLIN\s+/, 'CLIN').trim();
}
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  MapPin, ClipboardList, DollarSign, FileText, Upload,
  Calendar, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Plus, X, Edit2, Save, Download, Eye, Loader2, Trash2
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

interface ReporteGeneral {
  id: string;
  fecha_reporte: string;
  archivo_nombre: string | null;
  onedrive_url: string | null;
  onedrive_path: string | null;
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
  factura_consecutivo: string | null;
  folio_factura: string | null;
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
  { key: 'comunicados',  label: 'Comunicados',  icon: FileText      },
  { key: 'planteles',    label: 'Planteles',    icon: MapPin        },
  { key: 'pagos',        label: 'Pagos',        icon: DollarSign    },
  { key: 'reportes',     label: 'Reportes',     icon: Upload        },
  { key: 'entregables',  label: 'Entregables',  icon: ClipboardList },
  { key: 'reporte',      label: 'Reporte',      icon: FileText      },
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
function TabReporteGeneral({ reportesGenerales, planteles, pagos, comunicados, entregables }: {
  reportesGenerales: ReporteGeneral[];
  planteles: Plantel[];
  pagos: Pago[];
  comunicados: Comunicado[];
  entregables: Entregable[];
}) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [deleteRG, setDeleteRG] = useState<ReporteGeneral | null>(null);

  const deleteRGMut = useMutation({
    mutationFn: async (r: ReporteGeneral) => {
      // Borrar de OneDrive (no bloqueante si falla)
      if (r.onedrive_path && r.archivo_nombre) {
        try { await spDelete(r.onedrive_path, r.archivo_nombre); } catch { /* continuar */ }
      }
      // Borrar de la DB
      const { error } = await supabase.from('levantamiento_reportes_generales').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_reportes_generales'] });
      toast.success('Reporte eliminado ✓');
      setDeleteRG(null);
    },
    onError: (e: any) => toast.error('Error al eliminar: ' + e.message),
  });

  const MESES_CONTRATO = [
    { etiqueta: 'ANTICIPO', total: 1034297.65 },
    { etiqueta: 'MES 1',    total: 603932.62  }, { etiqueta: 'MES 2',  total: 387111.22  },
    { etiqueta: 'MES 3',    total: 475920.82  }, { etiqueta: 'MES 4',  total: 430715.62  },
    { etiqueta: 'MES 5',    total: 321252.22  }, { etiqueta: 'MES 6',  total: 564817.42  },
    { etiqueta: 'MES 7',    total: 338342.50  }, { etiqueta: 'MES 8',  total: 508326.58  },
    { etiqueta: 'MES 9',    total: 534878.88  }, { etiqueta: 'MES 10', total: 444781.29  },
    { etiqueta: 'MES 11',   total: 340174.72  }, { etiqueta: 'MES 12', total: 565502.54  },
    { etiqueta: 'MES 13',   total: 892463.77  }, { etiqueta: 'MES 14', total: 570742.12  },
    { etiqueta: 'MES 15',   total: 824408.02  }, { etiqueta: 'MES 16', total: 614172.52  },
    { etiqueta: 'MES 17',   total: 723140.02  }, { etiqueta: 'MES 18', total: 167996.00  },
  ];

    const fmt = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const totalPagado = pagos.reduce((s, p) => s + (p.monto_pagado ?? 0), 0);
  const totalContrato = 10342976.48;

  const CHECKS = [
    { field: 'mecanica_suelos', label: 'Mecánica de Suelos' },
    { field: 'levant_arq', label: 'Levant. Arq.' },
    { field: 'levant_estructural', label: 'Levant. Estructural' },
    { field: 'levant_instalaciones', label: 'Levant. Instalaciones' },
    { field: 'levant_conjunto', label: 'Planta de Conjunto' },
  ];

  const generarReporte = async () => {
    setGenerating(true);
    try {
      let JsPDF = (window as any).jspdf?.jsPDF;
      if (!JsPDF) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = () => res(); s.onerror = () => rej();
          document.head.appendChild(s);
        });
        JsPDF = (window as any).jspdf?.jsPDF;
      }

      const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210; const ML = 14; const TW = 182;
      let y = 0;
      const fecha = hoyLocal();
      const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

      const drawHeader = (logoImg = '') => {
        doc.setFillColor(12, 59, 110); doc.rect(0, 0, W, 32, 'F');
        doc.setFillColor(232, 119, 34); doc.rect(0, 0, 5, 32, 'F');
        doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text('Reporte General — Levantamiento Nacional', ML, 13);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
        doc.text('Coordinación de Obras y Mantenimiento RCMA  ·  ' + fechaLabel, ML, 21);
        doc.setFontSize(7.5); doc.setTextColor(130, 160, 190);
        doc.text('Contrato 110-057-MANO_AMIGA', ML, 28);
        if (logoImg) doc.addImage(logoImg, 'PNG', W - 36, 4, 22, 22);
      };

      const drawFooter = () => {
        doc.setFillColor(12, 59, 110); doc.rect(0, 285, W, 12, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
        doc.text('Coordinación de Obras y Mantenimiento RCMA  —  Sistema RCMA', W / 2, 292, { align: 'center' });
      };

      const np = (need = 10) => {
        if (y + need > 272) { drawFooter(); doc.addPage(); drawHeader(logoData); y = 40; }
      };

      const seccion = (titulo: string) => {
        np(14);
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 59, 110);
        doc.text(titulo, ML, y); y += 3;
        doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.3); doc.line(ML, y, W - ML, y); y += 5;
      };

      // Logo
      let logoData = '';
      try {
        logoData = await new Promise<string>((res, rej) => {
          const img = new Image(); img.crossOrigin = 'anonymous';
          img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
          img.onerror = rej; img.src = '/logo.png';
        });
      } catch { /* sin logo */ }

      drawHeader(logoData);
      y = 40;

      // ── SECCIÓN 1: PLANTELES ───────────────────────────────────────────
      seccion('1. Planteles');
      const faseLabels: Record<string, string> = {
        COMUNICADO: 'Comunicado', FASE1: 'Fase 1 – Campo', FASE2: 'Fase 2 – Gabinete',
        FASE3: 'Fase 3 – Revisión', FASE4: 'Fase 4 – ECO', FASE5: 'Fase 5 – Cierre',
      };

      // Header tabla planteles
      np(10);
      doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 7, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Colegio', ML + 2, y + 1.5);
      doc.text('Territorio', ML + 80, y + 1.5);
      doc.text('Asignación', ML + 115, y + 1.5);
      doc.text('Fase', ML + 148, y + 1.5); y += 8;

      planteles.forEach((p, i) => {
        np(7);
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(ML, y - 3, TW, 7, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        doc.text((p.colegio_nombre || '').slice(0, 38), ML + 2, y + 1);
        doc.text((p.zona || '').slice(0, 18), ML + 80, y + 1);
        doc.text((p.asignacion || '').slice(0, 18), ML + 115, y + 1);
        doc.text(faseLabels[p.fase] || p.fase, ML + 148, y + 1); y += 7;
      });
      if (planteles.length === 0) { doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text('Sin planteles registrados', ML + 2, y); y += 7; }
      y += 6;

      // ── SECCIÓN 2: PAGOS ──────────────────────────────────────────────
      seccion('2. Flujograma de Pagos');
      np(10);
      doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 7, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Mes', ML + 2, y + 1.5);
      doc.text('Total Contrato', ML + 35, y + 1.5);
      doc.text('Fact. Cons.', ML + 80, y + 1.5);
      doc.text('Fecha Pago', ML + 108, y + 1.5);
      doc.text('Folio', ML + 138, y + 1.5);
      doc.text('Monto Real', ML + 158, y + 1.5); y += 8;

      MESES_CONTRATO.forEach((m, i) => {
        const pago = pagos.find(p => p.mes_etiqueta === m.etiqueta);
        np(7);
        if (pago) { doc.setFillColor(236, 253, 245); doc.rect(ML, y - 3, TW, 7, 'F'); }
        else if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(ML, y - 3, TW, 7, 'F'); }
        doc.setFont('helvetica', pago ? 'bold' : 'normal'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        doc.text(m.etiqueta, ML + 2, y + 1);
        doc.text(fmt(m.total), ML + 35, y + 1);
        doc.text(pago?.factura_consecutivo ?? '—', ML + 80, y + 1);
        doc.text(pago?.fecha_pago ? new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX') : '—', ML + 108, y + 1);
        doc.text(pago?.folio_factura ?? '—', ML + 138, y + 1);
        if (pago?.monto_pagado) { doc.setTextColor(22, 163, 74); doc.text(fmt(pago.monto_pagado), ML + 158, y + 1); doc.setTextColor(30, 30, 30); }
        else doc.text('—', ML + 158, y + 1);
        y += 7;
      });
      // Totales
      np(10);
      doc.setFillColor(220, 230, 245); doc.rect(ML, y - 3, TW, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(12, 59, 110);
      doc.text('TOTAL CONTRATO', ML + 2, y + 2);
      doc.text(fmt(totalContrato), ML + 35, y + 2);
      doc.text('TOTAL PAGADO', ML + 108, y + 2);
      doc.setTextColor(22, 163, 74); doc.text(fmt(totalPagado), ML + 158, y + 2); y += 12;

      // ── SECCIÓN 3: COMUNICADOS ────────────────────────────────────────
      seccion('3. Comunicados Enviados');
      np(10);
      doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 7, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Plantel', ML + 2, y + 1.5);
      doc.text('Director', ML + 80, y + 1.5);
      doc.text('F. Emisión', ML + 135, y + 1.5);
      doc.text('F. Visita', ML + 162, y + 1.5); y += 8;

      comunicados.forEach((c, i) => {
        const pl = planteles.find(p => p.id === c.plantel_id);
        np(7);
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(ML, y - 3, TW, 7, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        doc.text((pl?.colegio_nombre || '—').slice(0, 38), ML + 2, y + 1);
        doc.text((c.director_nombre || '—').slice(0, 28), ML + 80, y + 1);
        doc.text(c.fecha_emision ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX') : '—', ML + 135, y + 1);
        doc.text(c.fecha_visita ? new Date(c.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX') : '—', ML + 162, y + 1);
        y += 7;
      });
      if (comunicados.length === 0) { doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text('Sin comunicados registrados', ML + 2, y); y += 7; }
      y += 6;

      // ── SECCIÓN 4: ENTREGABLES ─────────────────────────────────────────
      seccion('4. Estatus de Entregables por Plantel');
      np(10);
      doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 7, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text('Plantel', ML + 2, y + 1.5);
      doc.text('Mec.', ML + 80, y + 1.5);
      doc.text('Arq.', ML + 97, y + 1.5);
      doc.text('Estr.', ML + 112, y + 1.5);
      doc.text('Inst.', ML + 128, y + 1.5);
      doc.text('Conj.', ML + 143, y + 1.5);
      doc.text('Acta', ML + 158, y + 1.5);
      doc.text('Fase', ML + 170, y + 1.5); y += 8;

      planteles.forEach((p, i) => {
        const ent = entregables.find(e => e.plantel_id === p.id);
        np(7);
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(ML, y - 3, TW, 7, 'F'); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(30, 30, 30);
        doc.text((p.colegio_nombre || '').slice(0, 36), ML + 2, y + 1);
        const ok = (field: string) => ent && (ent as any)[field] ? '✓' : '—';
        doc.setTextColor(ent?.mecanica_suelos ? 22 : 150, ent?.mecanica_suelos ? 163 : 150, ent?.mecanica_suelos ? 74 : 150);
        doc.text(ok('mecanica_suelos'), ML + 82, y + 1);
        doc.setTextColor(ent?.levant_arq ? 22 : 150, ent?.levant_arq ? 163 : 150, ent?.levant_arq ? 74 : 150);
        doc.text(ok('levant_arq'), ML + 99, y + 1);
        doc.setTextColor(ent?.levant_estructural ? 22 : 150, ent?.levant_estructural ? 163 : 150, ent?.levant_estructural ? 74 : 150);
        doc.text(ok('levant_estructural'), ML + 114, y + 1);
        doc.setTextColor(ent?.levant_instalaciones ? 22 : 150, ent?.levant_instalaciones ? 163 : 150, ent?.levant_instalaciones ? 74 : 150);
        doc.text(ok('levant_instalaciones'), ML + 130, y + 1);
        doc.setTextColor(ent?.levant_conjunto ? 22 : 150, ent?.levant_conjunto ? 163 : 150, ent?.levant_conjunto ? 74 : 150);
        doc.text(ok('levant_conjunto'), ML + 145, y + 1);
        doc.setTextColor(ent?.acta_firmada ? 22 : 150, ent?.acta_firmada ? 163 : 150, ent?.acta_firmada ? 74 : 150);
        doc.text(ent?.acta_firmada ? '✓' : '—', ML + 160, y + 1);
        doc.setTextColor(30, 30, 30);
        doc.text((faseLabels[p.fase] || p.fase).slice(0, 14), ML + 168, y + 1);
        y += 7;
      });
      if (planteles.length === 0) { doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text('Sin planteles registrados', ML + 2, y); y += 7; }

      drawFooter();

      // Subir a OneDrive
      const blob = doc.output('blob') as Blob;
      const fechaArchivo = hoyLocal();
      const anio = new Date(fechaArchivo + 'T12:00:00').getFullYear();
      const mes  = new Date(fechaArchivo + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
      const carpeta  = `Levantamiento Nacional/Reportes Generales/${anio}/${mes}`;
      const fileName = `Reporte_General_Levantamiento_${fechaArchivo}.pdf`;
      const fileObj  = new File([blob], fileName, { type: 'application/pdf' });
      const webUrl   = await spUpload(fileObj, carpeta, fileName);

      const { error } = await supabase.from('levantamiento_reportes_generales').insert({
        fecha_reporte: fechaArchivo, archivo_nombre: fileName,
        onedrive_url: webUrl || null, onedrive_path: carpeta,
      });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['lev_reportes_generales'] });
      toast.success('Reporte generado y guardado en OneDrive ✓');

    } catch (e: any) {
      toast.error('Error generando reporte: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const faseLabels: Record<string, string> = {
    COMUNICADO: 'Comunicado', FASE1: 'Fase 1 – Campo', FASE2: 'Fase 2 – Gabinete',
    FASE3: 'Fase 3 – Revisión', FASE4: 'Fase 4 – ECO', FASE5: 'Fase 5 – Cierre',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Genera un reporte PDF con el estado actual de planteles, pagos, comunicados y entregables.</p>
        <button onClick={generarReporte} disabled={generating} className={btnPrimary}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? 'Generando…' : 'Generar Reporte'}
        </button>
      </div>





      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Archivo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportesGenerales.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-slate-400">Sin reportes generados</td></tr>
            )}
            {reportesGenerales.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700 font-medium">
                  {r.fecha_reporte ? new Date(r.fecha_reporte + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{r.archivo_nombre}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.onedrive_url && (
                      <a href={r.onedrive_url} target="_blank" rel="noreferrer" className="text-[#0C3B6E] hover:underline flex items-center gap-1 text-xs">
                        <Eye className="w-3.5 h-3.5" />Ver PDF
                      </a>
                    )}
                    <button onClick={() => setDeleteRG(r)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleteRG && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900">¿Eliminar reporte?</h3>
            <p className="text-sm text-slate-600">Se eliminará <strong>{deleteRG.archivo_nombre}</strong>{deleteRG.onedrive_path ? ' y el archivo en OneDrive' : ''}.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteRG(null)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => deleteRGMut.mutate(deleteRG)} disabled={deleteRGMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                {deleteRGMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LevantamientoNacional() {
  const [tab, setTab] = useState('comunicados');
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

  const { data: reportesGenerales = [] } = useQuery<ReporteGeneral[]>({
    queryKey: ['lev_reportes_generales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('levantamiento_reportes_generales').select('*').order('fecha_reporte', { ascending: false });
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
      {tab === 'reporte'      && <TabReporteGeneral reportesGenerales={reportesGenerales} planteles={planteles} pagos={pagos} comunicados={comunicados} entregables={entregables} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PLANTELES
// ══════════════════════════════════════════════════════════════════════════════

// ─── Helpers OneDrive ─────────────────────────────────────────────────────────
async function spUpload(file: File, carpeta: string, fileName: string): Promise<string> {
  const { data: s } = await (await import('@/lib/supabaseClient')).supabase.auth.getSession();
  const token = s?.session?.access_token ?? '';
  const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // Obtener token Azure desde get-sharepoint-token
  const tokenRes = await fetch(`${SUPA_URL}/functions/v1/get-sharepoint-token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY },
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('No se pudo obtener token de Azure');

  const USER      = 'rreyes@manoamiga.edu.mx';
  const CHUNK     = 5 * 1024 * 1024;
  const path      = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const itemPath  = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;

  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileName } }),
    }
  );
  if (!sessionRes.ok) throw new Error(`Upload session error ${sessionRes.status}`);
  const { uploadUrl } = await sessionRes.json();

  let webUrl = '';
  let start  = 0;
  const total = file.size;
  while (start < total) {
    const end = Math.min(start + CHUNK, total);
    const buf = await file.slice(start, end).arrayBuffer();
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(buf.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: buf,
    });
    if (!res.ok && res.status !== 202) throw new Error(`Chunk error ${res.status}`);
    if (res.status === 200 || res.status === 201) {
      const item = await res.json();
      webUrl = item.webUrl ?? '';
    }
    start = end;
  }
  return webUrl;
}

async function spDelete(carpeta: string, fileName: string): Promise<void> {
  // Obtener token Azure directo desde get-sharepoint-token
  const { data: s } = await (await import('@/lib/supabaseClient')).supabase.auth.getSession();
  const supaToken = s?.session?.access_token ?? '';
  const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL as string;
  const ANON_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const tokenRes = await fetch(`${SUPA_URL}/functions/v1/get-sharepoint-token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supaToken}`, 'apikey': ANON_KEY },
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('No se pudo obtener token Azure');

  // Borrar directo en Microsoft Graph desde el navegador
  const USER     = 'rreyes@manoamiga.edu.mx';
  const path     = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}`,
    { method: 'DELETE', headers: { 'Authorization': `Bearer ${access_token}` } }
  );
  if (!res.ok && res.status !== 404) throw new Error(`Delete error ${res.status}`);
}

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
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ mes_etiqueta: '', fecha_pago: '', folio_factura: '', monto_pagado: '', observaciones: '' });
  const [fileFactura, setFileFactura] = useState<File | null>(null);
  const [fileRecibo, setFileRecibo]   = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [editPago, setEditPago]       = useState<Pago | null>(null);
  const [editFileFactura, setEditFileFactura] = useState<File | null>(null);
  const [editFileRecibo, setEditFileRecibo]   = useState<File | null>(null);
  const [editUploading, setEditUploading]     = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Tabla precargada del contrato — datos fijos del Word
  const MESES_CONTRATO = [
    { etiqueta: 'ANTICIPO', mes: 0,  subtotal: 891635.90,  iva: 142661.74,  total: 1034297.65},
    { etiqueta: 'MES 1',    mes: 1,  subtotal: 520631.57,  iva: 83301.05,   total: 603932.62},
    { etiqueta: 'MES 2',    mes: 2,  subtotal: 333716.57,  iva: 53394.65,   total: 387111.22},
    { etiqueta: 'MES 3',    mes: 3,  subtotal: 410276.57,  iva: 65644.25,   total: 475920.82},
    { etiqueta: 'MES 4',    mes: 4,  subtotal: 371306.57,  iva: 59409.05,   total: 430715.62},
    { etiqueta: 'MES 5',    mes: 5,  subtotal: 276941.57,  iva: 44310.65,   total: 321252.22},
    { etiqueta: 'MES 6',    mes: 6,  subtotal: 486911.57,  iva: 77905.85,   total: 564817.42},
    { etiqueta: 'MES 7',    mes: 7,  subtotal: 291674.57,  iva: 46667.93,   total: 338342.50},
    { etiqueta: 'MES 8',    mes: 8,  subtotal: 438212.57,  iva: 70114.01,   total: 508326.58},
    { etiqueta: 'MES 9',    mes: 9,  subtotal: 461102.48,  iva: 73776.40,   total: 534878.88},
    { etiqueta: 'MES 10',   mes: 10, subtotal: 383432.15,  iva: 61349.14,   total: 444781.29},
    { etiqueta: 'MES 11',   mes: 11, subtotal: 293254.07,  iva: 46920.65,   total: 340174.72},
    { etiqueta: 'MES 12',   mes: 12, subtotal: 487502.19,  iva: 78000.35,   total: 565502.54},
    { etiqueta: 'MES 13',   mes: 13, subtotal: 769365.32,  iva: 123098.45,  total: 892463.77},
    { etiqueta: 'MES 14',   mes: 14, subtotal: 492019.07,  iva: 78723.05,   total: 570742.12},
    { etiqueta: 'MES 15',   mes: 15, subtotal: 710696.57,  iva: 113711.45,  total: 824408.02},
    { etiqueta: 'MES 16',   mes: 16, subtotal: 529459.07,  iva: 84713.45,   total: 614172.52},
    { etiqueta: 'MES 17',   mes: 17, subtotal: 623396.57,  iva: 99743.45,   total: 723140.02},
    { etiqueta: 'MES 18',   mes: 18, subtotal: 144824.14,  iva: 23171.86,   total: 167996.00},
  ];

  const TOTAL_CONTRATO = 10342976.48;

  // Obtener pago registrado por mes_etiqueta
  const getPago = (etiqueta: string) => pagos.find(p => p.mes_etiqueta === etiqueta);

  // Meses que ya tienen pago registrado (para excluirlos del modal)
  const mesesPagados = new Set(pagos.map(p => p.mes_etiqueta));
  const mesesDisponibles = MESES_CONTRATO.filter(m => !mesesPagados.has(m.etiqueta));

  // KPIs reales
  const totalPagado   = pagos.reduce((s, p) => s + (p.monto_pagado ?? 0), 0);
  const totalPendiente = TOTAL_CONTRATO - totalPagado;

  const addMut = useMutation({
    mutationFn: async () => {
      if (!form.mes_etiqueta) throw new Error('Selecciona el mes');
      setUploading(true);
      try {
        const mesData  = MESES_CONTRATO.find(m => m.etiqueta === form.mes_etiqueta);
        const carpeta  = `Levantamiento Nacional/Pagos/${form.mes_etiqueta.replace(' ', '_')}`;
        let facturaUrl: string | null = null;
        let reciboUrl:  string | null = null;

        if (fileFactura) {
          const fn = `Factura_${form.mes_etiqueta.replace(' ', '_')}_${hoyLocal()}.${fileFactura.name.split('.').pop()}`;
          facturaUrl = await spUpload(fileFactura, carpeta, fn);
        }
        if (fileRecibo) {
          const fn = `Recibo_${form.mes_etiqueta.replace(' ', '_')}_${hoyLocal()}.${fileRecibo.name.split('.').pop()}`;
          reciboUrl = await spUpload(fileRecibo, carpeta, fn);
        }

        const { error } = await supabase.from('levantamiento_pagos').insert({
          mes_numero:          mesData?.mes ?? 0,
          mes_etiqueta:        form.mes_etiqueta,
          concepto:            form.mes_etiqueta,
          monto_programado:    mesData?.total ?? 0,
          monto_pagado:        parseFloat(form.monto_pagado) || null,
          fecha_pago:          form.fecha_pago || null,
          pagado:              true,
          factura_consecutivo: String(pagos.length + 1),
          folio_factura:       form.folio_factura || null,
          notas:               [form.observaciones, facturaUrl ? `factura_url:${facturaUrl}` : '', reciboUrl ? `recibo_url:${reciboUrl}` : ''].filter(Boolean).join('||') || null,
          plantel_id:          null,
        });
        if (error) throw error;
      } finally { setUploading(false); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_pagos'] });
      toast.success('Pago registrado ✓');
      setShowAdd(false);
      setForm({ mes_etiqueta: '', fecha_pago: '', folio_factura: '', monto_pagado: '', observaciones: '' });
      setFileFactura(null); setFileRecibo(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editPago) return;
      setEditUploading(true);
      try {
        const carpeta = `Levantamiento Nacional/Pagos/${editPago.mes_etiqueta.replace(' ', '_')}`;
        const notas   = editPago.notas ?? '';
        let facturaUrl = notas.match(/factura_url:([^|]+)/)?.[1] ?? null;
        let reciboUrl  = notas.match(/recibo_url:([^|]+)/)?.[1] ?? null;
        const obs      = notas.replace(/\|\|?factura_url:[^|]*/g, '').replace(/\|\|?recibo_url:[^|]*/g, '').trim();

        if (editFileFactura) {
          const fn = `Factura_${editPago.mes_etiqueta.replace(' ', '_')}_${hoyLocal()}.${editFileFactura.name.split('.').pop()}`;
          facturaUrl = await spUpload(editFileFactura, carpeta, fn);
        }
        if (editFileRecibo) {
          const fn = `Recibo_${editPago.mes_etiqueta.replace(' ', '_')}_${hoyLocal()}.${editFileRecibo.name.split('.').pop()}`;
          reciboUrl = await spUpload(editFileRecibo, carpeta, fn);
        }

        const nuevasNotas = [obs, facturaUrl ? `factura_url:${facturaUrl}` : '', reciboUrl ? `recibo_url:${reciboUrl}` : ''].filter(Boolean).join('||') || null;
        const { error } = await supabase.from('levantamiento_pagos').update({ notas: nuevasNotas }).eq('id', editPago.id);
        if (error) throw error;
      } finally { setEditUploading(false); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_pagos'] });
      toast.success('Pago actualizado ✓');
      setEditPago(null); setEditFileFactura(null); setEditFileRecibo(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const fmt = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Contrato Total</p>
          <p className="text-xl font-black text-slate-700 mt-1">{fmt(TOTAL_CONTRATO)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-xs text-emerald-600 uppercase tracking-wide">Total Pagado</p>
          <p className="text-xl font-black text-emerald-700 mt-1">{fmt(totalPagado)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-xs text-amber-600 uppercase tracking-wide">Total Pendiente</p>
          <p className="text-xl font-black text-amber-700 mt-1">{fmt(totalPendiente)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)} disabled={mesesDisponibles.length === 0} className={btnPrimary}>
          <Plus className="w-4 h-4" />Registrar Pago
        </button>
      </div>

      {/* Modal registrar pago */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Registrar Pago</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Mes</label>
                <select className={inputCls} value={form.mes_etiqueta} onChange={e => set('mes_etiqueta', e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {mesesDisponibles.map(m => (
                    <option key={m.etiqueta} value={m.etiqueta}>
                      {m.etiqueta} — {fmt(m.total)}
                    </option>
                  ))}
                </select>
              </div>
              {form.mes_etiqueta && (() => {
                const m = MESES_CONTRATO.find(x => x.etiqueta === form.mes_etiqueta);
                return m ? (
                  <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 grid grid-cols-3 gap-2">
                    <div><p className="text-slate-400">Subtotal</p><p className="font-bold">{fmt(m.subtotal)}</p></div>
                    <div><p className="text-slate-400">IVA</p><p className="font-bold">{fmt(m.iva)}</p></div>
                    <div><p className="text-slate-400">Total</p><p className="font-bold text-[#0C3B6E]">{fmt(m.total)}</p></div>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Folio Factura</label>
                <input className={inputCls} value={form.folio_factura} onChange={e => set('folio_factura', e.target.value)} placeholder="Ej: A-001" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Fecha de Pago</label>
                <input type="date" className={inputCls} value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Monto Real $</label>
                <input type="number" className={inputCls} value={form.monto_pagado} onChange={e => set('monto_pagado', e.target.value)} placeholder="Monto efectivamente pagado" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Observaciones</label>
                <textarea className={inputCls} rows={2} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Factura (cualquier formato) — opcional</label>
                <input type="file" className={inputCls} onChange={e => setFileFactura(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Recibo de Pago (cualquier formato) — opcional</label>
                <input type="file" className={inputCls} onChange={e => setFileRecibo(e.target.files?.[0] ?? null)} />
              </div>
              {(fileFactura || fileRecibo) && (
                <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                  📁 Se guardarán en: <strong>Levantamiento Nacional / Pagos / {form.mes_etiqueta || '—'}</strong>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => addMut.mutate()} disabled={addMut.isPending || uploading || !form.mes_etiqueta} className={btnPrimary}>
                {(addMut.isPending || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {uploading ? 'Subiendo…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pago — agregar/reemplazar factura y recibo */}
      {editPago && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Agregar Archivos — {editPago.mes_etiqueta}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Puedes agregar o reemplazar la factura y el recibo en cualquier momento</p>
              </div>
              <button onClick={() => setEditPago(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  {editPago.notas?.includes('factura_url:') ? 'Reemplazar Factura' : 'Subir Factura'} (cualquier formato)
                </label>
                {editPago.notas?.includes('factura_url:') && (
                  <a href={editPago.notas.match(/factura_url:([^|]+)/)?.[1] ?? '#'} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-[#0C3B6E] hover:underline mb-1">
                    <Eye className="w-3 h-3" />Ver factura actual
                  </a>
                )}
                <input type="file" className={inputCls} onChange={e => setEditFileFactura(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  {editPago.notas?.includes('recibo_url:') ? 'Reemplazar Recibo de Pago' : 'Subir Recibo de Pago'} (cualquier formato)
                </label>
                {editPago.notas?.includes('recibo_url:') && (
                  <a href={editPago.notas.match(/recibo_url:([^|]+)/)?.[1] ?? '#'} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-[#0C3B6E] hover:underline mb-1">
                    <Eye className="w-3 h-3" />Ver recibo actual
                  </a>
                )}
                <input type="file" className={inputCls} onChange={e => setEditFileRecibo(e.target.files?.[0] ?? null)} />
              </div>
              {(editFileFactura || editFileRecibo) && (
                <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                  📁 Se guardarán en: <strong>Levantamiento Nacional / Pagos / {editPago.mes_etiqueta}</strong>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setEditPago(null)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => editMut.mutate()} disabled={editMut.isPending || editUploading || (!editFileFactura && !editFileRecibo)}
                className={btnPrimary}>
                {(editMut.isPending || editUploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editUploading ? 'Subiendo…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla principal */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0C3B6E] text-white text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-3">Meses</th>
              <th className="text-right px-3 py-3">Subtotal</th>
              <th className="text-right px-3 py-3">IVA</th>
              <th className="text-right px-3 py-3">Total</th>
              <th className="text-left px-3 py-3">Fecha de Pago</th>
              <th className="text-left px-3 py-3">Folio</th>
              <th className="text-right px-3 py-3">Monto Real</th>
              <th className="text-center px-3 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MESES_CONTRATO.map(m => {
              const pago = getPago(m.etiqueta);
              const isPagado = !!pago;
              const factCons = pago?.factura_consecutivo ?? '—';
              const folio    = pago?.folio_factura ?? '—';

              return (
                <tr key={m.etiqueta} className={isPagado ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-3 font-bold text-slate-800">{m.etiqueta}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{fmt(m.subtotal)}</td>
                  <td className="px-3 py-3 text-right text-slate-500">{fmt(m.iva)}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-700">{fmt(m.total)}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {pago?.fecha_pago ? new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-500 text-xs">{isPagado ? folio : '—'}</td>
                  <td className="px-3 py-3 text-right font-medium">
                    {isPagado && pago.monto_pagado != null
                      ? <span className="text-emerald-700">{fmt(pago.monto_pagado)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isPagado
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-200 text-emerald-800">✓ Pagado</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pendiente</span>}
                      {isPagado && (
                        <button onClick={() => { setEditPago(pago!); setEditFileFactura(null); setEditFileRecibo(null); }}
                          className="text-slate-400 hover:text-[#0C3B6E] transition-colors" title="Agregar/editar archivos">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isPagado && pago?.notas?.includes('factura_url:') && (
                        <a href={pago.notas.match(/factura_url:([^|]+)/)?.[1]} target="_blank" rel="noreferrer"
                          className="text-slate-400 hover:text-[#0C3B6E]" title="Ver Factura">
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Fila de totales */}
            <tr className="bg-slate-100 font-bold">
              <td className="px-3 py-3 text-slate-700">TOTALES</td>
              <td className="px-3 py-3 text-right text-slate-700">{fmt(8916359.04)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{fmt(1426617.45)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{fmt(10342976.48)}</td>
              <td colSpan={3} />
              <td className="px-3 py-3 text-right text-emerald-700">{fmt(totalPagado)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


async function buildPDFBlob(plantel: Plantel, c: { fecha_emision: string; fecha_visita: string | null; director_nombre: string | null }): Promise<Blob> {
  const datos      = DATOS_COLEGIO[codigoCorto(plantel.colegio_clave)];
  const dirNombre  = c.director_nombre ?? datos?.director ?? '';
  const fechaEmision = c.fecha_emision
    ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const fechaVisita = c.fecha_visita
    ? new Date(c.fecha_visita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
    : '(por confirmar)';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W  = 210; const ML = 20; const TW = W - ML - 20;
  let y = 0;

  const drawHeader = (logoImg = '') => {
    doc.setFillColor(12, 59, 110); doc.rect(0, 0, W, 34, 'F');
    doc.setFillColor(232, 119, 34); doc.rect(0, 0, 5, 34, 'F');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Comunicado Institucional', ML, 13);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
    doc.text('Coordinación de Obras y Mantenimiento RCMA  ·  ' + fechaEmision, ML, 21);
    doc.setFontSize(8); doc.setTextColor(130, 160, 190);
    doc.text('Documento interno — Mano Amiga', ML, 28);
    if (logoImg) doc.addImage(logoImg, 'PNG', W - 37, 4, 22, 22);
  };

  const drawFooter = () => {
    doc.setFillColor(12, 59, 110); doc.rect(0, 285, W, 12, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 220);
    doc.text('Coordinación de Obras y Mantenimiento RCMA  —  Sistema RCMA', W / 2, 292, { align: 'center' });
  };

  const np = (need = 10) => {
    if (y + need > 272) { drawFooter(); doc.addPage(); drawHeaderWithLogo(); y = 42; }
  };

  let logoImg = '';
  try {
    logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
  } catch { /* sin logo */ }

  const drawHeaderWithLogo = () => drawHeader(logoImg);
  drawHeaderWithLogo();
  y = 44;

  const setBody = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30); };
  const setBold = () => { doc.setFont('helvetica', 'bold'); };

  const secTitle = (txt: string) => {
    np(12); setBold(); doc.setFontSize(10); doc.setTextColor(12, 59, 110);
    doc.text(txt, ML, y); y += 3.5;
    doc.setDrawColor(200, 210, 220); doc.setLineWidth(0.3); doc.line(ML, y, W - ML, y); y += 5;
  };

  const para = (txt: string, gap = 6) => {
    setBody();
    const lines = doc.splitTextToSize(txt, TW);
    np(lines.length * 5.5 + gap);
    doc.text(lines, ML, y); y += lines.length * 5.5 + gap;
  };

  setBold(); doc.setFontSize(10); doc.setTextColor(12, 59, 110);
  doc.text('Asunto: Inicio de Proyectos de Levantamientos y Estudios.', ML, y); y += 9;

  setBody();
  doc.text('Estimado/a ', ML, y);
  setBold(); doc.text(dirNombre + '.', ML + doc.getTextWidth('Estimado/a '), y);
  y += 9;

  para('Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de levantamientos y estudios técnicos en las instalaciones de:');
  setBold(); doc.setFontSize(10);
  doc.text(plantel.colegio_nombre + '.', ML, y); y += 5.5 + 5; setBody();

  para('Este proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.', 10);

  secTitle('Detalles de la Visita');
  const ROW = 9; const C1 = 68;
  np(ROW * 2);
  doc.setFillColor(241, 245, 249); doc.rect(ML, y - 3, TW, ROW, 'F');
  doc.setDrawColor(220, 225, 230); doc.setLineWidth(0.2); doc.rect(ML, y - 3, TW, ROW, 'D');
  setBold(); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  doc.text('Proveedor a Cargo', ML + 3, y + 3); setBody(); doc.setFontSize(9);
  doc.text('Navarro y Cal y Mayor Asociados S.A de C.V.', ML + C1, y + 3); y += ROW + 1;
  doc.setFillColor(255, 255, 255); doc.rect(ML, y - 3, TW, ROW, 'F'); doc.rect(ML, y - 3, TW, ROW, 'D');
  setBold(); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  doc.text('Fecha de Ingreso', ML + 3, y + 3); setBody(); doc.setFontSize(9);
  doc.text(fechaVisita, ML + C1, y + 3); y += ROW + 8;

  secTitle('Alcance de los Trabajos a Realizar');
  para('Los trabajos técnicos que se llevarán a cabo incluyen:', 5);
  ['Estudio de Mecánica de Suelos.', 'Levantamientos Arquitectónicos.', 'Levantamientos Estructurales.', 'Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).', 'Levantamiento de Planta de Conjunto.'].forEach(item => {
    const ls = doc.splitTextToSize(item, TW - 8);
    np(ls.length * 5.5 + 2); setBody();
    doc.setFillColor(12, 59, 110); doc.circle(ML + 3, y - 1, 0.9, 'F');
    doc.text(ls, ML + 8, y); y += ls.length * 5.5 + 2;
  });
  y += 5;

  secTitle('Contacto del Proveedor');
  para('El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:');

  const tc1 = 36; const tc2 = 42; const tc3 = 56; const tc4 = TW - tc1 - tc2 - tc3;
  np(20);
  doc.setFillColor(12, 59, 110); doc.rect(ML, y - 3, TW, 8, 'F');
  setBold(); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text('Rol', ML + 2, y + 2); doc.text('Nombre', ML + tc1 + 2, y + 2);
  doc.text('Correo', ML + tc1 + tc2 + 2, y + 2); doc.text('Teléfono', ML + tc1 + tc2 + tc3 + 2, y + 2); y += 9;
  doc.setFillColor(241, 245, 249); doc.rect(ML, y - 3, TW, 8, 'F');
  doc.setDrawColor(220, 225, 230); doc.rect(ML, y - 3, TW, 8, 'D');
  setBody(); doc.setFontSize(8);
  doc.text('Líder de Proyecto', ML + 2, y + 2); doc.text('Arq. Fátima Vázquez', ML + tc1 + 2, y + 2);
  doc.text('fvazquez@navarrocym.com.mx', ML + tc1 + tc2 + 2, y + 2); doc.text('(55) 5182 1276', ML + tc1 + tc2 + tc3 + 2, y + 2); y += 11;

  doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  para('Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores, minimizando cualquier posible afectación a las actividades cotidianas del colegio/clínica.');
  para('Quedamos a su disposición para cualquier duda o aclaración.', 12);

  np(24); setBody();
  doc.text('Atentamente,', ML, y); y += 16;
  setBold(); doc.setFontSize(10); doc.setTextColor(12, 59, 110);
  doc.text('Ing. Ricardo Joanathan Reyes Medina', ML, y); y += 5.5;
  setBody(); doc.setFontSize(9);
  doc.text('Coordinador de Obras y Mantenimiento RCMA', ML, y);

  drawFooter();
  return doc.output('blob') as Blob;
}

function TabComunicados({ comunicados, planteles, directorio, qc }: {
  comunicados: Comunicado[]; planteles: Plantel[]; directorio: DirectorioItem[]; qc: any;
}) {
  const [showForm, setShowForm]     = useState(false);
  const [previewCom, setPreviewCom] = useState<Comunicado | null>(null);
  const [deleteCom, setDeleteCom]   = useState<Comunicado | null>(null);
  const [saving, setSaving]         = useState(false);
  const [territorio, setTerritorio] = useState('');
  const [colegio, setColegio]       = useState('');
  const [form, setForm] = useState({ fecha_emision: hoyLocal(), fecha_visita: '', notas: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const colegioInfo = COLEGIOS.find(c => c.colegio === colegio);
  const datosCom    = colegio ? DATOS_COLEGIO[codigoCorto(colegio)] : undefined;

  const resetForm = () => {
    setTerritorio(''); setColegio('');
    setForm({ fecha_emision: hoyLocal(), fecha_visita: '', notas: '' });
    setShowForm(false);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!colegio) throw new Error('Selecciona un colegio');
      setSaving(true);
      try {
        const dirNombre = datosCom?.director ?? null;

        // Buscar si el plantel ya existe
        let plantelId = planteles.find(p => p.colegio_clave === colegio)?.id ?? null;

        // Si no existe, crearlo automáticamente con Fase = COMUNICADO
        if (!plantelId) {
          const info = COLEGIOS.find(c => c.colegio === colegio);
          const { data: nuevo, error: errP } = await supabase.from('levantamiento_planteles').insert({
            colegio_clave:  colegio,
            colegio_nombre: datosCom?.nombre ?? colegio,
            zona:           info?.territorio ?? territorio,
            eco_nombre:     info?.eco ?? null,
            asignacion:     'PROVEEDOR',
            fase:           'COMUNICADO',
            updated_at:     new Date().toISOString(),
          }).select().single();
          if (errP) throw errP;
          plantelId = nuevo.id;
          qc.invalidateQueries({ queryKey: ['lev_planteles'] });
        }

        // Generar PDF y subir a OneDrive
        const blob     = await buildPDFBlob({ colegio_clave: colegio, colegio_nombre: datosCom?.nombre ?? colegio } as Plantel,
          { fecha_emision: form.fecha_emision, fecha_visita: form.fecha_visita || null, director_nombre: dirNombre });
        const fecha    = new Date(form.fecha_emision + 'T12:00:00');
        const anio     = fecha.getFullYear();
        const mes      = fecha.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        const carpeta  = `Levantamiento Nacional/Comunicados/${anio}/${mes}`;
        const fileName = `Comunicado_${colegio}_${form.fecha_emision}.pdf`;
        const fileObj  = new File([blob], fileName, { type: 'application/pdf' });
        const webUrl   = await spUpload(fileObj, carpeta, fileName);

        const { error } = await supabase.from('levantamiento_comunicados').insert({
          plantel_id:      plantelId,
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
      } finally { setSaving(false); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lev_comunicados'] });
      toast.success('Comunicado guardado y subido a OneDrive ✓');
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (c: Comunicado) => {
      if (c.onedrive_path && c.archivo_nombre) await spDelete(c.onedrive_path, c.archivo_nombre);
      const { error } = await supabase.from('levantamiento_comunicados').delete().eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lev_comunicados'] }); toast.success('Comunicado eliminado'); setDeleteCom(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const buildPreviewHTML = (plantel: Plantel, c: { fecha_emision: string; fecha_visita: string | null; director_nombre: string | null }) => {
    const datos     = DATOS_COLEGIO[codigoCorto(plantel.colegio_clave)];
    const dirNombre = c.director_nombre ?? datos?.director ?? '';
    const fechaEmision = c.fecha_emision ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const fechaVisita  = c.fecha_visita  ? new Date(c.fecha_visita  + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '(por confirmar)';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}html,body{width:100%;background:#e8e8e8;}
      body{font-family:Arial,sans-serif;font-size:12.5px;color:#222;line-height:1.55;}
      .wrap{width:680px;margin:0 auto;background:#fff;}
      .hdr{background:#0C3B6E;border-left:6px solid #E87722;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;}
      .hdr h1{color:#fff;font-size:15px;margin:0;} .hdr p{color:#b0c4de;font-size:10px;margin:3px 0 0;}
      .hdr img{height:42px;width:auto;}
      .body{padding:24px 28px 28px;}
      .asunto{font-weight:bold;color:#0C3B6E;margin-bottom:12px;}
      p{margin:0 0 10px;word-break:break-word;}
      .stitle{font-weight:bold;color:#0C3B6E;margin:16px 0 3px;}
      .hr{border:none;border-top:1px solid #dde3ea;margin:0 0 10px;}
      table.info{width:100%;border-collapse:collapse;margin:8px 0;}
      table.info th{background:#f1f5f9;width:38%;padding:6px 9px;font-size:12px;border-bottom:1px solid #dde3ea;text-align:left;}
      table.info td{padding:6px 9px;font-size:12px;border-bottom:1px solid #dde3ea;word-break:break-word;}
      table.contact{width:100%;border-collapse:collapse;margin:8px 0;table-layout:fixed;}
      table.contact th{background:#0C3B6E;color:#fff;padding:6px 8px;font-size:11px;text-align:left;}
      table.contact td{padding:6px 8px;font-size:11px;border-bottom:1px solid #dde3ea;word-break:break-word;}
      table.contact th:nth-child(1),table.contact td:nth-child(1){width:20%;}
      table.contact th:nth-child(2),table.contact td:nth-child(2){width:24%;}
      table.contact th:nth-child(3),table.contact td:nth-child(3){width:35%;}
      table.contact th:nth-child(4),table.contact td:nth-child(4){width:21%;}
      ul{margin:6px 0 10px 20px;} li{margin-bottom:3px;}
      .firma{margin-top:24px;padding-top:12px;border-top:1px solid #dde3ea;}
      .footer{background:#0C3B6E;color:#b0c4de;text-align:center;font-size:10px;padding:7px;}
      @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}body{background:#fff;}.wrap{width:100%;box-shadow:none;margin:0;}}
    </style></head><body>
    <div class="wrap">
      <div class="hdr">
        <div><h1>Comunicado Institucional</h1><p>Coordinación de Obras y Mantenimiento RCMA &nbsp;·&nbsp; ${fechaEmision}</p></div>
        <img src="/logo.png" alt="" onerror="this.style.display='none'">
      </div>
      <div class="body">
        <div class="asunto">Asunto: Inicio de Proyectos de Levantamientos y Estudios.</div>
        <p>Estimado/a <strong>${dirNombre}</strong>.</p>
        <p>Por medio del presente, el Departamento de Coordinación de Obras y Mantenimiento RCMA tiene el placer de informarle sobre el inicio de un importante proyecto de <strong>levantamientos y estudios técnicos</strong> en las instalaciones de <strong>${plantel.colegio_nombre}</strong>.</p>
        <p>Este proyecto es fundamental para el desarrollo de futuras iniciativas de mejora y mantenimiento de nuestra infraestructura a nivel institucional.</p>
        <div class="stitle">Detalles de la Visita</div><div class="hr"></div>
        <table class="info"><tr><th>Proveedor a Cargo</th><td>Navarro y Cal y Mayor Asociados S.A de C.V.</td></tr><tr><th>Fecha de Ingreso</th><td>${fechaVisita}</td></tr></table>
        <div class="stitle">Alcance de los Trabajos a Realizar</div><div class="hr"></div>
        <p>Los trabajos técnicos que se llevarán a cabo incluyen:</p>
        <ul><li>Estudio de Mecánica de Suelos.</li><li>Levantamientos Arquitectónicos.</li><li>Levantamientos Estructurales.</li><li>Levantamientos de Instalaciones (Eléctricas, Hidráulicas, Sanitarias, etc.).</li><li>Levantamiento de Planta de Conjunto.</li></ul>
        <div class="stitle">Contacto del Proveedor</div><div class="hr"></div>
        <p>El equipo de Navarro y Cal y Mayor Asociados S.A de C.V estará coordinado por la siguiente persona, quien será el contacto directo para cualquier asunto operativo o logístico relacionado con su visita:</p>
        <table class="contact"><tr><th>Rol</th><th>Nombre</th><th>Correo</th><th>Teléfono</th></tr><tr><td>Líder de Proyecto</td><td>Arq. Fátima Vázquez</td><td>fvazquez@navarrocym.com.mx</td><td>(55) 5182 1276</td></tr></table>
        <p>Agradecemos de antemano todas las facilidades y el apoyo que se brinden al equipo de trabajo para asegurar el desarrollo eficiente de estas labores, minimizando cualquier posible afectación a las actividades cotidianas del colegio/clínica.</p>
        <p>Quedamos a su disposición para cualquier duda o aclaración.</p>
        <div class="firma"><p>Atentamente,</p><br><br><strong>Ing. Ricardo Joanathan Reyes Medina</strong><p style="font-size:11.5px;color:#555;margin-top:3px;">Coordinador de Obras y Mantenimiento RCMA</p></div>
      </div>
      <div class="footer">Coordinación de Obras y Mantenimiento RCMA — Sistema RCMA</div>
    </div></body></html>`;
  };

  const handlePreview = (c: Comunicado) => {
    const plantel = planteles.find(p => p.id === c.plantel_id);
    if (!plantel) { toast.error('Plantel no encontrado'); return; }
    setPreviewCom(c);
  };

  const handlePrint = (c: Comunicado) => {
    const plantel = planteles.find(p => p.id === c.plantel_id);
    if (!plantel) return;
    const html = buildPreviewHTML(plantel, c);
    const win = window.open('', '_blank');
    if (!win) { toast.error('Permite ventanas emergentes'); return; }
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 800);
  };

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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Nuevo Comunicado</h3>
              <button onClick={resetForm}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <ColegioSelector
                territorio={territorio} colegio={colegio}
                onTerritorioChange={v => { setTerritorio(v); setColegio(''); }}
                onColegioChange={v => setColegio(v)}
                required
              />
              {datosCom && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                  <strong>Director:</strong> {datosCom.director || '—'}<br />
                  <strong>Administrador:</strong> {datosCom.admin || '—'}
                </div>
              )}
              {colegio && !datosCom && (
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">No se encontraron datos para este colegio.</div>
              )}
              {colegio && !planteles.find(p => p.colegio_clave === colegio) && (
                <div className="bg-emerald-50 rounded-lg p-3 text-xs text-emerald-700">
                  ✓ Este colegio se agregará automáticamente a Planteles con Fase: Comunicado
                </div>
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
              <button onClick={resetForm} className={btnSecondary}>Cancelar</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || saving || !colegio} className={btnPrimary}>
                {(saveMut.isPending || saving) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista Previa */}
      {previewCom && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Vista Previa — Comunicado</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePrint(previewCom)} className={btnPrimary}><Download className="w-4 h-4" />Imprimir / PDF</button>
                <button onClick={() => setPreviewCom(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <iframe srcDoc={previewHTML} className="w-full h-full min-h-[600px] border-0" title="Vista previa comunicado" />
            </div>
          </div>
        </div>
      )}

      {/* Confirmar Eliminar */}
      {deleteCom && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900">¿Eliminar comunicado?</h3>
            <p className="text-sm text-slate-600">
              Se eliminará el comunicado de <strong>{planteles.find(p => p.id === deleteCom.plantel_id)?.colegio_nombre}</strong>
              {deleteCom.onedrive_path ? ' y del OneDrive' : ''}.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteCom(null)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => deleteMut.mutate(deleteCom)} disabled={deleteMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Eliminar
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
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.fecha_emision ? new Date(c.fecha_emision + 'T12:00:00').toLocaleDateString('es-MX') : '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.fecha_visita  ? new Date(c.fecha_visita  + 'T12:00:00').toLocaleDateString('es-MX') : '—'}</td>
                  <td className="px-4 py-3">
                    {c.onedrive_url
                      ? <a href={c.onedrive_url} target="_blank" rel="noreferrer" className="text-xs text-[#0C3B6E] hover:underline flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Ver en Drive</a>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handlePreview(c)} className="text-slate-400 hover:text-[#0C3B6E]" title="Vista previa"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => handlePrint(c)} className="text-slate-400 hover:text-[#0C3B6E]" title="Imprimir"><Download className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteCom(c)} className="text-slate-400 hover:text-red-500" title="Eliminar"><X className="w-4 h-4" /></button>
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

function TabReportes({ reportes, planteles, qc }: { reportes: Reporte[]; planteles: Plantel[]; qc: any }) {
  const hoy = hoyLocal();
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Reporte | null>(null);
  const [form, setForm]           = useState({ plantel_id: '', plantel_id_2: '', fecha_reporte: hoy, notas: '' });
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteReporte, setDeleteReporte] = useState<Reporte | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const carpetaDesde = (fecha: string) =>
    fecha
      ? `Levantamiento Nacional/Reportes Diarios/${new Date(fecha + 'T12:00:00').getFullYear()}/${new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long' }).toUpperCase()}`
      : 'Levantamiento Nacional/Reportes Diarios';

  const deleteMut = useMutation({
    mutationFn: async (r: Reporte) => {
      if (r.onedrive_path && r.archivo_nombre) await spDelete(r.onedrive_path, r.archivo_nombre);
      const { error } = await supabase.from('levantamiento_reportes').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lev_reportes'] }); toast.success('Reporte eliminado'); setDeleteReporte(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => {
    setEditItem(null); setFile(null);
    setForm({ plantel_id: '', plantel_id_2: '', fecha_reporte: hoy, notas: '' });
    setShowForm(true);
  };

  const openEdit = (r: Reporte) => {
    setEditItem(r); setFile(null);
    setForm({ plantel_id: r.plantel_id ?? '', plantel_id_2: r.plantel_id ?? '', fecha_reporte: r.fecha_reporte, notas: r.notas ?? '' });
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
            plantel_id_2:   form.plantel_id || null,
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
            plantel_id_2:   form.plantel_id || null,
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
                  <select className={inputCls} value={form.plantel_id} onChange={e => set('plantel_id_2', e.target.value)}>
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

      {deleteReporte && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900">¿Eliminar reporte?</h3>
            <p className="text-sm text-slate-600">Se eliminará <strong>{deleteReporte.archivo_nombre}</strong>{deleteReporte.onedrive_path ? ' y el archivo en OneDrive' : ''}.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteReporte(null)} className={btnSecondary}>Cancelar</button>
              <button onClick={() => deleteMut.mutate(deleteReporte)} disabled={deleteMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Eliminar
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
                    {(() => { const p2 = planteles.find(p => p.id === r.plantel_id); return p2 ? <div className="text-slate-400">{p2.colegio_nombre}</div> : null; })()}
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
                      <button onClick={() => setDeleteReporte(r)} className="text-slate-400 hover:text-red-500">
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
