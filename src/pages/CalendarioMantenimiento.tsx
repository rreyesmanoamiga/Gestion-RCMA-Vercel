import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Clock, AlertTriangle, Wrench, X, Plus, Trash2, Bell, Mail, UserPlus, Pencil, Lock, Search, ChevronDown, ChevronUp, BellOff, Filter, FileSpreadsheet, Loader2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { COLEGIOS } from '@/lib/colegios';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { generarReporteIndividualExcel, generarReporteGeneralPDF, generarReporteIndividualPDFFirma, type CumplimientoColegioPC } from '@/lib/reportesProteccionCivil';
import { useDirectorio, getDirector, getAdministrador, findColegio } from '@/lib/directorio';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';

// Comprime/redimensiona una foto antes de subirla — clave para que la
// evidencia obligatoria de mantenimiento no dispare el uso de almacenamiento.
// Reduce al lado más largo a 1600px y reencoda a JPEG calidad 75%.
async function comprimirFotoEvidencia(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const MAX_LADO = 1600;
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen')), 'image/jpeg', 0.75);
  });

  const nombreBase = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${nombreBase}.jpg`, { type: 'image/jpeg' });
}

export interface Actividad {
  id: number | string;
  categoria: string;
  actividad: string;
  tipo: 'Limpiar' | 'Renovar' | 'Revisar';
  frecuencia: string;
  frecuenciaDias: number;
  descripcion: string;
  esPersonalizada?: boolean;
  esSobreescrita?: boolean;   // base activity that has been overridden in DB
  customId?: string;          // UUID of the custom_maintenance record (for base overrides)
  base_id?: number;           // original ACTIVIDADES_BASE id (for overrides)
  eliminado?: boolean;        // base activity oculta por el admin
}

interface NotificationRecipient {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  actividades_ids: number[] | null; // null = todos los mttos
  colegio: string | null; // null = todos los colegios (para el recordatorio "sin marcar hoy")
}

export const ACTIVIDADES_BASE: Actividad[] = [
  { id: 1,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes interiores',       tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de las paredes y divisiones interiores.' },
  { id: 2,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar banquinas y cornisas',     tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de banquinas, cornisas y demas acabados.' },
  { id: 3,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes exteriores',       tipo: 'Limpiar', frecuencia: '2 años',  frecuenciaDias: 730,  descripcion: 'Limpieza general de las paredes exteriores.' },
  { id: 4,  categoria: 'Paredes y Acabados',    actividad: 'Renovar laminas deterioradas',     tipo: 'Renovar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitucion de las laminas y/o paneles que presenten deterioro.' },
  { id: 5,  categoria: 'Pisos',                 actividad: 'Limpiar piso vinilico',            tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza y cepillado con productos antimanchas.' },
  { id: 6,  categoria: 'Pisos',                 actividad: 'Encerar pisos ceramicos',          tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Encerado de los pisos ceramicos.' },
  { id: 7,  categoria: 'Pisos',                 actividad: 'Limpiar rodapie',                  tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza del rodapie.' },
  { id: 8,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar laminas de cubierta',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza externa e interna de las laminas.' },
  { id: 9,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar canoas',                  tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza de las canoas.' },
  { id: 10, categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar cubierta de techo',       tipo: 'Limpiar', frecuencia: '4 meses', frecuenciaDias: 120,  descripcion: 'Limpieza de la cubierta de techo.' },
  { id: 11, categoria: 'Techo y Red Pluvial',   actividad: 'Revisar anclajes de laminas',     tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Revision y resocado de los anclajes de laminas.' },
  { id: 12, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar puertas y ventanas',      tipo: 'Limpiar', frecuencia: '1 mes',   frecuenciaDias: 30,   descripcion: 'Limpieza integral de superficies expuestas.' },
  { id: 13, categoria: 'Puertas y Ventanas',    actividad: 'Lubricar bisagras y pivotes',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Lubricacion de bisagras, pivotes y brazos hidraulicos.' },
  { id: 14, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar canales de desague',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de canales y perforaciones de desague.' },
  { id: 15, categoria: 'Red de Agua Potable',   actividad: 'Limpiar llaves de paso',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpiar llaves de paso y lubricacion del vastago.' },
  { id: 16, categoria: 'Red de Agua Potable',   actividad: 'Limpiar cajas de registro',       tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza de las cajas de registro.' },
  { id: 17, categoria: 'Sanitarios',            actividad: 'Limpiar sanitarios',              tipo: 'Limpiar', frecuencia: '1 dia',   frecuenciaDias: 1,    descripcion: 'Limpieza y desinfeccion de lavatorios, orinales e inodoros.' },
  { id: 18, categoria: 'Sanitarios',            actividad: 'Revisar llaves y tuberias',       tipo: 'Revisar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitucion general de llaves de control y tuberias.' },
  { id: 19, categoria: 'Red Sanitaria',         actividad: 'Limpiar arquetas y trampas',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de arquetas, trampa de grasa y cajas de registro.' },
  { id: 20, categoria: 'Red Sanitaria',         actividad: 'Limpiar tanque septico',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza del tanque septico y drenajes.' },
  { id: 21, categoria: 'Instalacion Electrica', actividad: 'Limpiar apagadores y lamparas',  tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de apagadores, tomacorrientes y lamparas.' },
  { id: 22, categoria: 'Instalacion Electrica', actividad: 'Limpiar difusores lamparas',     tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Desmontaje y limpieza de difusores de lamparas fluorescentes.' },
  { id: 23, categoria: 'Barandillas y Rejas',   actividad: 'Limpiar rejas y barandillas',    tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza integral de las rejas, barandillas y persianas.' },
  { id: 24, categoria: 'Barandillas y Rejas',   actividad: 'Engrasar persianas enrollables', tipo: 'Renovar', frecuencia: '3 años',  frecuenciaDias: 1095, descripcion: 'Engrasado de las guias y del tambor de las persianas.' },
  // --- Seguridad y Emergencias ---
  { id: 25, categoria: 'Seguridad y Emergencias', actividad: 'Revisar extintores',                   tipo: 'Revisar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Inspeccion visual, peso y presion de todos los extintores del plantel.' },
  { id: 26, categoria: 'Seguridad y Emergencias', actividad: 'Revisar señalamientos de emergencia',  tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Verificacion de senales de evacuacion, salidas de emergencia y rutas.' },
  { id: 27, categoria: 'Seguridad y Emergencias', actividad: 'Probar luces de emergencia',           tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30,   descripcion: 'Prueba funcional de luminarias de emergencia y verificacion de bateria.' },
  { id: 28, categoria: 'Seguridad y Emergencias', actividad: 'Revisar botiquin de primeros auxilios', tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30,   descripcion: 'Revision y reposicion de materiales del botiquin segun inventario.' },
  // --- Climatizacion ---
  { id: 29, categoria: 'Climatizacion',            actividad: 'Limpiar filtros de aires acondicionados', tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,  descripcion: 'Desmontaje, limpieza y reinstalacion de filtros de unidades de AC.' },
  { id: 30, categoria: 'Climatizacion',            actividad: 'Revision general de equipos de AC',       tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365, descripcion: 'Revision de carga de gas, compresor, drenajes y funcionamiento general.' },
  // --- Areas Exteriores ---
  { id: 31, categoria: 'Areas Exteriores',         actividad: 'Revisar juegos infantiles y equipo',  tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30,  descripcion: 'Inspeccion de seguridad de juegos, canastas, porterias y equipo exterior.' },
  { id: 32, categoria: 'Areas Exteriores',         actividad: 'Limpiar patios y areas comunes',      tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,   descripcion: 'Barrido, retiro de basura y limpieza general de patios y pasillos.' },
  { id: 33, categoria: 'Areas Exteriores',         actividad: 'Revisar bardas y mallas perimetrales',tipo: 'Revisar', frecuencia: '6 meses', frecuenciaDias: 180, descripcion: 'Inspeccion de estado fisico de bardas, rejas y mallas de perimetro.' },
  // --- Instalaciones Especiales ---
  { id: 34, categoria: 'Instalaciones Especiales', actividad: 'Limpiar cisterna y tinaco',           tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180, descripcion: 'Vaciado, lavado y desinfeccion de cisterna y/o tinaco de almacenamiento.' },
  { id: 35, categoria: 'Instalaciones Especiales', actividad: 'Fumigacion y control de plagas',      tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,  descripcion: 'Aplicacion preventiva de fumigacion en todas las areas del plantel.' },
  { id: 36, categoria: 'Instalaciones Especiales', actividad: 'Revisar camaras de seguridad',        tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30,  descripcion: 'Verificacion de funcionamiento, angulo y grabacion de camaras CCTV.' },
  { id: 37, categoria: 'Instalaciones Especiales', actividad: 'Revisar planta de emergencia y UPS',  tipo: 'Revisar', frecuencia: '3 meses', frecuenciaDias: 90,  descripcion: 'Prueba de arranque, nivel de combustible y estado de baterias UPS.' },
];

const COLORES_CATEGORIA: Record<string, string> = {
  'Paredes y Acabados':      '#6366f1',
  'Pisos':                   '#f59e0b',
  'Techo y Red Pluvial':     '#10b981',
  'Puertas y Ventanas':      '#3b82f6',
  'Red de Agua Potable':     '#06b6d4',
  'Sanitarios':              '#ec4899',
  'Red Sanitaria':           '#8b5cf6',
  'Instalacion Electrica':   '#f97316',
  'Barandillas y Rejas':     '#14b8a6',
  'Seguridad y Emergencias': '#ef4444',
  'Climatizacion':           '#0ea5e9',
  'Areas Exteriores':        '#22c55e',
  'Instalaciones Especiales':'#a855f7',
  'Personalizado':           '#64748b',
};

const FRECUENCIAS_PRESET = [
  { label: '1 dia',    dias: 1 },
  { label: '1 semana', dias: 7 },
  { label: '1 mes',    dias: 30 },
  { label: '3 meses',  dias: 90 },
  { label: '4 meses',  dias: 120 },
  { label: '6 meses',  dias: 180 },
  { label: '1 año',    dias: 365 },
  { label: '2 años',   dias: 730 },
  { label: '3 años',   dias: 1095 },
  { label: '5 años',   dias: 1825 },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const FECHA_BASE = new Date(2025, 0, 1);

export function mergeActividadesConCustom(customRaw: any[]): {
  actividadesBaseMerged: Actividad[]; actividadesBaseOcultas: Actividad[]; todasActividades: Actividad[];
} {
  const customActividades: Actividad[] = (customRaw ?? []).map((r: any) => ({
    id: r.base_id ?? r.id,
    categoria: r.categoria, actividad: r.actividad, tipo: r.tipo,
    frecuencia: r.frecuencia, frecuenciaDias: r.frecuencia_dias, descripcion: r.descripcion || '',
    esPersonalizada: r.base_id == null,
    esSobreescrita: r.base_id != null,
    customId: r.id,
    base_id: r.base_id ?? undefined,
    eliminado: !!r.eliminado,
  }));

  const baseOverrides: Record<number, Actividad> = {};
  customActividades.filter(a => a.base_id != null).forEach(a => { baseOverrides[a.base_id!] = a; });

  const actividadesBaseMerged: Actividad[] = ACTIVIDADES_BASE
    .filter(a => !baseOverrides[a.id as number]?.eliminado)
    .map(a => baseOverrides[a.id as number] ?? a);

  const actividadesBaseOcultas: Actividad[] = ACTIVIDADES_BASE
    .filter(a => baseOverrides[a.id as number]?.eliminado)
    .map(a => baseOverrides[a.id as number]);

  const customPuras = customActividades.filter(a => a.base_id == null);

  return { actividadesBaseMerged, actividadesBaseOcultas, todasActividades: [...actividadesBaseMerged, ...customPuras] };
}

export function calcularFechasEnMes(act: Actividad, año: number, mes: number): Date[] {
  const fechas: Date[] = [];
  const inicioMes = new Date(año, mes, 1);
  const finMes = new Date(año, mes + 1, 0);
  let fecha = new Date(FECHA_BASE);
  while (fecha <= finMes) {
    const esDomingo = fecha.getDay() === 0;
    // Diarias: el domingo simplemente no cuenta (no deja hueco real, ya se
    // hizo el sábado y se vuelve a hacer el lunes).
    // Todo lo demás (semanal, mensual, anual...): se recorre al lunes para no
    // perder la única ocurrencia del periodo — pero el ciclo sigue calculándose
    // desde la fecha original de domingo, para que no se recorra todo lo futuro.
    if (esDomingo && act.frecuenciaDias === 1) {
      // se omite, no se agrega nada
    } else {
      const fechaMostrar = esDomingo ? new Date(fecha.getTime() + 86400000) : fecha;
      if (fechaMostrar >= inicioMes && fechaMostrar <= finMes) fechas.push(new Date(fechaMostrar));
    }
    fecha = new Date(fecha.getTime() + act.frecuenciaDias * 86400000);
  }
  return fechas;
}

function calcularProximasFechas(act: Actividad, cantidad: number = 8): Date[] {
  const resultado: Date[] = [];
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  let fecha = new Date(FECHA_BASE);
  const limite = new Date(hoy.getFullYear() + 6, 0, 1);
  while (resultado.length < cantidad && fecha < limite) {
    const esDomingo = fecha.getDay() === 0;
    if (!(esDomingo && act.frecuenciaDias === 1)) {
      const fechaMostrar = esDomingo ? new Date(fecha.getTime() + 86400000) : fecha;
      if (fechaMostrar >= hoy) resultado.push(new Date(fechaMostrar));
    }
    fecha = new Date(fecha.getTime() + act.frecuenciaDias * 86400000);
  }
  return resultado;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

export default function CalendarioMantenimiento() {
  const hoy = new Date();
  const { user } = useAuth();
  const { isAdmin, can, permsRecord } = usePermissions();
  const puedeCrear    = isAdmin || can('crear_calendario');
  const puedeEditar   = isAdmin || can('editar_calendario');
  const puedeEliminar = isAdmin || can('eliminar_calendario');
  const qc = useQueryClient();

  // Colegio del usuario actual (si tiene uno asignado específico en Accesos) —
  // determina para qué colegio puede marcar mantenimientos como realizados.
  const miColegio      = String((permsRecord as any)?.colegio ?? '');
  const esAdminColegio = !isAdmin && !!miColegio && miColegio !== 'ECO';
  const miTerritorio   = COLEGIOS.find(c => c.colegio === miColegio)?.territorio ?? '';

  // ── Evidencia fotográfica obligatoria al marcar una actividad realizada ──
  // Flujo en 2 pasos: 1) se sube la foto en cuanto se elige (no se puede
  // avanzar sin que esto termine bien), 2) "Marcar como realizado" solo se
  // habilita una vez que la subida ya tiene URL confirmada.
  const { uploadCustom: subirEvidenciaCustom, uploading: subiendoEvidencia } = useSharePointUpload();
  const [evidenciaPendiente, setEvidenciaPendiente] = useState<{ act: Actividad; fecha: Date } | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [evidenciaUrlSubida, setEvidenciaUrlSubida] = useState<string | null>(null);
  const [evidenciaError, setEvidenciaError] = useState<string | null>(null);

  const abrirModalEvidencia = (act: Actividad, fecha: Date) => {
    setEvidenciaPendiente({ act, fecha });
    setEvidenciaPreview(null);
    setEvidenciaUrlSubida(null);
    setEvidenciaError(null);
  };
  const cerrarModalEvidencia = () => {
    setEvidenciaPendiente(null);
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaPreview(null);
    setEvidenciaUrlSubida(null);
    setEvidenciaError(null);
  };

  // Carpeta dedicada, propia del Calendario — separada de "Evidencias" (que ya
  // usan Checklists y Mínimos Indispensables) para que quede lista y limpia
  // por si Protección Civil la pide.
  // Evidencia Calendario Mantenimiento / Año / Territorio / Colegio / Categoría / Fecha_Actividad.jpg
  const construirCarpetaEvidencia = (act: Actividad, fecha: Date) => {
    const año = fecha.getFullYear();
    const categoriaLimpia = act.categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    return `Evidencia Calendario Mantenimiento/${año}/${miTerritorio || 'SIN_TERRITORIO'}/${miColegio || 'SIN_COLEGIO'}/${categoriaLimpia}`;
  };

  const handleSeleccionFoto = async (file: File | undefined) => {
    if (!file || !evidenciaPendiente) return;
    setEvidenciaPreview(URL.createObjectURL(file));
    setEvidenciaUrlSubida(null);
    setEvidenciaError(null);
    try {
      const comprimida = await comprimirFotoEvidencia(file);
      const { act, fecha } = evidenciaPendiente;
      const actividadLimpia = act.actividad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
      const nombreArchivo = `${fechaISO(fecha)}_${actividadLimpia}.jpg`;
      const carpeta = construirCarpetaEvidencia(act, fecha);
      const url = await subirEvidenciaCustom(comprimida, carpeta, nombreArchivo);
      if (!url) { setEvidenciaError('No se pudo subir la evidencia. Intenta de nuevo.'); return; }
      setEvidenciaUrlSubida(url);
    } catch (err: any) {
      setEvidenciaError('No se pudo procesar la foto: ' + (err.message ?? 'error desconocido'));
    }
  };

  const confirmarMarcarRealizado = async () => {
    if (!evidenciaPendiente || !evidenciaUrlSubida) return;
    try {
      await toggleCompletionMutation.mutateAsync({
        act: evidenciaPendiente.act, fecha: evidenciaPendiente.fecha, marcar: true, evidenciaUrl: evidenciaUrlSubida,
      });
      cerrarModalEvidencia();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo marcar la actividad');
    }
  };

  const [año, setAño] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null);
  const [vistaActiva, setVistaActiva] = useState<'calendario' | 'lista' | 'cumplimiento'>('calendario');
  const [showModal, setShowModal] = useState(false);
  const [showGestion, setShowGestion] = useState(false);
  const [showNotificaciones, setShowNotificaciones] = useState(false);
  const [showReportePC, setShowReportePC] = useState(false);
  const [pcColegio, setPcColegio] = useState('');
  const [pcAño, setPcAño] = useState(new Date().getFullYear());
  const [pcMes, setPcMes] = useState(new Date().getMonth());
  const [pcGenerando, setPcGenerando] = useState<'individual' | 'general' | 'firma' | null>(null);
  const { data: directorioRowsPC = [] } = useDirectorio();
  const [editingItem, setEditingItem] = useState<Actividad | null>(null);
  const [showConsulta, setShowConsulta] = useState(false);
  const [consultaActividadId, setConsultaActividadId] = useState<string>('');
  const [consultaCategoriaFiltro, setConsultaCategoriaFiltro] = useState<string>('');

  // Gestionar: actividad seleccionada para editar dentro del modal
  const [gestionSelected, setGestionSelected] = useState<Actividad | null>(null);
  const [gestionSearch, setGestionSearch] = useState('');
  const [showOcultos, setShowOcultos] = useState(false);
  const [colegioExpandido, setColegioExpandido] = useState<string | null>(null);

  // Recipient: selector de actividades al agregar
  const [formRecipientTodos, setFormRecipientTodos] = useState(true);
  const [formRecipientIds, setFormRecipientIds] = useState<number[]>([]);

  const [form, setForm] = useState({
    categoria: '', categoriaCustom: '', actividad: '',
    tipo: 'Limpiar' as 'Limpiar' | 'Renovar' | 'Revisar',
    frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '',
  });

  const [formRecipient, setFormRecipient] = useState({ email: '', nombre: '' });
  const [formRecipientColegio, setFormRecipientColegio] = useState('');
  const [recipientModoManual, setRecipientModoManual] = useState(false);
  const [recipientSeleccionado, setRecipientSeleccionado] = useState('');

  const { data: customRaw = [] } = useQuery({
    queryKey: ['customMaintenance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_maintenance').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });

  // ── Admin notification toggle ──────────────────────────────────────────────
  const { data: adminNotifData } = useQuery({
    queryKey: ['maintenanceAdminSettings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('maintenance_settings')
        .select('value')
        .eq('key', 'admin_notif_activo')
        .single();
      return data;
    },
  });
  const adminNotifActivo: boolean = adminNotifData?.value === 'true' || adminNotifData?.value === true;

  // ── Hora de notificación ───────────────────────────────────────────────────
  const { data: notifHoraData } = useQuery({
    queryKey: ['maintenanceNotifHora'],
    queryFn: async () => {
      const { data } = await supabase
        .from('maintenance_settings')
        .select('value')
        .eq('key', 'notif_hora')
        .single();
      return data;
    },
  });
  const notifHora: number = parseInt(notifHoraData?.value ?? '7', 10);

  const setNotifHoraMutation = useMutation({
    mutationFn: async (hora: number) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar la configuración del calendario.');
      const { error } = await supabase
        .from('maintenance_settings')
        .upsert({ key: 'notif_hora', value: String(hora) });
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: 'Horario de notificación', detalle: { hora } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceNotifHora'] });
      toast.success('Horario de notificación actualizado');
    },
    onError: () => toast.error('Error al actualizar horario'),
  });

  const toggleAdminNotifMutation = useMutation({
    mutationFn: async (activo: boolean) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar la configuración del calendario.');
      const { error } = await supabase
        .from('maintenance_settings')
        .upsert({ key: 'admin_notif_activo', value: activo ? 'true' : 'false' });
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: 'Notificaciones de admin', detalle: { activo } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceAdminSettings'] });
      toast.success(adminNotifActivo ? 'Notificaciones desactivadas para ti' : 'Notificaciones activadas para ti');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const { data: recipients = [], isLoading: loadingRecipients } = useQuery({
    queryKey: ['maintenanceRecipients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_notification_recipients')
        .select('*').order('created_at');
      if (error) throw error;
      return data as NotificationRecipient[];
    },
  });

  // Usuarios ya registrados en Accesos, para elegirlos directo en vez de tipear a mano
  const { data: usuariosRegistrados = [] } = useQuery({
    queryKey: ['usuariosRegistradosNotif'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('user_email, nombre, colegio, territorio').order('nombre');
      if (error) throw error;
      return (data ?? []) as { user_email: string; nombre: string | null; colegio: string | null; territorio: string | null }[];
    },
  });

  // Solo los que aún NO están configurados como destinatarios de mantenimiento,
  // y si se eligió un colegio arriba, solo los usuarios ligados a ESE colegio.
  const usuariosDisponibles = useMemo(() => {
    const yaAgregados = new Set(recipients.map(r => r.email.toLowerCase()));
    let base = usuariosRegistrados.filter(u => !yaAgregados.has(u.user_email.toLowerCase()));
    if (formRecipientColegio) {
      base = base.filter(u => u.colegio === formRecipientColegio);
    }
    return base;
  }, [usuariosRegistrados, recipients, formRecipientColegio]);

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (!puedeCrear) throw new Error('No tienes permiso para crear actividades de mantenimiento.');
      const categoria = data.categoria === '__custom__' ? data.categoriaCustom : data.categoria;
      const { error } = await supabase.from('custom_maintenance').insert({
        categoria, actividad: data.actividad, tipo: data.tipo,
        frecuencia: data.frecuencia, frecuencia_dias: data.frecuenciaDias, descripcion: data.descripcion,
      });
      if (error) throw error;
      logAudit({ accion: 'crear', modulo: 'calendario', registro_ref: data.actividad, detalle: { categoria, tipo: data.tipo } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customMaintenance'] });
      toast.success('Mantenimiento agregado');
      setShowModal(false);
      setForm({ categoria: '', categoriaCustom: '', actividad: '', tipo: 'Limpiar', frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '' });
    },
    onError: () => toast.error('Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar actividades de mantenimiento.');
      const { error } = await supabase.from('custom_maintenance').delete().eq('id', id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'calendario', registro_id: id, registro_ref: 'Actividad de mantenimiento' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customMaintenance'] }); toast.success('Eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar actividades de mantenimiento.');
      const categoria = data.categoria === '__custom__' ? data.categoriaCustom : data.categoria;
      const { error } = await supabase.from('custom_maintenance').update({
        categoria, actividad: data.actividad, tipo: data.tipo,
        frecuencia: data.frecuencia, frecuencia_dias: data.frecuenciaDias, descripcion: data.descripcion,
      }).eq('id', id);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_id: id, registro_ref: data.actividad });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customMaintenance'] });
      toast.success('Mantenimiento actualizado');
      setEditingItem(null);
      setForm({ categoria: '', categoriaCustom: '', actividad: '', tipo: 'Limpiar', frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '' });
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const addRecipientMutation = useMutation({
    mutationFn: async (data: { email: string; nombre: string; actividades_ids: number[] | null; colegio: string | null }) => {
      if (!puedeCrear) throw new Error('No tienes permiso para agregar destinatarios de notificación.');
      const { error } = await supabase.from('maintenance_notification_recipients')
        .insert({ email: data.email.toLowerCase().trim(), nombre: data.nombre.trim(), activo: true, actividades_ids: data.actividades_ids, colegio: data.colegio });
      if (error) throw error;
      logAudit({ accion: 'crear', modulo: 'calendario', registro_ref: `Destinatario: ${data.nombre}`, detalle: { email: data.email, colegio: data.colegio } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] });
      toast.success('Destinatario agregado');
      setFormRecipient({ email: '', nombre: '' });
      setFormRecipientColegio('');
      setFormRecipientTodos(true);
      setFormRecipientIds([]);
      setRecipientSeleccionado('');
    },
    onError: (err: any) => {
      if (err?.message?.includes('duplicate') || err?.code === '23505') toast.error('Este correo ya esta registrado');
      else toast.error('Error al agregar');
    },
  });

  const toggleRecipientMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar destinatarios de notificación.');
      const { error } = await supabase.from('maintenance_notification_recipients').update({ activo }).eq('id', id);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_id: id, registro_ref: 'Destinatario', detalle: { activo } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] }); toast.success('Estado actualizado'); },
    onError: () => toast.error('Error al actualizar'),
  });

  const deleteRecipientMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar destinatarios de notificación.');
      const { error } = await supabase.from('maintenance_notification_recipients').delete().eq('id', id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'calendario', registro_id: id, registro_ref: 'Destinatario' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] }); toast.success('Destinatario eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  // ── Guardar override de actividad base ────────────────────────────────────
  const upsertBaseOverrideMutation = useMutation({
    mutationFn: async ({ baseId, data }: { baseId: number; data: typeof form }) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar actividades base del calendario.');
      const categoria = data.categoria === '__custom__' ? data.categoriaCustom : data.categoria;
      const { error } = await supabase.from('custom_maintenance').upsert({
        base_id: baseId,
        categoria, actividad: data.actividad, tipo: data.tipo,
        frecuencia: data.frecuencia, frecuencia_dias: data.frecuenciaDias, descripcion: data.descripcion,
      }, { onConflict: 'base_id' });
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: data.actividad, detalle: { base_id: baseId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customMaintenance'] });
      toast.success('Mantenimiento base actualizado');
      setEditingItem(null);
      setGestionSelected(null);
      setForm({ categoria: '', categoriaCustom: '', actividad: '', tipo: 'Limpiar', frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '' });
    },
    onError: () => toast.error('Error al actualizar'),
  });

  // ── Ocultar / restaurar mantenimiento precargado (base) ────────────────────
  // No se puede "eliminar" un mantenimiento base porque vive en código, así
  // que se guarda un override marcado como eliminado=true; se filtra en la
  // vista y en todo el calendario/notificaciones. Restaurar borra el override
  // por completo (regresa al original de fábrica, sin ediciones previas).
  const hideBaseMutation = useMutation({
    mutationFn: async (act: Actividad) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar actividades de mantenimiento.');
      const { error } = await supabase.from('custom_maintenance').upsert({
        base_id: Number(act.id),
        categoria: act.categoria, actividad: act.actividad, tipo: act.tipo,
        frecuencia: act.frecuencia, frecuencia_dias: act.frecuenciaDias, descripcion: act.descripcion,
        eliminado: true,
      }, { onConflict: 'base_id' });
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'calendario', registro_ref: act.actividad, detalle: { base_id: act.id, oculto: true } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customMaintenance'] });
      toast.success('Mantenimiento oculto — ya no aparecerá en el calendario');
      setGestionSelected(null);
    },
    onError: () => toast.error('Error al ocultar'),
  });

  const restoreBaseMutation = useMutation({
    mutationFn: async (customId: string) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para restaurar actividades de mantenimiento.');
      const { error } = await supabase.from('custom_maintenance').delete().eq('id', customId);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'calendario', registro_id: customId, registro_ref: 'Mantenimiento restaurado' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customMaintenance'] }); toast.success('Mantenimiento restaurado'); },
    onError: () => toast.error('Error al restaurar'),
  });

  // ── Mapear actividades custom + detectar overrides de base ────────────────
  const { actividadesBaseMerged, actividadesBaseOcultas, todasActividades } = useMemo(
    () => mergeActividadesConCustom(customRaw), [customRaw]);

  const todasCategorias = [...new Set(todasActividades.map(a => a.categoria))];

  // ── Cumplimiento: marcar/desmarcar un mantenimiento como realizado ────────
  const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const actividadRef = (act: Actividad) => act.esPersonalizada ? `custom:${act.customId}` : `base:${act.id}`;

  // Trae los cumplimientos del mes visible (alcanza para pintar los checks del
  // calendario/lista); el reporte de "Cumplimiento" pide su propio rango aparte.
  const inicioMesISO = fechaISO(new Date(año, mes, 1));
  const finMesISO    = fechaISO(new Date(año, mes + 1, 0));
  const { data: completions = [] } = useQuery({
    queryKey: ['maintenanceCompletions', año, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_completions')
        .select('*')
        .gte('fecha_programada', inicioMesISO)
        .lte('fecha_programada', finMesISO);
      if (error) throw error;
      return data as { id: string; actividad_ref: string; colegio: string; fecha_programada: string; evidencia_url: string | null }[];
    },
  });

  const completionsSet = useMemo(() => {
    const set = new Set<string>();
    completions.forEach(c => set.add(`${c.colegio}|${c.fecha_programada}|${c.actividad_ref}`));
    return set;
  }, [completions]);
  const completionsMap = useMemo(() => {
    const map = new Map<string, string>(); // key -> id (para poder desmarcar)
    completions.forEach(c => map.set(`${c.colegio}|${c.fecha_programada}|${c.actividad_ref}`, c.id));
    return map;
  }, [completions]);
  const completionsEvidenciaMap = useMemo(() => {
    const map = new Map<string, string>(); // key -> url de la evidencia, si tiene
    completions.forEach(c => { if (c.evidencia_url) map.set(`${c.colegio}|${c.fecha_programada}|${c.actividad_ref}`, c.evidencia_url); });
    return map;
  }, [completions]);

  const toggleCompletionMutation = useMutation({
    mutationFn: async ({ act, fecha, marcar, evidenciaUrl }: { act: Actividad; fecha: Date; marcar: boolean; evidenciaUrl?: string }) => {
      if (!miColegio) throw new Error('Tu usuario no tiene un colegio asignado.');
      const fechaStr = fechaISO(fecha);
      const key = `${miColegio}|${fechaStr}|${actividadRef(act)}`;
      if (marcar) {
        const { error } = await supabase.from('maintenance_completions').insert({
          actividad_ref: actividadRef(act), actividad_nombre: act.actividad, categoria: act.categoria,
          colegio: miColegio, fecha_programada: fechaStr, realizado_por: user?.email ?? null,
          evidencia_url: evidenciaUrl ?? null,
        });
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'calendario', registro_ref: `Realizado: ${act.actividad}`, detalle: { colegio: miColegio, fecha: fechaStr, evidencia: !!evidenciaUrl } });
      } else {
        const id = completionsMap.get(key);
        if (id) {
          const { error } = await supabase.from('maintenance_completions').delete().eq('id', id);
          if (error) throw error;
          logAudit({ accion: 'eliminar', modulo: 'calendario', registro_ref: `Desmarcado: ${act.actividad}`, detalle: { colegio: miColegio, fecha: fechaStr } });
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenanceCompletions'] }); },
    onError: (err: any) => toast.error(err?.message ?? 'Error al actualizar'),
  });

  const actividadesPorDia = useMemo(() => {
    const mapa: Record<number, Actividad[]> = {};
    const actsFiltradas = categoriaFiltro === 'Todas' ? todasActividades : todasActividades.filter(a => a.categoria === categoriaFiltro);
    actsFiltradas.forEach(act => {
      calcularFechasEnMes(act, año, mes).forEach(f => {
        const dia = f.getDate();
        if (!mapa[dia]) mapa[dia] = [];
        mapa[dia].push(act);
      });
    });
    return mapa;
  }, [año, mes, categoriaFiltro, todasActividades]);

  const resumen = useMemo(() => {
    let total = 0, limpiar = 0, renovar = 0, revisar = 0;
    Object.values(actividadesPorDia).forEach(acts => acts.forEach(a => {
      total++; if (a.tipo === 'Limpiar') limpiar++; else if (a.tipo === 'Renovar') renovar++; else revisar++;
    }));
    return { total, limpiar, renovar, revisar };
  }, [actividadesPorDia]);

  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const primerDiaMes = new Date(año, mes, 1).getDay();
  const actsDia = diaSeleccionado ? actividadesPorDia[diaSeleccionado] || [] : [];
  const esHoy = (d: number) => d === hoy.getDate() && mes === hoy.getMonth() && año === hoy.getFullYear();

  // Total de instancias programadas este mes (TODAS las actividades, sin importar
  // el filtro de categoría que se esté usando para navegar el calendario) — es
  // el mismo total para cada colegio, ya que el catálogo es nacional/universal.
  const totalInstanciasMes = useMemo(() => {
    let total = 0;
    todasActividades.forEach(act => { total += calcularFechasEnMes(act, año, mes).length; });
    return total;
  }, [todasActividades, año, mes]);

  // Actividades faltantes de un colegio para el mes (usado en el desglose de Cumplimiento)
  const actividadesFaltantes = (colegio: string) => {
    const faltan: { act: Actividad; fecha: Date }[] = [];
    todasActividades.forEach(act => {
      calcularFechasEnMes(act, año, mes).forEach(f => {
        const key = `${colegio}|${fechaISO(f)}|${actividadRef(act)}`;
        if (!completionsSet.has(key)) faltan.push({ act, fecha: f });
      });
    });
    return faltan.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  };
  const anteriorMes = () => { if (mes === 0) { setMes(11); setAño(a => a-1); } else setMes(m => m-1); setDiaSeleccionado(null); };
  const siguienteMes = () => { if (mes === 11) { setMes(0); setAño(a => a+1); } else setMes(m => m+1); setDiaSeleccionado(null); };
  const colorCat = (cat: string) => COLORES_CATEGORIA[cat] || '#64748b';

  // ─── Reportes de Protección Civil ────────────────────────────────────────
  const handleGenerarReporteIndividual = async () => {
    if (!pcColegio) { toast.error('Selecciona un colegio'); return; }
    setPcGenerando('individual');
    try {
      const colegioInfo = COLEGIOS.find(c => c.colegio === pcColegio);
      const inicioISO = `${pcAño}-01-01`;
      const finISO = `${pcAño}-12-31`;
      const { data, error } = await supabase
        .from('maintenance_completions')
        .select('colegio, fecha_programada, actividad_ref')
        .eq('colegio', pcColegio)
        .gte('fecha_programada', inicioISO)
        .lte('fecha_programada', finISO);
      if (error) throw error;

      const completionsSet = new Set(
        (data ?? []).map((c: any) => `${c.colegio}|${c.fecha_programada}|${c.actividad_ref}`)
      );

      await generarReporteIndividualExcel({
        colegio: pcColegio,
        colegioNombre: pcColegio,
        territorio: colegioInfo?.territorio ?? '—',
        año: pcAño,
        todasActividades,
        actividadRef,
        completionsSet,
      });
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: `Reporte PC Individual — ${pcColegio} ${pcAño}` });
      toast.success('Reporte generado ✓');
    } catch (e: any) {
      toast.error('Error al generar el reporte: ' + (e.message ?? 'desconocido'));
    } finally {
      setPcGenerando(null);
    }
  };

  const handleGenerarReporteFirma = async () => {
    if (!pcColegio) { toast.error('Selecciona un colegio'); return; }
    setPcGenerando('firma');
    try {
      const colegioInfo = COLEGIOS.find(c => c.colegio === pcColegio);
      const inicioISO = `${pcAño}-${String(pcMes + 1).padStart(2, '0')}-01`;
      const finISO = `${pcAño}-${String(pcMes + 1).padStart(2, '0')}-${new Date(pcAño, pcMes + 1, 0).getDate()}`;
      const { data, error } = await supabase
        .from('maintenance_completions')
        .select('colegio, fecha_programada, actividad_ref')
        .eq('colegio', pcColegio)
        .gte('fecha_programada', inicioISO)
        .lte('fecha_programada', finISO);
      if (error) throw error;

      const completionsSet = new Set(
        (data ?? []).map((c: any) => `${c.colegio}|${c.fecha_programada}|${c.actividad_ref}`)
      );

      const colegioDirectorio = findColegio(directorioRowsPC, pcColegio);
      await generarReporteIndividualPDFFirma({
        colegio: pcColegio,
        colegioNombre: colegioDirectorio?.nombre ?? pcColegio,
        nombreFiscal: colegioDirectorio?.nombre_oficial ?? '',
        direccionFiscal: colegioDirectorio?.dir_fiscal ?? '',
        territorio: colegioInfo?.territorio ?? '—',
        año: pcAño,
        mes: pcMes,
        todasActividades,
        actividadRef,
        completionsSet,
        directorNombre: getDirector(directorioRowsPC, pcColegio).nombre,
        administradorNombre: getAdministrador(directorioRowsPC, pcColegio).nombre,
        elaboradoPor: 'Ing. Ricardo Joanathan Reyes Medina — Coordinador de Obras y Mantenimiento',
      });
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: `Reporte PC Firma — ${pcColegio} ${new Date(pcAño, pcMes, 1).toLocaleDateString('es-MX', { month: 'long' })} ${pcAño}` });
      toast.success('PDF generado ✓');
    } catch (e: any) {
      toast.error('Error al generar el PDF: ' + (e.message ?? 'desconocido'));
    } finally {
      setPcGenerando(null);
    }
  };

  const handleGenerarReporteGeneral = async () => {
    setPcGenerando('general');
    try {
      const inicioISO = `${pcAño}-01-01`;
      const finISO = `${pcAño}-12-31`;
      const { data, error } = await supabase
        .from('maintenance_completions')
        .select('colegio, fecha_programada, actividad_ref')
        .gte('fecha_programada', inicioISO)
        .lte('fecha_programada', finISO);
      if (error) throw error;

      const completadasPorColegio = new Map<string, number>();
      (data ?? []).forEach((c: any) => {
        completadasPorColegio.set(c.colegio, (completadasPorColegio.get(c.colegio) ?? 0) + 1);
      });

      // Total programado del año (hasta hoy) es el mismo para todos los colegios,
      // ya que el catálogo es universal/nacional.
      const hoy = new Date();
      let totalProgramado = 0;
      for (let m = 0; m < 12; m++) {
        if (pcAño > hoy.getFullYear() || (pcAño === hoy.getFullYear() && m > hoy.getMonth())) break;
        todasActividades.forEach(act => {
          totalProgramado += calcularFechasEnMes(act, pcAño, m).filter(f => f <= hoy).length;
        });
      }

      const datos: CumplimientoColegioPC[] = COLEGIOS.map(c => ({
        colegio: c.colegio,
        colegioNombre: c.colegio,
        territorio: c.territorio,
        completadas: completadasPorColegio.get(c.colegio) ?? 0,
        totalProgramado,
      }));

      await generarReporteGeneralPDF({
        año: pcAño,
        datos,
        elaboradoPor: 'Ing. Ricardo Joanathan Reyes Medina — Coordinador de Obras y Mantenimiento',
      });
      logAudit({ accion: 'editar', modulo: 'calendario', registro_ref: `Reporte PC General — ${pcAño}` });
      toast.success('Reporte generado ✓');
    } catch (e: any) {
      toast.error('Error al generar el reporte: ' + (e.message ?? 'desconocido'));
    } finally {
      setPcGenerando(null);
    }
  };
  const handleFrecuencia = (freq: string) => {
    const preset = FRECUENCIAS_PRESET.find(f => f.label === freq);
    setForm(f => ({ ...f, frecuencia: freq, frecuenciaDias: preset?.dias ?? f.frecuenciaDias }));
  };
  const activeRecipients = recipients.filter(r => r.activo).length;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Calendario de Mantenimiento
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Cronograma basado en guias tecnicas de mantenimiento</p>
        </div>
      </div>

      {esAdminColegio && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-bold">Recuerda:</span> marca cada actividad como realizada en cuanto la termines — te toma menos de 1 minuto y así queda registrada tu labor de mantenimiento preventivo.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden sm:block" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setVistaActiva('calendario')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${vistaActiva === 'calendario' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            Calendario
          </button>
          <button onClick={() => setVistaActiva('lista')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${vistaActiva === 'lista' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            Lista
          </button>
          {isAdmin && (
            <button onClick={() => setVistaActiva('cumplimiento')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${vistaActiva === 'cumplimiento' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              Cumplimiento
            </button>
          )}
          <button
            onClick={() => { setShowConsulta(true); setConsultaActividadId(''); setConsultaCategoriaFiltro(''); }}
            className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Search className="w-4 h-4" /> ¿Cuándo me toca?
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setShowReportePC(true)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Protección Civil
              </button>
              <button onClick={() => setShowNotificaciones(true)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 relative">
                <Bell className="w-4 h-4" /> Notificaciones
                {activeRecipients > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {activeRecipients}
                  </span>
                )}
              </button>
              <button onClick={() => setShowGestion(true)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                Gestionar
              </button>
              {puedeCrear && (
              <button onClick={() => setShowModal(true)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Agregar
              </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: resumen.total, color: 'bg-slate-900 text-white', icon: <Wrench className="w-4 h-4" /> },
          { label: 'Limpieza', value: resumen.limpiar, color: 'bg-blue-50 text-blue-700 border border-blue-200', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Renovacion', value: resumen.renovar, color: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Revision', value: resumen.revisar, color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <Clock className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="flex items-center gap-2 mb-1 opacity-70">{s.icon}<span className="text-xs font-bold uppercase tracking-wide">{s.label}</span></div>
            <p className="text-3xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCategoriaFiltro('Todas')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${categoriaFiltro === 'Todas' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Todas
        </button>
        {todasCategorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${categoriaFiltro === cat ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            style={categoriaFiltro === cat ? { backgroundColor: colorCat(cat) } : {}}>
            {cat}
          </button>
        ))}
      </div>

      {vistaActiva === 'cumplimiento' ? null : vistaActiva === 'calendario' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <button onClick={anteriorMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">{MESES[mes]} {año}</h2>
            <button onClick={siguienteMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100">
            {DIAS_SEMANA.map(d => (<div key={d} className="py-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: primerDiaMes }).map((_, i) => (<div key={`e-${i}`} className="border-b border-r border-slate-100 h-24 bg-slate-50/50" />))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1;
              const acts = actividadesPorDia[dia] || [];
              const isHoy = esHoy(dia);
              const isSel = diaSeleccionado === dia;
              return (
                <div key={dia} onClick={() => setDiaSeleccionado(isSel ? null : dia)}
                  className={`border-b border-r border-slate-100 h-24 p-1.5 cursor-pointer transition-colors overflow-hidden ${isSel ? 'bg-slate-900' : isHoy ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className={`text-xs font-bold block mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isHoy && !isSel ? 'bg-blue-600 text-white' : isSel ? 'bg-white text-slate-900' : 'text-slate-700'}`}>{dia}</span>
                  <div className="space-y-0.5">
                    {acts.slice(0, 3).map((act, idx) => (
                      <div key={idx} className="text-[10px] font-medium px-1 py-0.5 rounded truncate"
                        style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.15)' : colorCat(act.categoria) + '22', color: isSel ? 'white' : colorCat(act.categoria) }}>
                        {act.actividad}
                      </div>
                    ))}
                    {acts.length > 3 && <div className={`text-[10px] font-bold ${isSel ? 'text-slate-300' : 'text-slate-400'}`}>+{acts.length - 3} mas</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Actividades — {MESES[mes]} {año}</h2>
            <div className="flex gap-2">
              <button onClick={anteriorMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={siguienteMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {Object.entries(actividadesPorDia).sort(([a],[b]) => Number(a)-Number(b)).map(([dia, acts]) => (
              <div key={dia} className="px-5 py-3">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">{DIAS_SEMANA[new Date(año,mes,Number(dia)).getDay()]} {dia} de {MESES[mes]}</p>
                <div className="space-y-1.5">
                  {acts.map((act, idx) => {
                    const fechaDia = new Date(año, mes, Number(dia));
                    const key = `${miColegio}|${fechaISO(fechaDia)}|${actividadRef(act)}`;
                    const realizado = completionsSet.has(key);
                    return (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{act.actividad}{act.esPersonalizada && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">CUSTOM</span>}</p>
                        <p className="text-xs text-slate-500 truncate">{act.descripcion}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 items-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colorCat(act.categoria)+'22', color: colorCat(act.categoria) }}>{act.categoria}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${act.tipo==='Limpiar'?'bg-blue-100 text-blue-700':act.tipo==='Renovar'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{act.tipo}</span>
                        {esAdminColegio && (
                          <button
                            onClick={() => realizado ? toggleCompletionMutation.mutate({ act, fecha: fechaDia, marcar: false }) : abrirModalEvidencia(act, fechaDia)}
                            disabled={toggleCompletionMutation.isPending}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                              realizado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                            }`}>
                            <CheckCircle2 className="w-3 h-3" />
                            {realizado ? 'Realizado' : 'Marcar'}
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(actividadesPorDia).length === 0 && (<div className="py-12 text-center"><p className="text-sm text-slate-400 italic">No hay actividades para este mes.</p></div>)}
          </div>
        </div>
      )}

      {vistaActiva === 'cumplimiento' && isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Cumplimiento — {MESES[mes]} {año}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{totalInstanciasMes} actividades programadas este mes por colegio</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={anteriorMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={siguienteMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {COLEGIOS
              .map(c => {
                const completados = completions.filter(comp => comp.colegio === c.colegio).length;
                const pct = totalInstanciasMes > 0 ? Math.round((completados / totalInstanciasMes) * 100) : 0;
                return { ...c, completados, pct };
              })
              .sort((a, b) => a.pct - b.pct)
              .map(c => (
                <div key={c.colegio}>
                  <button onClick={() => setColegioExpandido(e => e === c.colegio ? null : c.colegio)}
                    className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-bold text-slate-900">{c.colegio}</p>
                      <p className="text-[10px] text-slate-400">{c.territorio}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${c.pct}%`,
                            backgroundColor: c.pct >= 80 ? '#16a34a' : c.pct >= 40 ? '#f59e0b' : '#dc2626',
                          }} />
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right">
                      <span className="text-sm font-bold text-slate-900">{c.completados}/{totalInstanciasMes}</span>
                      <span className="text-xs text-slate-400 ml-1.5">({c.pct}%)</span>
                    </div>
                    {colegioExpandido === c.colegio ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>
                  {colegioExpandido === c.colegio && (() => {
                    const faltantes = actividadesFaltantes(c.colegio);
                    return (
                      <div className="px-5 pb-4 bg-slate-50">
                        {faltantes.length === 0 ? (
                          <p className="text-xs text-green-600 font-bold py-2">✓ Sin pendientes este mes.</p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto space-y-1 pt-1">
                            {faltantes.map((f, i) => {
                              const vencido = f.fecha < new Date(new Date().setHours(0,0,0,0));
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                                  <span className={`font-bold ${vencido ? 'text-red-600' : 'text-slate-500'}`}>
                                    {DIAS_SEMANA[f.fecha.getDay()]} {f.fecha.getDate()}
                                  </span>
                                  <span className="text-slate-700 flex-1 truncate">{f.act.actividad}</span>
                                  {vencido && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full shrink-0">VENCIDO</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
          </div>
        </div>
      )}

      {diaSeleccionado && actsDia.length > 0 && vistaActiva === 'calendario' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
              {DIAS_SEMANA[new Date(año,mes,diaSeleccionado).getDay()]} {diaSeleccionado} de {MESES[mes]} — {actsDia.length} actividad{actsDia.length!==1?'es':''}
            </h3>
            <button onClick={() => setDiaSeleccionado(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="divide-y divide-slate-100">
            {actsDia.map((act, idx) => (
              <div key={idx} className="px-5 py-3 flex items-start gap-3">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{act.actividad}{act.esPersonalizada && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">CUSTOM</span>}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{act.descripcion}</p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colorCat(act.categoria)+'22', color: colorCat(act.categoria) }}>{act.categoria}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${act.tipo==='Limpiar'?'bg-blue-100 text-blue-700':act.tipo==='Renovar'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{act.tipo}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Cada {act.frecuencia}</span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {act.esPersonalizada ? (
                      <>
                        {puedeEditar && (
                        <button
                          onClick={() => {
                            setEditingItem(act);
                            setForm({
                              categoria: act.categoria, categoriaCustom: '',
                              actividad: act.actividad, tipo: act.tipo,
                              frecuencia: act.frecuencia, frecuenciaDias: act.frecuenciaDias,
                              descripcion: act.descripcion,
                            });
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                          title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        )}
                        {puedeEliminar && (
                        <button
                          onClick={() => { if (confirm('¿Eliminar este mantenimiento?')) deleteMutation.mutate(String(act.id)); }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        )}
                      </>
                    ) : (
                      <span title="Actividad base — no editable" className="p-1.5 text-slate-200">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                )}
                {esAdminColegio && (() => {
                  const key = `${miColegio}|${fechaISO(new Date(año, mes, diaSeleccionado!))}|${actividadRef(act)}`;
                  const realizado = completionsSet.has(key);
                  const evidenciaUrl = completionsEvidenciaMap.get(key);
                  return (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => realizado ? toggleCompletionMutation.mutate({ act, fecha: new Date(año, mes, diaSeleccionado!), marcar: false }) : abrirModalEvidencia(act, new Date(año, mes, diaSeleccionado!))}
                        disabled={toggleCompletionMutation.isPending}
                        className={`mt-0.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          realizado ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                        }`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {realizado ? 'Realizado' : 'Marcar realizado'}
                      </button>
                      {evidenciaUrl && (
                        <a href={evidenciaUrl} target="_blank" rel="noopener noreferrer"
                          className="mt-0.5 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
                          Ver evidencia
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Reportes de Protección Civil */}
      {showReportePC && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-slate-900">Reportes de Protección Civil</h3>
              </div>
              <button onClick={() => setShowReportePC(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              <p className="text-xs text-slate-500">
                Genera el programa de mantenimiento con la evidencia de cumplimiento real registrada en el sistema, listo para entregar a la Gerencia de Protección Civil.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Año</label>
                  <input type="number" value={pcAño} onChange={e => setPcAño(parseInt(e.target.value) || new Date().getFullYear())}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio (para el individual)</label>
                  <select value={pcColegio} onChange={e => setPcColegio(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                    <option value="">Selecciona...</option>
                    {COLEGIOS.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-bold text-slate-900 mb-1">Reporte Individual — Excel</p>
                <p className="text-xs text-slate-500 mb-3">Cuadrícula día por día, agrupada por semana, de un colegio específico. Una pestaña por mes. Para uso interno.</p>
                <button onClick={handleGenerarReporteIndividual} disabled={pcGenerando !== null}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-md text-sm font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {pcGenerando === 'individual' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  {pcGenerando === 'individual' ? 'Generando...' : 'Descargar Excel Individual'}
                </button>
              </div>

              <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4">
                <p className="text-sm font-bold text-slate-900 mb-1">Reporte Mensual con Firma — PDF</p>
                <p className="text-xs text-slate-500 mb-3">Un solo mes, con partida de firmas (Director, Administrador, Responsable de Mantenimiento) al final. Para compartir con el colegio y que lo firmen.</p>
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mes</label>
                  <select value={pcMes} onChange={e => setPcMes(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>{new Date(2000, i, 1).toLocaleDateString('es-MX', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleGenerarReporteFirma} disabled={pcGenerando !== null}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {pcGenerando === 'firma' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {pcGenerando === 'firma' ? 'Generando...' : 'Descargar PDF con Firma'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-bold text-slate-900 mb-1">Reporte General — PDF</p>
                <p className="text-xs text-slate-500 mb-3">Cumplimiento de los {COLEGIOS.length} colegios, ordenado de menor a mayor avance.</p>
                <button onClick={handleGenerarReporteGeneral} disabled={pcGenerando !== null}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
                  {pcGenerando === 'general' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {pcGenerando === 'general' ? 'Generando...' : 'Descargar PDF General'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Notificaciones */}
      {showNotificaciones && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-slate-700" />
                <div>
                  <h3 className="font-bold text-slate-900">Notificaciones</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestiona quién recibe recordatorios de mantenimiento</p>
                </div>
              </div>
              <button onClick={() => setShowNotificaciones(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Toggle Admin */}
            <div className="mx-5 mt-4 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                {adminNotifActivo
                  ? <Bell className="w-4 h-4 text-emerald-600" />
                  : <BellOff className="w-4 h-4 text-slate-400" />}
                <div>
                  <p className="text-sm font-semibold text-slate-800">Mis notificaciones (admin)</p>
                  <p className="text-xs text-slate-500">
                    {adminNotifActivo ? 'Recibes correos de todos los mttos' : 'No recibes notificaciones actualmente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleAdminNotifMutation.mutate(!adminNotifActivo)}
                disabled={toggleAdminNotifMutation.isPending}
                className={`relative w-11 h-6 rounded-full transition-colors ${adminNotifActivo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${adminNotifActivo ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Selector de hora */}
            <div className="mx-5 mt-3 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Horario de envío</p>
                <p className="text-xs text-slate-500">Se enviará a esta hora todos los días</p>
              </div>
              <select
                value={notifHora}
                onChange={e => setNotifHoraMutation.mutate(Number(e.target.value))}
                disabled={setNotifHoraMutation.isPending}
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 font-semibold focus:ring-1 focus:ring-slate-400 focus:outline-none">
                {[5,6,7,8,9,10,11,12].map(h => (
                  <option key={h} value={h}>{h === 12 ? '12:00 pm' : `${h}:00 am`}</option>
                ))}
              </select>
            </div>

            {/* Info box */}
            <div className="mx-5 mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
              <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                1 día antes de cada mantenimiento, los destinatarios activos reciben un correo con el detalle y un archivo <strong>.ics</strong> para agregar el evento a su Outlook.
              </p>
            </div>

            {/* Form agregar destinatario */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Agregar destinatario</p>
                <button onClick={() => { setRecipientModoManual(m => !m); setRecipientSeleccionado(''); setFormRecipient({ email: '', nombre: '' }); }}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800">
                  {recipientModoManual ? 'Elegir de la lista' : '¿No está en la lista?'}
                </button>
              </div>

              <div className="mb-2">
                <select value={formRecipientColegio} onChange={e => setFormRecipientColegio(e.target.value)} className={inputClass}>
                  <option value="">Todos los colegios (recibe de todos)</option>
                  {COLEGIOS.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio} — {c.territorio}</option>)}
                </select>
              </div>

              {recipientModoManual ? (
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 space-y-2">
                    <input className={inputClass} placeholder="Nombre (ej: Juan Perez)" value={formRecipient.nombre}
                      onChange={e => setFormRecipient(f => ({ ...f, nombre: e.target.value }))} />
                    <input className={inputClass} type="email" placeholder="correo@ejemplo.com" value={formRecipient.email}
                      onChange={e => setFormRecipient(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <button
                    disabled={!formRecipient.email || !formRecipient.nombre || !isValidEmail(formRecipient.email) || addRecipientMutation.isPending || (!formRecipientTodos && formRecipientIds.length === 0)}
                    onClick={() => addRecipientMutation.mutate({ ...formRecipient, actividades_ids: formRecipientTodos ? null : formRecipientIds, colegio: formRecipientColegio || null })}
                    className="px-3 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1.5 self-end">
                    <UserPlus className="w-4 h-4" />
                    {addRecipientMutation.isPending ? '...' : 'Agregar'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 mb-3">
                  <select
                    value={recipientSeleccionado}
                    onChange={e => {
                      setRecipientSeleccionado(e.target.value);
                      const u = usuariosDisponibles.find(u => u.user_email === e.target.value);
                      setFormRecipient(u ? { email: u.user_email, nombre: u.nombre || u.user_email } : { email: '', nombre: '' });
                    }}
                    className={inputClass + ' flex-1'}>
                    <option value="">
                      {usuariosDisponibles.length === 0
                        ? (formRecipientColegio
                            ? `Sin usuarios registrados en ${formRecipientColegio}`
                            : 'Todos los usuarios ya reciben notificaciones')
                        : 'Selecciona un usuario...'}
                    </option>
                    {usuariosDisponibles.map(u => (
                      <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.user_email}</option>
                    ))}
                  </select>
                  <button
                    disabled={!formRecipient.email || !formRecipient.nombre || addRecipientMutation.isPending || (!formRecipientTodos && formRecipientIds.length === 0)}
                    onClick={() => addRecipientMutation.mutate({ ...formRecipient, actividades_ids: formRecipientTodos ? null : formRecipientIds, colegio: formRecipientColegio || null })}
                    className="px-3 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" />
                    {addRecipientMutation.isPending ? '...' : 'Agregar'}
                  </button>
                </div>
              )}
              {recipientModoManual && formRecipient.email && !isValidEmail(formRecipient.email) && <p className="text-xs text-red-500 mb-2">Correo no válido</p>}

              {/* Selector de actividades */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setFormRecipientTodos(t => !t)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">
                  <span className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" />
                    {formRecipientTodos
                      ? 'Recibirá: Todos los mantenimientos'
                      : `Recibirá: ${formRecipientIds.length} mantenimiento(s) seleccionado(s)`}
                  </span>
                  {formRecipientTodos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
                {!formRecipientTodos && (
                  <div className="max-h-44 overflow-y-auto">
                    <div className="px-3 py-2 flex items-center gap-2 bg-white border-b border-slate-100">
                      <input type="checkbox" id="sel-todos"
                        checked={formRecipientIds.length === todasActividades.length}
                        onChange={e => setFormRecipientIds(e.target.checked ? todasActividades.map(a => Number(a.id)) : [])}
                        className="rounded" />
                      <label htmlFor="sel-todos" className="text-xs font-bold text-slate-700 cursor-pointer">Seleccionar todos</label>
                    </div>
                    {todasActividades.map(act => (
                      <div key={act.id} className="px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 border-b border-slate-50">
                        <input type="checkbox" id={`fid-${act.id}`}
                          checked={formRecipientIds.includes(Number(act.id))}
                          onChange={e => setFormRecipientIds(ids =>
                            e.target.checked ? [...ids, Number(act.id)] : ids.filter(i => i !== Number(act.id))
                          )}
                          className="rounded shrink-0" />
                        <label htmlFor={`fid-${act.id}`} className="text-xs text-slate-700 truncate cursor-pointer">
                          <span className="font-medium">{act.actividad}</span>
                          <span className="text-slate-400 ml-1">· {act.categoria}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lista de destinatarios */}
            <div className="overflow-y-auto flex-1">
              {loadingRecipients ? (
                <div className="py-8 text-center"><p className="text-sm text-slate-400">Cargando...</p></div>
              ) : recipients.length === 0 ? (
                <div className="py-10 text-center px-5">
                  <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Sin destinatarios configurados</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recipients.map(r => (
                    <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${r.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {(r.nombre || r.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.nombre || '-'}</p>
                        <p className="text-xs text-slate-500 truncate">{r.email}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {r.actividades_ids == null ? 'Todos los mttos' : `${r.actividades_ids.length} mtto(s) seleccionado(s)`}
                          {' · '}
                          {r.colegio ? r.colegio : 'Todos los colegios'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleRecipientMutation.mutate({ id: r.id, activo: !r.activo })}
                          className={`relative w-10 h-5 rounded-full transition-colors ${r.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className={`text-[10px] font-bold ${r.activo ? 'text-emerald-600' : 'text-slate-400'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span>
                        <button onClick={() => deleteRecipientMutation.mutate(r.id)} disabled={deleteRecipientMutation.isPending}
                          className="text-red-400 hover:text-red-600 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">{activeRecipients} activo{activeRecipients !== 1 ? 's' : ''} de {recipients.length}</span>
              <span className={`text-xs font-semibold ${adminNotifActivo ? 'text-emerald-600' : 'text-slate-400'}`}>
                {adminNotifActivo ? '✓ Recibes notificaciones' : '✗ Tus notificaciones desactivadas'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar mantenimiento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Nuevo Mantenimiento</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label>
                <select className={inputClass} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  <option value="">Seleccionar categoria...</option>
                  {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">+ Nueva categoria</option>
                </select>
              </div>
              {form.categoria === '__custom__' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nueva categoria</label>
                  <input className={inputClass} placeholder="Ej: Area Exterior" value={form.categoriaCustom} onChange={e => setForm(f => ({ ...f, categoriaCustom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actividad</label>
                <input className={inputClass} placeholder="Ej: Revisar extintores" value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="Limpiar">Limpiar</option><option value="Renovar">Renovar</option><option value="Revisar">Revisar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Frecuencia</label>
                <select className={inputClass} value={form.frecuencia} onChange={e => handleFrecuencia(e.target.value)}>
                  {FRECUENCIAS_PRESET.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripcion (opcional)</label>
                <textarea className={inputClass} rows={3} placeholder="Describe la actividad..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
              <button disabled={addMutation.isPending || !form.actividad || (!form.categoria || (form.categoria === '__custom__' && !form.categoriaCustom))}
                onClick={() => addMutation.mutate(form)}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {addMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestionar personalizados */}
      {/* Modal Gestionar — todos los mantenimientos */}
      {showGestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4" /> Gestionar Mantenimientos
              </h3>
              <button onClick={() => { setShowGestion(false); setGestionSelected(null); setGestionSearch(''); }}
                className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Buscador */}
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
                  placeholder="Buscar mantenimiento..."
                  value={gestionSearch}
                  onChange={e => setGestionSearch(e.target.value)} />
              </div>
            </div>

            {/* Lista de todos los mantenimientos */}
            <div className="overflow-y-auto flex-1">
              {(() => {
                const filtrados = todasActividades.filter(a =>
                  gestionSearch === '' ||
                  a.actividad.toLowerCase().includes(gestionSearch.toLowerCase()) ||
                  a.categoria.toLowerCase().includes(gestionSearch.toLowerCase())
                );
                const grupos = filtrados.reduce((acc, act) => {
                  if (!acc[act.categoria]) acc[act.categoria] = [];
                  acc[act.categoria].push(act);
                  return acc;
                }, {} as Record<string, Actividad[]>);

                return Object.entries(grupos).map(([cat, acts]) => (
                  <div key={cat}>
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colorCat(cat) }} />
                        {cat}
                      </p>
                    </div>
                    {acts.map(act => (
                      <div key={act.id}
                        className={`px-5 py-3 flex items-start gap-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${gestionSelected?.id === act.id ? 'bg-blue-50' : ''}`}
                        onClick={() => {
                          if (gestionSelected?.id === act.id) {
                            setGestionSelected(null);
                          } else {
                            setGestionSelected(act);
                            setForm({
                              categoria: act.categoria, categoriaCustom: '',
                              actividad: act.actividad, tipo: act.tipo,
                              frecuencia: act.frecuencia, frecuenciaDias: act.frecuenciaDias,
                              descripcion: act.descripcion,
                            });
                          }
                        }}>
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            {act.actividad}
                            {act.esSobreescrita && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">EDITADO</span>
                            )}
                            {act.esPersonalizada && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">CUSTOM</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{act.tipo} · Cada {act.frecuencia}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <span className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md" title="Clic para editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (act.esPersonalizada) {
                                if (confirm('¿Eliminar este mantenimiento?')) deleteMutation.mutate(String(act.customId ?? act.id));
                              } else {
                                if (confirm(`¿Ocultar "${act.actividad}"? Dejará de aparecer en el calendario. Podrás restaurarlo después desde "Ocultos".`)) hideBaseMutation.mutate(act);
                              }
                            }}
                            disabled={deleteMutation.isPending || hideBaseMutation.isPending}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title={act.esPersonalizada ? 'Eliminar' : 'Ocultar (es un mantenimiento precargado)'}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>

            {/* Panel de edición inline */}
            {gestionSelected && (
              <div className="border-t-2 border-slate-200 bg-white">
                <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between">
                  <p className="text-sm font-bold flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5" /> Editando: {gestionSelected.actividad}
                  </p>
                  <button onClick={() => setGestionSelected(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actividad</label>
                    <input className={inputClass} value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                    <select className={inputClass} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                      <option value="Limpiar">Limpiar</option>
                      <option value="Renovar">Renovar</option>
                      <option value="Revisar">Revisar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Frecuencia</label>
                    <select className={inputClass} value={form.frecuencia} onChange={e => handleFrecuencia(e.target.value)}>
                      {FRECUENCIAS_PRESET.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label>
                    <textarea className={inputClass} rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button onClick={() => setGestionSelected(null)}
                      className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
                      Cancelar
                    </button>
                    <button
                      disabled={updateMutation.isPending || upsertBaseOverrideMutation.isPending || !form.actividad}
                      onClick={() => {
                        if (gestionSelected.esPersonalizada && !gestionSelected.esSobreescrita) {
                          updateMutation.mutate({ id: String(gestionSelected.customId ?? gestionSelected.id), data: form });
                        } else {
                          upsertBaseOverrideMutation.mutate({ baseId: Number(gestionSelected.id), data: form });
                        }
                      }}
                      className="px-4 py-1.5 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                      {(updateMutation.isPending || upsertBaseOverrideMutation.isPending) ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mantenimientos ocultos (precargados que se eliminaron) */}
            {actividadesBaseOcultas.length > 0 && (
              <div className="border-t border-slate-100">
                <button onClick={() => setShowOcultos(o => !o)}
                  className="w-full px-5 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider hover:bg-slate-100">
                  <span>Ocultos ({actividadesBaseOcultas.length})</span>
                  {showOcultos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showOcultos && (
                  <div className="max-h-40 overflow-y-auto">
                    {actividadesBaseOcultas.map(act => (
                      <div key={act.customId} className="px-5 py-2.5 flex items-center gap-3 border-b border-slate-50 opacity-60">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{act.actividad}</p>
                          <p className="text-xs text-slate-400">{act.categoria}</p>
                        </div>
                        <button
                          onClick={() => restoreBaseMutation.mutate(act.customId!)}
                          disabled={restoreBaseMutation.isPending}
                          className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-md shrink-0">
                          Restaurar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">{todasActividades.length} mantenimientos en total</span>
              <span className="text-xs text-slate-400">Haz clic en uno para editarlo</span>
            </div>
          </div>
        </div>
      )}

            {/* Modal Editar mantenimiento personalizado */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Pencil className="w-4 h-4" /> Editar Mantenimiento</h3>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label>
                <select className={inputClass} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  <option value="">Seleccionar categoria...</option>
                  {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">+ Nueva categoria</option>
                </select>
              </div>
              {form.categoria === '__custom__' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nueva categoria</label>
                  <input className={inputClass} placeholder="Ej: Area Exterior" value={form.categoriaCustom} onChange={e => setForm(f => ({ ...f, categoriaCustom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actividad</label>
                <input className={inputClass} placeholder="Ej: Revisar extintores" value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="Limpiar">Limpiar</option><option value="Renovar">Renovar</option><option value="Revisar">Revisar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Frecuencia</label>
                <select className={inputClass} value={form.frecuencia} onChange={e => handleFrecuencia(e.target.value)}>
                  {FRECUENCIAS_PRESET.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripcion (opcional)</label>
                <textarea className={inputClass} rows={3} placeholder="Describe la actividad..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
              <button
                disabled={updateMutation.isPending || !form.actividad || (!form.categoria || (form.categoria === '__custom__' && !form.categoriaCustom))}
                onClick={() => updateMutation.mutate({ id: String(editingItem.id), data: form })}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal ¿Cuándo me toca? */}
      {showConsulta && (() => {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const actFiltradas = consultaCategoriaFiltro
          ? todasActividades.filter(a => a.categoria === consultaCategoriaFiltro)
          : todasActividades;
        const actSeleccionada = todasActividades.find(a => String(a.id) === consultaActividadId) ?? null;
        const proximasFechas = actSeleccionada ? calcularProximasFechas(actSeleccionada) : [];

        const etiquetaDias = (fecha: Date) => {
          const diff = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
          if (diff === 0) return { texto: 'HOY', color: 'bg-red-100 text-red-700' };
          if (diff === 1) return { texto: 'MAÑANA', color: 'bg-orange-100 text-orange-700' };
          if (diff <= 7) return { texto: `en ${diff} días`, color: 'bg-amber-100 text-amber-700' };
          if (diff <= 30) return { texto: `en ${diff} días`, color: 'bg-blue-100 text-blue-700' };
          return { texto: `en ${diff} días`, color: 'bg-slate-100 text-slate-600' };
        };

        const DIAS_NOMBRE = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">

              {/* Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-slate-700" />
                  <div>
                    <h3 className="font-bold text-slate-900">¿Cuándo me toca?</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Consulta las próximas fechas de cualquier mantenimiento</p>
                  </div>
                </div>
                <button onClick={() => setShowConsulta(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>

              {/* Filtros */}
              <div className="px-5 pt-4 pb-3 space-y-3 border-b border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
                  <select
                    className={inputClass}
                    value={consultaCategoriaFiltro}
                    onChange={e => { setConsultaCategoriaFiltro(e.target.value); setConsultaActividadId(''); }}>
                    <option value="">Todas las categorías</option>
                    {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actividad</label>
                  <select
                    className={inputClass}
                    value={consultaActividadId}
                    onChange={e => setConsultaActividadId(e.target.value)}>
                    <option value="">Seleccionar actividad...</option>
                    {actFiltradas.map(a => (
                      <option key={a.id} value={String(a.id)}>{a.actividad}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resultados */}
              <div className="overflow-y-auto flex-1">
                {!actSeleccionada ? (
                  <div className="py-14 text-center px-6">
                    <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-400">Selecciona una actividad</p>
                    <p className="text-xs text-slate-400 mt-1">Te mostraremos las próximas fechas programadas</p>
                  </div>
                ) : (
                  <div>
                    {/* Info de la actividad */}
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorCat(actSeleccionada.categoria) }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{actSeleccionada.actividad}</p>
                        <p className="text-xs text-slate-500">{actSeleccionada.descripcion}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        Cada {actSeleccionada.frecuencia}
                      </span>
                    </div>

                    {/* Próximas fechas */}
                    <div className="px-5 pt-3 pb-1">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">Próximas fechas programadas</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {proximasFechas.map((fecha, idx) => {
                        const etiq = etiquetaDias(fecha);
                        const esPrimera = idx === 0;
                        return (
                          <div key={idx} className={`px-5 py-3 flex items-center gap-4 ${esPrimera ? 'bg-slate-50' : ''}`}>
                            {/* Número de día */}
                            <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center border-2"
                              style={esPrimera
                                ? { backgroundColor: colorCat(actSeleccionada.categoria), borderColor: colorCat(actSeleccionada.categoria) }
                                : { borderColor: colorCat(actSeleccionada.categoria) + '55' }}>
                              <span className={`text-lg font-black leading-none ${esPrimera ? 'text-white' : 'text-slate-700'}`}>
                                {fecha.getDate()}
                              </span>
                              <span className={`text-[9px] font-bold uppercase ${esPrimera ? 'text-white/80' : 'text-slate-400'}`}>
                                {MESES[fecha.getMonth()].slice(0, 3)}
                              </span>
                            </div>

                            {/* Detalle */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800">
                                {DIAS_NOMBRE[fecha.getDay()]}, {fecha.getDate()} de {MESES[fecha.getMonth()]} {fecha.getFullYear()}
                              </p>
                              {esPrimera && (
                                <p className="text-xs text-slate-500 mt-0.5">Próxima fecha</p>
                              )}
                            </div>

                            {/* Etiqueta días */}
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${etiq.color}`}>
                              {etiq.texto}
                            </span>
                          </div>
                        );
                      })}
                      {proximasFechas.length === 0 && (
                        <div className="py-8 text-center">
                          <p className="text-sm text-slate-400">No hay fechas próximas calculadas.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                {actSeleccionada && proximasFechas.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    Próxima: <strong>{DIAS_SEMANA[proximasFechas[0].getDay()]} {proximasFechas[0].getDate()} de {MESES[proximasFechas[0].getMonth()]}</strong>
                  </p>
                ) : (
                  <span />
                )}
                <button onClick={() => setShowConsulta(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ── Modal: evidencia fotográfica obligatoria al marcar realizado ── */}
      {evidenciaPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-orange-600" /> Evidencia fotográfica
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {evidenciaPendiente.act.actividad} — {DIAS_SEMANA[evidenciaPendiente.fecha.getDay()]} {evidenciaPendiente.fecha.getDate()} de {MESES[evidenciaPendiente.fecha.getMonth()]}
              </p>
            </div>

            <div className="p-5 space-y-3">
              {/* Paso 1 */}
              <div className="flex items-center gap-2">
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${evidenciaUrlSubida ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>1</span>
                <p className="text-xs font-bold text-slate-700">Subir foto de evidencia</p>
              </div>

              {evidenciaPreview ? (
                <div className="relative">
                  <img src={evidenciaPreview} alt="Evidencia" className="w-full h-48 object-cover rounded-lg border border-slate-200" />
                  {subiendoEvidencia && (
                    <div className="absolute inset-0 bg-white/80 rounded-lg flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-orange-600 animate-spin" />
                      <span className="text-xs font-bold text-orange-700">Subiendo a OneDrive...</span>
                    </div>
                  )}
                  {evidenciaUrlSubida && !subiendoEvidencia && (
                    <div className="absolute top-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Subida
                    </div>
                  )}
                  {!subiendoEvidencia && (
                    <button onClick={() => { if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview); setEvidenciaPreview(null); setEvidenciaUrlSubida(null); setEvidenciaError(null); }}
                      className="absolute top-2 right-2 bg-white/90 hover:bg-white text-slate-600 rounded-full p-1.5 shadow">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors">
                  <Plus className="w-6 h-6 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500">Tomar o elegir foto</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => handleSeleccionFoto(e.target.files?.[0])} />
                </label>
              )}

              {evidenciaError && (
                <p className="text-xs text-red-600 font-medium">{evidenciaError}</p>
              )}

              {/* Paso 2 */}
              <div className="flex items-center gap-2 pt-2">
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${evidenciaUrlSubida ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>2</span>
                <p className={`text-xs font-bold ${evidenciaUrlSubida ? 'text-slate-700' : 'text-slate-400'}`}>Marcar la actividad como realizada</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={cerrarModalEvidencia} disabled={subiendoEvidencia}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmarMarcarRealizado} disabled={!evidenciaUrlSubida || subiendoEvidencia}
                title={!evidenciaUrlSubida ? 'Primero sube la foto de evidencia' : undefined}
                className="px-4 py-2 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Marcar como realizado
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
