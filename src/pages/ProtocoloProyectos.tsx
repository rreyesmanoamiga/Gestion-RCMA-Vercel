import React, { useState } from 'react';
import { useDirectorio, getGerenteFMA } from '@/lib/directorio';
import {
  BookOpen,
  Download,
  FileText,
  Users,
  ClipboardList,
  Ticket,
  ShieldCheck,
  Scale,
  Mail,
  ChevronRight,
  AlertCircle,
  BarChart2,
  Inbox,
} from 'lucide-react';

// ─── Documento descargable (formato institucional, se publica con el sistema) ──
// Está en public/documentos: es una plantilla en blanco, sin datos de nadie.
const FILE_CATALOGO_AGP = 'REQUISITOS_CONTRATOS_CATALOGO_DE_SERVICIOS_AGP.xlsx';
const RUTA_DOCUMENTOS   = '/documentos/';

// ─── Datos de las fases del protocolo ────────────────────────────────────────
// Refleja cómo se trabaja hoy en el Sistema RCMA: Solicitud → Recepción →
// Validación técnica → Ticket MAS → Autorización (crea Proyecto y Expediente) →
// Contratos → Seguimiento en NEXUS y cierre.
const FASES = [
  {
    num: '01',
    icon: ClipboardList,
    titulo: 'Solicitud de Proyecto',
    color: 'blue',
    pasos: [
      'Ingresar al Sistema RCMA, en Gestión de Proyectos › Solicitud de Proyecto, y completar el formulario: datos del centro (la razón social, sociedad y centro gestor se llenan solos con el Directorio), nombre del proyecto, tipo de iniciativa (construcción nueva, mejora, mantenimiento ordinario o extraordinario, remodelación, adecuación de espacio, ampliación, garantías o revisión), resumen, fechas propuestas de inicio y conclusión, y plan de financiamiento (Operación, FBC, Donativos u Otras fuentes). Los datos del solicitante se toman automáticamente de su usuario.',
      'Se requiere un mínimo de tres (3) cotizaciones de proveedores distintos, actualizadas (no mayores a 2 meses). Cada cotización debe incluir: datos del proveedor (razón social, RFC, experiencia), alcance y descripción detallada del trabajo, monto total desglosado en MXN con IVA, tiempo de ejecución, garantía ofrecida y vigencia de la cotización.',
      'Las cotizaciones se adjuntan en la misma solicitud. Si aún no se tienen, deberán enviarse en cuanto estén disponibles por correo electrónico a rreyes@manoamiga.edu.mx, con copia a su Coordinación Administrativa Regional (CAR) y a arodriguez@manoamiga.edu.mx.',
      'Al enviar, el sistema asigna el folio de la solicitud (SOL-AAAA-NNN) y registra la fecha y hora de envío, que aparece como firma del solicitante en el formato impreso. El solicitante recibe un correo de confirmación y la Coordinación de Obras y Mantenimiento RCMA recibe el aviso de la nueva solicitud.',
    ],
  },
  {
    num: '02',
    icon: Inbox,
    titulo: 'Recepción y Revisión de la Solicitud',
    color: 'indigo',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA revisará la solicitud en Solicitudes Recibidas en un plazo no mayor a 5 días hábiles.',
      'Si la información está completa, la solicitud se marca como Recibida: el solicitante recibe la notificación por correo y el formato de la Solicitud de Proyecto queda con el Vo. Bo. de la Coordinación, con fecha y hora.',
      'Si algún dato debe ajustarse, la Coordinación lo corrige en el sistema indicando el motivo; cada corrección queda registrada en la bitácora de Auditoría con el valor anterior y el nuevo. Si la solicitud no procede, se cancela con su motivo y se notifica por correo al solicitante.',
    ],
  },
  {
    num: '03',
    icon: Users,
    titulo: 'Reunión de Entendimiento y Validación Técnica',
    color: 'teal',
    pasos: [
      'En caso de que la complejidad o el alcance del proyecto lo requiera, se programará una Reunión de Entendimiento con la Gerencia Administrativa del Colegio, la Coordinación Administrativa Regional (CAR) y la Coordinación de Obras y Mantenimiento RCMA, para validar: permisos o autorizaciones requeridas, disponibilidad y suficiencia del financiamiento, necesidad de anteproyecto arquitectónico o de ingeniería, estudios preliminares (topográficos, de suelo, estructurales, etc.), alcance, cronograma estimado y áreas involucradas.',
      'Los acuerdos de la reunión se registran en una Minuta dentro del sistema; los acuerdos con responsable y fecha se siguen como pendientes en NEXUS hasta su cumplimiento.',
      'Cuando se requiera, la Coordinación solicitará la participación del equipo ECO para la validación técnica del proyecto y el análisis comparativo de costos de las cotizaciones presentadas, validando su pertinencia y razonabilidad de precios. Si el proyecto necesita anteproyecto, éste se gestiona en el módulo de Anteproyectos.',
    ],
  },
  {
    num: '04',
    icon: Ticket,
    titulo: 'Ticket MAS',
    color: 'orange',
    pasos: [
      'Con la solicitud recibida y validada, la Coordinación de Obras y Mantenimiento RCMA habilita el Ticket MAS desde Solicitudes Recibidas y el solicitante recibe el aviso por correo. Sin esta habilitación no se tiene acceso al registro.',
      'El solicitante ingresa al Sistema RCMA y completa el formulario del Ticket MAS: clasificación del proyecto (y, si es mantenimiento, si es preventivo o correctivo), descripción del trabajo, cotizaciones (proveedor e importe), motivo de selección del proveedor, forma de financiamiento, suplemento y traspaso.',
      'En el mismo formulario se indica de qué sociedad sale el pago: del mismo colegio o de otro colegio. Si es de otro, se selecciona el colegio que paga y sus datos (razón social, sociedad, centro gestor y contador) se llenan solos; en el Ticket MAS impreso aparecen lado a lado el colegio que solicita y la sociedad que paga.',
      'Al enviar, el sistema asigna el folio consecutivo (TMAS-AAAA-NNN), registra la fecha y hora de envío como firma del solicitante y notifica automáticamente a la Coordinación de Obras y Mantenimiento RCMA.',
    ],
  },
  {
    num: '05',
    icon: ShieldCheck,
    titulo: 'Autorización del Proyecto',
    color: 'green',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA revisa la información del Ticket MAS y, de estar completa y correcta, lo autoriza en el sistema capturando las fechas estimadas de recepción, inicio y conclusión. En proyectos de la Federación (Oficinas MTY, Oficinas CDMX y General) se requiere primero el Vo. Bo. de la Gerencia, que lo otorga con su propio usuario.',
      'Al autorizar, el sistema notifica por correo a los involucrados (solicitante, CAR de zona y Coordinación de Obras) con las fechas estimadas del proyecto.',
      'En automático, el proyecto queda registrado en Proyectos y se crea su expediente en OneDrive (Expedientes › Año › Colegio › Folio – Proyecto) con las carpetas de la Coordinación RCMA (Solicitud, Cotizaciones, Ticket MAS, Autorización) y de ECO (Proyecto Ejecutivo, Acta de Inicio, Reportes de Obra, Acta de Entrega, Cierre de Obra y Fotografías antes, durante y después); ahí se guarda el Ticket MAS autorizado.',
      'Si un Ticket MAS se cancela, se registra el motivo y se notifica por correo a los involucrados; su seguimiento queda como cancelado con todo su historial.',
    ],
  },
  {
    num: '06',
    icon: Scale,
    titulo: 'Solicitud de Contratos y Actas de Garantía',
    color: 'rose',
    pasos: [
      'Con base en la validación técnica y la selección formal del proveedor, la Coordinación de Obras y Mantenimiento RCMA remitirá vía correo electrónico una solicitud de autorización a la Dirección correspondiente para gestionar ante OR - SER Jurídico la elaboración del instrumento contractual aplicable: Contrato de Prestación de Servicios, Contrato de Arrendamiento, Contrato de Comodato, Contrato de Donación o Acta de Garantía, según la naturaleza del proyecto.',
      'Para la elaboración de cualquier contrato es necesario llenar el formato "Requisitos para Contratos — Catálogo de Servicios AGP" disponible para descarga en esta fase, en la pestaña que corresponda al tipo de operación: Arrendamiento Cafetería, Arrendamiento, Servicios Especializados, Servicios Generales o Comodato. La pestaña Instrucciones indica cuál llenar; si tiene duda, la Coordinación de Obras y Mantenimiento RCMA con gusto le asesora.',
      'Es MUY IMPORTANTE: 1) Dar un contexto detallado de la operación previamente a la Coordinación de Obras y Mantenimiento RCMA. 2) Llenar el formato de forma COMPLETA. 3) Adjuntar la documentación solicitada COMPLETA en el mismo correo del formato, dirigido a OR - SER Jurídico con copia a arodriguez@manoamiga.edu.mx, CAR del territorio y Coordinador de Obras y Mantenimiento RCMA.',
      'Es fundamental que el Acta de Garantía sea firmada por el proveedor antes del inicio de los trabajos, de manera simultánea a la firma del contrato. Este documento es el respaldo formal que compromete al proveedor a responder por defectos, vicios ocultos o fallas en los materiales y mano de obra durante el período de garantía establecido, y da al colegio el sustento legal para exigir correcciones o reparaciones sin costo adicional.',
    ],
    descargas: [
      {
        filename: FILE_CATALOGO_AGP,
        label: 'Requisitos para Contratos — Catálogo de Servicios AGP',
        descripcion: 'Archivo Excel · Formato institucional con instrucciones y una pestaña por tipo de contrato',
      },
    ],
  },
  {
    num: '07',
    icon: BarChart2,
    titulo: 'Ejecución, Seguimiento y Cierre',
    color: 'sky',
    pasos: [
      'Cuando el proyecto queda En Espera, En Proceso o Pausado, el sistema abre automáticamente su bitácora en NEXUS › Seguimiento de Proyectos, donde se registran los comentarios de avance con fotografías y los pendientes del proyecto.',
      'La evidencia del proyecto se integra en su expediente de OneDrive: proyecto ejecutivo, acta de inicio, reportes de obra, acta de entrega, cierre y fotografías del antes, durante y después.',
      'El avance de cada proyecto se presenta en la Presentación Semanal de Seguimiento de Proyectos (miércoles), que el sistema arma con los comentarios y fotos registrados en la semana.',
      'Al concluir los trabajos, con el acta de entrega y la garantía vigente, el proyecto se marca como Completado y su seguimiento queda como evidencia en el sistema.',
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
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-200',    badge: 'bg-sky-100 text-sky-700',      icon: 'text-sky-600',    pill: 'bg-sky-600'    },
};

export default function ProtocoloProyectos() {
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  // Correo del Gerente en vivo desde Directorio — el texto del protocolo
  // (definido más arriba, fuera del componente) menciona su correo a mano;
  // aquí se sustituye por el actual al momento de mostrarlo.
  const { data: directorioRows = [] } = useDirectorio();
  const gerenteEmail = getGerenteFMA(directorioRows).correo || 'arodriguez@manoamiga.edu.mx';
  const conCorreoActual = (texto: string) => texto.replaceAll('arodriguez@manoamiga.edu.mx', gerenteEmail);

  const handleDownload = async (filename: string) => {
    setLoadingFile(filename);
    try {
      const r = await fetch(RUTA_DOCUMENTOS + filename);
      if (!r.ok) throw new Error('No se encontró el archivo');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
                      <p className="text-sm text-slate-600 leading-relaxed">{conCorreoActual(paso)}</p>
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
