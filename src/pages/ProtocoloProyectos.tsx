import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Users,
  ClipboardList,
  Ticket,
  ShieldCheck,
  Mail,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

// ─── Archivos en Supabase Storage (bucket privado: documentos-rcma) ────────────
const BUCKET = 'documentos-rcma';
const FILE_TICKET      = 'TICKET_MAS_V2.xlsx';
const FILE_TABLA       = 'TABLA COMPARATIVA_MAS_V2.xlsx';
const SIGNED_URL_TTL   = 60; // segundos de validez del enlace de descarga

// ─── Datos de las fases del protocolo ────────────────────────────────────────
const FASES = [
  {
    num: '01',
    icon: ClipboardList,
    titulo: 'Solicitud de Proyecto',
    color: 'blue',
    pasos: [
      'Ingresar al Sistema RCMA y completar el formulario de Solicitud de Proyecto con toda la información requerida del proyecto.',
      'Una vez enviada, la Coordinación de Obras y Mantenimiento RCMA revisará la solicitud y notificará el resultado vía correo electrónico.',
    ],
  },
  {
    num: '02',
    icon: Users,
    titulo: 'Reunión de Entendimiento',
    color: 'indigo',
    pasos: [
      'De ser necesario, se convocará a una reunión de entendimiento con la participación de: Gerencia Administrativa, Coordinación Administrativa Regional (CAR) y Coordinación de Obras y Mantenimiento RCMA.',
      'En dicha reunión se definen alcances: permisos requeridos, disponibilidad de financiamiento, necesidad de anteproyecto o estudios preliminares, entre otros.',
      'Si el colegio ya cuenta con cotizaciones de proveedores, deberán enviarse por correo electrónico para su revisión y validación técnica.',
    ],
  },
  {
    num: '03',
    icon: CheckCircle2,
    titulo: 'Solicitud al Equipo ECO',
    color: 'violet',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA elaborará y remitirá una solicitud formal al equipo ECO, describiendo el proyecto y el tipo de apoyo requerido.',
      'Para proyectos de mantenimiento, ECO realizará el análisis comparativo de costos cotizados por los distintos proveedores.',
    ],
  },
  {
    num: '04',
    icon: Ticket,
    titulo: 'Ticket MAS y Documentación',
    color: 'orange',
    esTicket: true,
    pasos: [
      'El MA Colegio deberá completar y enviar los siguientes documentos: Ticket MAS (con firmas digitales), tres cotizaciones de proveedores y la Tabla Comparativa.',
      'Todos los archivos deben entregarse en formato Excel debidamente llenado y convertidos a PDF. Solo el Ticket MAS requiere firmas digitales.',
    ],
    correo: {
      para: 'rreyes@manoamiga.edu.mx',
      cc: [
        'arodriguez@manoamiga.edu.mx',
        'ecastaneda@manoamiga.edu.mx',
        'CAR de zona correspondiente',
      ],
      asunto: 'MA [Colegio] | Ticket MAS | [Nombre del Proyecto]',
    },
  },
  {
    num: '05',
    icon: ShieldCheck,
    titulo: 'Autorización del Proyecto',
    color: 'green',
    pasos: [
      'La Coordinación de Obras y Mantenimiento RCMA responderá el correo del Ticket MAS con la autorización formal del proyecto.',
      'La respuesta incluirá: Número de Proyecto, Folio de Ticket, Fecha de autorización, Proveedor autorizado, Costo autorizado y tiempos estimados de inicio y conclusión.',
      'Se adjuntará el Ticket MAS con firma autorizada y una copia de la Solicitud de Proyecto ingresada al sistema.',
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; badge: string; icon: string; pill: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700',   icon: 'text-blue-600',   pill: 'bg-blue-600'   },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200',badge: 'bg-indigo-100 text-indigo-700',icon: 'text-indigo-600', pill: 'bg-indigo-600' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200',badge: 'bg-violet-100 text-violet-700',icon: 'text-violet-600', pill: 'bg-violet-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200',badge: 'bg-orange-100 text-orange-700',icon: 'text-orange-600', pill: 'bg-orange-600' },
  green:  { bg: 'bg-emerald-50',border: 'border-emerald-200',badge:'bg-emerald-100 text-emerald-700',icon:'text-emerald-600',pill:'bg-emerald-600'},
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

        {/* ── Descargables ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex items-center gap-2.5 bg-amber-50">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-800">
              Documentos requeridos para la Fase 04 — Ticket MAS
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Ticket MAS */}
            <button
              onClick={() => handleDownload(FILE_TICKET)}
              disabled={loadingFile === FILE_TICKET}
              className="group flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 text-left"
            >
              <div className="w-11 h-11 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight">Ticket MAS</p>
                <p className="text-xs text-slate-500 mt-0.5">Archivo Excel · Requiere firmas digitales</p>
              </div>
              {loadingFile === FILE_TICKET
                ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                : <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0 transition-colors" />}
            </button>

            {/* Tabla Comparativa */}
            <button
              onClick={() => handleDownload(FILE_TABLA)}
              disabled={loadingFile === FILE_TABLA}
              className="group flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all duration-200 text-left"
            >
              <div className="w-11 h-11 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0 transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight">Tabla Comparativa</p>
                <p className="text-xs text-slate-500 mt-0.5">Archivo Excel · Análisis de cotizaciones</p>
              </div>
              {loadingFile === FILE_TABLA
                ? <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                : <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 flex-shrink-0 transition-colors" />}
            </button>
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

                  {/* Bloque especial de correo (solo fase 04) */}
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

                {/* Conector visual entre fases */}
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
