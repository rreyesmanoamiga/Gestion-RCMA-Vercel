import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Users,
  ClipboardList,
  Ticket,
  ShieldCheck,
  Scale,
  Mail,
  ChevronRight,
  AlertCircle,
  BarChart2,
} from 'lucide-react';

// ─── Archivos en Supabase Storage (bucket privado: documentos-rcma) ────────────
const BUCKET              = 'documentos-rcma';
const FILE_CONTRATOS      = 'REQUISITOS_CONTRATO_PROVEEDOR.pdf';
const FILE_CATALOGO_AGP   = 'REQUISITOS_CONTRATOS_CATALOGO_DE_SERVICIOS_AGP.xlsx';
const SIGNED_URL_TTL      = 60;

// ─── Datos de las fases del protocolo ────────────────────────────────────────
const FASES = [
  {
    num: '01',
    icon: ClipboardList,
    titulo: 'Solicitud de Proyecto',
    color: 'blue',
    pasos: [
      'Ingresar al Sistema RCMA y completar el formulario de Solicitud de Proyecto con toda la información requerida: descripción del proyecto, clasificación, colegio solicitante, datos del responsable y cualquier información técnica pertinente.',
      'Al momento de enviar la solicitud, el sistema permite adjuntar las cotizaciones de proveedores si ya se tienen disponibles. Es importante que las cotizaciones estén actualizadas — no deben tener una antigüedad mayor a 2 meses. Se requiere un mínimo de tres (3) cotizaciones de proveedores distintos. Cada cotización debe incluir: datos del proveedor (razón social, RFC, experiencia), alcance y descripción detallada del trabajo, monto total desglosado en MXN con IVA, tiempo de ejecución, garantía ofrecida y vigencia de la cotización.',
      'En caso de no contar con las cotizaciones al momento de enviar la solicitud, deberán remitirse posteriormente por correo electrónico a rreyes@manoamiga.edu.mx, con copia a su Coordinación Administrativa Regional (CAR) y a arodriguez@manoamiga.edu.mx, en cuanto estén disponibles.',
      'Una vez enviada la solicitud, el sistema generará una notificación automática por correo electrónico al solicitante, confirmando la recepción del registro.',
      'La Coordinación de Obras y Mantenimiento RCMA revisará la solicitud en un plazo no mayor a 5 días hábiles y determinará los pasos a seguir.',
    ],
  },
  {
    num: '02',
    icon: Users,
    titulo: 'Reunión de Entendimiento',
    color: 'indigo',
    pasos: [
      'En caso de que la complejidad o alcance del proyecto lo requiera, se programará una Reunión de Entendimiento con los siguientes participantes: Gerencia Administrativa del Colegio, Coordinación Administrativa Regional (CAR) y Coordinación de Obras y Mantenimiento RCMA.',
      'El propósito de esta reunión es analizar y validar: verificación de permisos o autorizaciones requeridas, disponibilidad y suficiencia del financiamiento, necesidad de anteproyecto arquitectónico o de ingeniería, requerimiento de estudios preliminares (topográficos, de suelo, estructurales, etc.) y definición del alcance, cronograma estimado y áreas involucradas.',
    ],
  },
  {
    num: '03',
    icon: BarChart2,
    titulo: 'Revisión de Cotizaciones',
    color: 'teal',
    pasos: [
      'Si las cotizaciones no fueron adjuntadas durante la Solicitud de Proyecto (Fase 01), deberán enviarse por correo electrónico a rreyes@manoamiga.edu.mx con copia a su CAR de zona y a arodriguez@manoamiga.edu.mx, en cuanto se cuente con ellas.',
      'Recuerda que las cotizaciones deben estar actualizadas (no mayor a 2 meses de antigüedad) y ser un mínimo de tres (3) de proveedores distintos, incluyendo: datos del proveedor, alcance del trabajo, monto en MXN con IVA, tiempo de ejecución, garantía y vigencia.',
      'La Coordinación de Obras y Mantenimiento RCMA realizará la revisión y análisis comparativo de las cotizaciones recibidas para determinar la viabilidad y proceder con las siguientes fases.',
    ],
  },
  {
    num: '04',
    icon: CheckCircle2,
    titulo: 'Solicitud al Equipo ECO',
    color: 'violet',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA elaborará y remitirá una solicitud formal al equipo ECO, con una descripción técnica del proyecto y la justificación de su participación.',
      'En caso de requerirse, se programará una Reunión de Entendimiento entre la Coordinación de Obras y Mantenimiento RCMA y el equipo ECO para alinear criterios técnicos y metodológicos.',
      'Para proyectos de mantenimiento, ECO realizará la asesoría técnica para el análisis comparativo de costos de las cotizaciones presentadas por los proveedores, validando su pertinencia y razonabilidad de precios.',
    ],
  },
  {
    num: '05',
    icon: Ticket,
    titulo: 'Ticket MAS',
    color: 'orange',
    pasos: [
      'La habilitación del módulo Ticket MAS en el Sistema RCMA será liberada por el Coordinador de Obras y Mantenimiento, previa validación de los pasos anteriores. No se otorgará acceso al registro sin esta autorización.',
      'Una vez habilitado el acceso, el solicitante deberá ingresar al Sistema RCMA y completar el formulario del Ticket MAS con la información técnica, financiera y de clasificación requerida, incluyendo las cotizaciones de los proveedores.',
      'El sistema notificará automáticamente a la Coordinación de Obras y Mantenimiento RCMA al recibir el nuevo Ticket MAS para su revisión y proceso de autorización.',
    ],
  },
  {
    num: '06',
    icon: ShieldCheck,
    titulo: 'Autorización del Proyecto',
    color: 'green',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA revisará la información registrada en el Ticket MAS y, de estar completa y correcta, procederá con la autorización formal en el sistema.',
      'El Sistema RCMA notificará de manera automática por correo electrónico a todos los involucrados (solicitante, Gerencia Administrativa, CAR de zona y Coordinación de Obras), indicando las fechas estimadas de recepción, inicio y conclusión del proyecto.',
      'El Coordinador de Obras y Mantenimiento hará llegar al colegio los documentos oficiales (Solicitud de Proyecto y Ticket MAS autorizados) para su integración al expediente del proyecto.',
      'A partir de la autorización, el proyecto quedará registrado en el sistema para su seguimiento, control y supervisión por parte de la Coordinación de Obras y Mantenimiento RCMA.',
    ],
  },
  {
    num: '07',
    icon: Scale,
    titulo: 'Solicitud de Contratos y Actas de Garantía',
    color: 'rose',
    pasos: [
      'Con base en la validación técnica del equipo ECO y la selección formal del proveedor, la Coordinación de Obras y Mantenimiento RCMA remitirá vía correo electrónico una solicitud de autorización a la Dirección correspondiente para gestionar ante OR - SER Jurídico la elaboración del instrumento contractual aplicable. El tipo de documento a elaborar será determinado según la naturaleza del proyecto: Contrato de Prestación de Servicios, Contrato de Donación o Acta de Garantía.',
      'El colegio solicitante deberá recabar la documentación corporativa y fiscal del proveedor seleccionado con base en el listado de requisitos disponible para descarga en esta fase. Dicha documentación deberá adjuntarse directamente en el correo dirigido a OR - SER Jurídico solicitando la elaboración del contrato correspondiente, con copia a: arodriguez@manoamiga.edu.mx, CAR del territorio y Coordinador de Obras y Mantenimiento RCMA.',
      'Para la elaboración de cualquier contrato será necesario llenar el documento "Requisitos Contratos — Catálogo de Servicios AGP" disponible para descarga en esta fase, en la pestaña que corresponda al tipo de operación: Arrendamiento Cafetería, Arrendamiento, Servicios Especializados o Servicios Generales. Si tiene duda de qué pestaña llenar, la Coordinación de Obras y Mantenimiento RCMA con gusto puede asesorarle.',
      'Para lo anterior, es MUY IMPORTANTE lo siguiente: 1) Dar un contexto detallado de la operación previamente a la Coordinación de Obras y Mantenimiento RCMA. 2) Llenar el formato anexo de forma COMPLETA. 3) Adjuntar la información solicitada COMPLETA en el mismo correo del formato.',
      'Es fundamental que el Acta de Garantía sea firmada por el proveedor antes del inicio de los trabajos, de manera simultánea a la firma del contrato. Este documento es el respaldo formal que compromete al proveedor a responder por defectos, vicios ocultos o fallas en los materiales y mano de obra durante el período de garantía establecido. Obtener la firma del Acta previo al arranque de actividades garantiza que el colegio cuente con el sustento legal necesario para exigir correcciones o reparaciones sin costo adicional en caso de que los trabajos presenten fallas, evitando que el proveedor se deslinde de su responsabilidad una vez concluida la obra.',
    ],
    descargas: [
      {
        filename: FILE_CONTRATOS,
        label: 'Requisitos para Elaboración de Contrato',
        descripcion: 'Archivo PDF · Documentación requerida al proveedor para OR - SER Jurídico',
      },
      {
        filename: FILE_CATALOGO_AGP,
        label: 'Requisitos Contratos — Catálogo de Servicios AGP',
        descripcion: 'Archivo Excel · Llenar la pestaña correspondiente: Arrendamiento Cafetería, Arrendamiento, Servicios Especializados o Servicios Generales',
      },
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; badge: string; icon: string; pill: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',    icon: 'text-blue-600',   pill: 'bg-blue-600'   },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', icon: 'text-indigo-600', pill: 'bg-indigo-600' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700',    icon: 'text-teal-600',   pill: 'bg-teal-600'   },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', icon: 'text-violet-600', pill: 'bg-violet-600' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   badge: 'bg-rose-100 text-rose-700',    icon: 'text-rose-600',   pill: 'bg-rose-600'   },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-600', pill: 'bg-orange-600' },
  green:  { bg: 'bg-emerald-50',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700',icon:'text-emerald-600',pill:'bg-emerald-600' },
};

export default function ProtocoloProyectos() {
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const handleDownload = async (filename: string) => {
    setLoadingFile(filename);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filename, SIGNED_URL_TTL);
      if (error || !data?.signedUrl) throw error ?? new Error('No se pudo generar el enlace');
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error('Error al descargar:', err);
      alert('No se pudo descargar el archivo. Intente de nuevo.');
    } finally {
      setLoadingFile(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-8 py-7">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Coordinación de Obras y Mantenimiento RCMA
                </p>
                <h1 className="text-2xl font-black text-white leading-tight">
                  Protocolo de Recepción de Proyectos
                </h1>
                <p className="text-slate-300 text-sm mt-1.5 leading-relaxed">
                  Proceso institucional que establece las etapas, responsables y documentación requerida
                  para la gestión y autorización formal de proyectos en los Colegios Mano Amiga.
                </p>
              </div>
            </div>
          </div>

          {/* Contador de fases */}
          <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fases del proceso:</span>
            {FASES.map((f) => (
              <span key={f.num}
                className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">
                {f.num} · {f.titulo}
              </span>
            ))}
          </div>
        </div>



        {/* ── Fases del protocolo ───────────────────────────────────────── */}
        <div className="space-y-4">
          {FASES.map((fase, idx) => {
            const c = colorMap[fase.color];
            const Icon = fase.icon;
            return (
              <div key={fase.num}
                className={`bg-white rounded-2xl border ${c.border} shadow-sm overflow-hidden`}>

                {/* Header de la fase */}
                <div className={`${c.bg} px-6 py-4 flex items-center gap-3`}>
                  <div className={`w-8 h-8 rounded-lg ${c.pill} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-xs font-black text-white">{fase.num}</span>
                  </div>
                  <Icon className={`w-5 h-5 ${c.icon} flex-shrink-0`} />
                  <h2 className="text-base font-black text-slate-800">{fase.titulo}</h2>
                </div>

                {/* Pasos */}
                <div className="px-6 py-5 space-y-3">
                  {fase.pasos.map((paso, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${c.icon}`} />
                      <p className="text-sm text-slate-600 leading-relaxed">{paso}</p>
                    </div>
                  ))}

                {/* Bloque de descarga (solo fases con archivo(s) adjunto(s)) */}
                  {(fase as any).descargas && (fase as any).descargas.length > 0 && (
                    <div className={`mt-4 rounded-xl ${c.bg} border ${c.border} overflow-hidden`}>
                      <div className={`px-4 py-2.5 border-b ${c.border} flex items-center gap-2`}>
                        <AlertCircle className={`w-3.5 h-3.5 ${c.icon}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${c.icon}`}>
                          {(fase as any).descargas.length > 1 ? 'Documentos requeridos para esta fase' : 'Documento requerido para esta fase'}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {(fase as any).descargas.map((d: any, di: number) => (
                          <button
                            key={di}
                            onClick={() => handleDownload(d.filename)}
                            disabled={loadingFile === d.filename}
                            className={`group flex items-center gap-3 p-3 rounded-lg border-2 border-slate-200 hover:${c.border} hover:${c.bg} transition-all duration-200 text-left w-full sm:w-auto bg-white`}
                          >
                            <div className={`w-9 h-9 rounded-lg bg-white border ${c.border} group-hover:${c.bg} flex items-center justify-center flex-shrink-0 transition-colors`}>
                              <FileText className={`w-4 h-4 ${c.icon}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 leading-tight">{d.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{d.descripcion}</p>
                            </div>
                            {loadingFile === d.filename
                              ? <span className={`w-4 h-4 border-2 ${c.border} border-t-transparent rounded-full animate-spin flex-shrink-0`} />
                              : <Download className={`w-4 h-4 text-slate-400 group-hover:${c.icon} flex-shrink-0 transition-colors`} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bloque especial de correo (solo fase con correo) */}
                  {fase.correo && (
                    <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Instrucciones de envío de correo
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-2 text-xs text-slate-600">
                        <div className="flex gap-2">
                          <span className="font-bold text-slate-800 w-12 flex-shrink-0">PARA:</span>
                          <span className="text-blue-700 font-medium">{fase.correo.para}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="font-bold text-slate-800 w-12 flex-shrink-0">CC:</span>
                          <span>{fase.correo.cc.join(' · ')}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="font-bold text-slate-800 w-12 flex-shrink-0">ASUNTO:</span>
                          <span className="italic text-slate-500">{fase.correo.asunto}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {idx < FASES.length - 1 && (
                  <div className="h-px bg-slate-100 mx-6" />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer institucional ──────────────────────────────────────── */}
        <div className="text-center py-4">
          <p className="text-xs text-slate-400 font-medium">
            Coordinación de Obras y Mantenimiento RCMA · Mano Amiga A.C. · Sistema RCMA 2026
          </p>
        </div>

      </div>
    </div>
  );
}
