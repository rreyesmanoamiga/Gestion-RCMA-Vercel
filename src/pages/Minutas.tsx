import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  FileSignature, Plus, X, Download, Trash2, Pencil, Calendar, Building2,
  ClipboardList, ChevronDown, Loader2, FileText, Search, ShieldCheck, Mail, Users, Paperclip,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope, esColegioDeOficina } from '@/hooks/useScope';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { TERRITORIOS, getColegiosByTerritorio } from '@/lib/colegios';
import { useDirectorio, getGerenteFMA, getDirectorNacional } from '@/lib/directorio';

interface Minuta {
  id: string;
  created_at: string;
  tipo: 'minuta' | 'nota_tecnica';
  asunto: string;
  fecha: string;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  territorio: string | null;
  colegio: string | null;
  notas: string | null;
  archivo_nombre: string;
  onedrive_url: string | null;
  onedrive_path: string | null;
  creado_por: string | null;
  notificar_admin_colegio: boolean;
  modulo?: 'obras' | 'cumplimiento' | null;
  tema?: string | null;
}

export type ModuloMinutas = 'obras' | 'cumplimiento';

// Contacto fuera de Mano Amiga que recibe el correo (tabla contactos_notificacion)
interface ContactoExterno {
  id: string;
  nombre: string;
  correo: string;
  organizacion: string | null;
  puesto: string | null;
  modulo: string;
  va_en: 'para' | 'cc';
  marcado_default: boolean;
  activo: boolean;
  orden: number;
}

interface ColegioAdmin {
  user_email: string;
  nombre: string | null;
  colegio: string | null;
}

interface Acuerdo {
  id: string;
  minuta_id: string;
  numero: number;
  descripcion: string;
  responsable: string | null;
  fecha_compromiso: string | null;
  estado: 'pendiente' | 'en_proceso' | 'cumplido' | 'cancelado';
  fecha_cumplido: string | null;
  notas_seguimiento: string | null;
  created_at: string;
}

interface AcuerdoRow {
  // fila local del formulario (antes de guardar); id solo existe si ya existía en BD
  id?: string;
  descripcion: string;
  responsable: string;
  fecha_compromiso: string;
}

const ESTADO_CFG: Record<string, { label: string; color: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-700 bg-amber-50 border-amber-200' },
  en_proceso:  { label: 'En Proceso',  color: 'text-blue-700 bg-blue-50 border-blue-200' },
  cumplido:    { label: 'Cumplido',    color: 'text-green-700 bg-green-50 border-green-200' },
  cancelado:   { label: 'Cancelado',   color: 'text-slate-500 bg-slate-100 border-slate-200' },
};

const TIPO_CFG: Record<string, { label: string; labelCorto: string; color: string; carpeta: string }> = {
  minuta:       { label: 'Minuta de Reunión',           labelCorto: 'Minuta',       color: 'text-blue-700 bg-blue-50 border-blue-200',     carpeta: 'Minutas' },
  nota_tecnica: { label: 'Nota Técnica de Seguimiento',  labelCorto: 'Nota Técnica', color: 'text-purple-700 bg-purple-50 border-purple-200', carpeta: 'Notas Tecnicas' },
};

// Temas de Cumplimiento Normativo (la minuta se liga a colegio + tema)
export const TEMAS_CN = [
  'Dictamen estructural',
  'Dictamen eléctrico',
  'Programa Interno de Protección Civil',
  'Simulacro',
  'Visita / inspección de Protección Civil',
  'Licencias y permisos',
  'Capacitación de brigadas',
  'Otro',
] as const;

// Lo que cambia entre Minutas de Obras y Minutas de Cumplimiento Normativo
const MODULO_CFG: Record<ModuloMinutas, {
  titulo: string; carpetaBase: string; ruta: string; auditoria: 'minutas' | 'minutas_cn';
  perms: { ver: string; crear: string; editar: string; eliminar: string };
}> = {
  obras: {
    titulo: 'Minutas y Notas Técnicas', carpetaBase: '', ruta: '/minutas', auditoria: 'minutas',
    perms: { ver: 'ver_minutas', crear: 'crear_minutas', editar: 'editar_minutas', eliminar: 'eliminar_minutas' },
  },
  cumplimiento: {
    titulo: 'Minutas de Cumplimiento Normativo', carpetaBase: 'Cumplimiento Normativo/', ruta: '/cumplimiento/minutas', auditoria: 'minutas_cn',
    perms: { ver: 'ver_minutas_cn', crear: 'crear_minutas_cn', editar: 'editar_minutas_cn', eliminar: 'eliminar_minutas_cn' },
  },
};

// El PDF va adjunto al correo hasta este tamaño; si pesa más, solo se manda el link
const MAX_ADJUNTO_BYTES = 4 * 1024 * 1024;
async function pdfABase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const inputCls   = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white';
const PAGE_SIZE   = 20;
const FORM_INIT = {
  tipo: 'minuta' as 'minuta' | 'nota_tecnica',
  asunto: '', fecha: format(new Date(), 'yyyy-MM-dd'),
  proyecto_id: '', proyecto_nombre: '', territorio: '', colegio: '', notas: '',
  tema: '', temaOtro: '',
};

export default function Minutas({ modulo = 'obras' }: { modulo?: ModuloMinutas }) {
  const esCN = modulo === 'cumplimiento';
  const cfgModulo = MODULO_CFG[modulo];
  const { isAdmin, can, permsRecord } = usePermissions();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { uploadCustom, uploading } = useSharePointUpload();

  // Fuente única de verdad: Gerente/Director Nacional/CAR en vivo desde Directorio.
  const { data: directorioRows = [] } = useDirectorio();
  const gerenteFMA = useMemo(() => getGerenteFMA(directorioRows), [directorioRows]);
  const directorNacional = useMemo(() => getDirectorNacional(directorioRows), [directorioRows]);
  const carPorColegioMap = useMemo(() => {
    const map: Record<string, { email: string; nombre: string }> = {};
    directorioRows.forEach(r => {
      // form.colegio guarda el CÓDIGO corto ("MA CON"), no el nombre completo:
      // se indexa por código (y por nombre como respaldo).
      if (r.car_correo) {
        const car = { email: r.car_correo, nombre: r.car_nombre || 'CAR' };
        if (r.codigo) map[r.codigo] = car;
        if (r.nombre) map[r.nombre] = car;
      }
    });
    return map;
  }, [directorioRows]);

  const puedeCrear    = isAdmin || can(cfgModulo.perms.crear as any);
  const puedeEditar   = isAdmin || can(cfgModulo.perms.editar as any);
  const puedeEliminar = isAdmin || can(cfgModulo.perms.eliminar as any);

  // Un "administrador de colegio" es cualquier usuario no-admin al que se le asignó
  // un colegio específico en Accesos (no ECO, no vacío/general). Ese perfil solo debe ver
  // minutas (nunca notas técnicas) de SU colegio, y solo las que se marcaron para notificarle.
  const miColegio       = String((permsRecord as any)?.colegio ?? '');
  // OF. MTY / OF. CDMX / GENERAL no son un colegio: se rigen por territorio (useScope).
  const esAdminColegio  = !isAdmin && !!miColegio && miColegio !== 'ECO' && !esColegioDeOficina(miColegio);

  // Usuarios con alcance por territorio (ORSER, Coordinación, ECO) que NO son admin
  // de colegio ni tienen alcance General: ven minutas y notas técnicas, pero solo
  // de su territorio (Norte / México).
  const { esGeneral, territorio: miTerritorioAlcance } = useScope();
  const esTerritorioScoped = !isAdmin && !esAdminColegio && !esGeneral && !!miTerritorioAlcance;

  const [search, setSearch]           = useState('');
  const [filterTipo, setFilterTipo]   = useState<'all' | 'minuta' | 'nota_tecnica'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // ?vista=acuerdos (p. ej. desde NEXUS) abre directo el Seguimiento de Acuerdos
  const [searchParams] = useSearchParams();
  const [vistaActiva, setVistaActiva] = useState<'documentos' | 'acuerdos'>(
    searchParams.get('vista') === 'acuerdos' ? 'acuerdos' : 'documentos'
  );
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState<Minuta | null>(null);
  const [deleteItem, setDeleteItem]   = useState<Minuta | null>(null);
  const [sinProyecto, setSinProyecto] = useState(false);
  const [form, setForm]               = useState({ ...FORM_INIT });
  const [file, setFile]               = useState<File | null>(null);
  const [dragActive, setDragActive]   = useState(false);
  const [notifAngel, setNotifAngel]   = useState(false); // maestro: activa el envío, Angel siempre va como "Para"
  const [notifEnrique, setNotifEnrique] = useState(false);
  const [notifCAR, setNotifCAR]       = useState(false);
  // Notificación independiente al/los administrador(es) del colegio seleccionado
  const [notifAdminColegio, setNotifAdminColegio] = useState<Record<string, boolean>>({});
  // Cumplimiento: contactos externos marcados (por id) y Gerencia (va en CC)
  const [notifExternos, setNotifExternos] = useState<Record<string, boolean>>({});
  const [notifGerenciaCN, setNotifGerenciaCN] = useState(true);
  const [showContactos, setShowContactos] = useState(false);
  // En edición: permite otorgar/quitar visibilidad al administrador sin reenviar correo
  const [visibleAdminColegio, setVisibleAdminColegio] = useState(false);
  // Filas de "Acuerdos y Compromisos" capturadas en el formulario (solo para tipo = 'minuta')
  const [acuerdosForm, setAcuerdosForm] = useState<AcuerdoRow[]>([]);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: minutas = [], isLoading } = useQuery({
    queryKey: ['minutas', modulo, esAdminColegio, miColegio, esTerritorioScoped, miTerritorioAlcance],
    queryFn: async () => {
      let query = supabase.from('minutas').select('*').eq('modulo', modulo).order('fecha', { ascending: false });
      if (esAdminColegio) {
        // Solo minutas (nunca notas técnicas) de su colegio, y solo las marcadas para notificarle.
        // La política RLS en Supabase aplica esta misma regla como respaldo de seguridad.
        query = query
          .eq('tipo', 'minuta')
          .eq('colegio', miColegio)
          .eq('notificar_admin_colegio', true);
      } else if (esTerritorioScoped) {
        // ORSER / Coordinación con alcance de territorio (no General): ve minutas y
        // notas técnicas, pero solo de su territorio.
        query = query.eq('territorio', miTerritorioAlcance);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Minuta[];
    },
  });

  // Usuarios ligados (en Accesos) al colegio seleccionado en el formulario —
  // son los candidatos a "administrador exclusivo" a notificar.
  const { data: colegioAdmins = [] } = useQuery({
    queryKey: ['colegioAdmins', modulo, form.colegio],
    queryFn: async () => {
      // Obras: quien ve Minutas. Cumplimiento: también quien ya ve Minutas de Obras
      // (administradores y auxiliares del colegio); el correo lleva el PDF adjunto.
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('colegio', form.colegio);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter(r => r.ver_minutas === true || (esCN && r.ver_minutas_cn === true))
        .map(r => ({ user_email: r.user_email, nombre: r.nombre ?? null, colegio: r.colegio ?? null })) as ColegioAdmin[];
    },
    enabled: !editItem && puedeCrear && !!form.colegio && form.colegio !== 'ECO',
  });

  // Contactos externos (solo Cumplimiento): personas fuera de Mano Amiga que reciben el correo
  const { data: contactosExternos = [] } = useQuery({
    queryKey: ['contactos_notificacion', 'minutas_cn'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contactos_notificacion')
        .select('*').eq('modulo', 'minutas_cn').order('orden').order('nombre');
      if (error) throw error;
      return (data ?? []) as ContactoExterno[];
    },
    enabled: esCN && (puedeCrear || isAdmin),
  });
  const externosActivos = useMemo(() => contactosExternos.filter(c => c.activo), [contactosExternos]);
  const externosDefault = () =>
    Object.fromEntries(externosActivos.map(c => [c.id, c.marcado_default])) as Record<string, boolean>;

  // Mismos proyectos activos que ya usa NEXUS — comparten caché (misma queryKey)
  const { data: rawProyectos = [] } = useQuery({
    queryKey: ['proyectos_nexus'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, territorio, colegio, status')
        .in('status', ['en_proceso', 'pausado', 'en_espera']).order('name');
      return data ?? [];
    },
    enabled: !esCN,
  });

  const colegiosDisponibles = useMemo(() => getColegiosByTerritorio(form.territorio), [form.territorio]);

  const filtered = useMemo(() => minutas.filter(m =>
    (filterTipo === 'all' || m.tipo === filterTipo) &&
    (!search ||
      m.asunto?.toLowerCase().includes(search.toLowerCase()) ||
      m.proyecto_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      m.tema?.toLowerCase().includes(search.toLowerCase()) ||
      m.colegio?.toLowerCase().includes(search.toLowerCase()))
  ), [minutas, search, filterTipo]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  // Acuerdos ya guardados de la minuta que se está editando (para precargar el formulario)
  const { data: acuerdosDeEditItem = [] } = useQuery({
    queryKey: ['minuta_acuerdos', editItem?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('minuta_acuerdos')
        .select('*').eq('minuta_id', editItem!.id).order('numero', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Acuerdo[];
    },
    enabled: !!editItem?.id,
  });

  useEffect(() => {
    if (editItem && acuerdosDeEditItem.length > 0) {
      setAcuerdosForm(acuerdosDeEditItem.map(a => ({
        id: a.id, descripcion: a.descripcion, responsable: a.responsable ?? '',
        fecha_compromiso: a.fecha_compromiso ?? '',
      })));
    }
  }, [editItem, acuerdosDeEditItem]);

  // Todos los acuerdos (para la pestaña "Seguimiento de Acuerdos"), con datos de su minuta origen
  const { data: acuerdosTodos = [], isLoading: cargandoAcuerdos } = useQuery({
    queryKey: ['acuerdos_seguimiento', modulo, esAdminColegio, miColegio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('minuta_acuerdos')
        .select('*, minuta:minuta_id!inner(id, asunto, fecha, territorio, colegio, tipo, onedrive_url, modulo)')
        .eq('minuta.modulo', modulo)
        .order('fecha_compromiso', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as (Acuerdo & { minuta: { id: string; asunto: string; fecha: string; territorio: string | null; colegio: string | null; tipo: string; onedrive_url: string | null } | null })[];
    },
    enabled: isAdmin && vistaActiva === 'acuerdos',
  });

  const resetForm = () => {
    setForm({ ...FORM_INIT });
    setFile(null);
    setSinProyecto(false);
    setEditItem(null);
    setNotifAngel(false);
    setNotifEnrique(false);
    setNotifCAR(false);
    setNotifAdminColegio({});
    setNotifExternos(externosDefault());
    setNotifGerenciaCN(true);
    setVisibleAdminColegio(false);
    setAcuerdosForm([]);
  };

  // Al llegar la lista de contactos externos, se marcan los que van por defecto
  useEffect(() => {
    if (esCN && !editItem) setNotifExternos(prev => Object.keys(prev).length ? prev : externosDefault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCN, externosActivos]);

  const openEdit = (m: Minuta) => {
    setEditItem(m);
    setSinProyecto(!!(m.proyecto_nombre && !m.proyecto_id));
    setForm({
      tipo: m.tipo ?? 'minuta',
      asunto: m.asunto, fecha: m.fecha,
      proyecto_id: m.proyecto_id ?? '', proyecto_nombre: m.proyecto_nombre ?? '',
      territorio: m.territorio ?? '', colegio: m.colegio ?? '', notas: m.notas ?? '',
      ...temaAForm(m.tema),
    });
    setVisibleAdminColegio(!!m.notificar_admin_colegio);
    setAcuerdosForm([]); // se precargan vía el useEffect cuando llegue la consulta
    setFile(null);
    setShowForm(true);
  };

  // Tema guardado → selector + texto libre ("Otro")
  function temaAForm(tema?: string | null) {
    if (!tema) return { tema: '', temaOtro: '' };
    return (TEMAS_CN as readonly string[]).includes(tema) && tema !== 'Otro'
      ? { tema, temaOtro: '' } : { tema: 'Otro', temaOtro: tema === 'Otro' ? '' : tema };
  }
  const temaFinal = form.tema === 'Otro' ? form.temaOtro.trim() : form.tema;

  // ── Destinatarios del correo (lo que se ve en el formulario y lo que se manda) ──
  const destinatarios = useMemo(() => {
    const adminEmails = colegioAdmins.filter(a => notifAdminColegio[a.user_email]).map(a => a.user_email);
    const yo = 'rreyes@manoamiga.edu.mx';
    let para: string | null = null;
    let cc: string[] = [];
    if (esCN) {
      // Para: contacto(s) externo(s) marcados como "Para" (David). CC: Gerencia y los demás.
      const ext = externosActivos.filter(c => notifExternos[c.id]);
      const extPara = ext.filter(c => c.va_en === 'para').map(c => c.correo);
      const extCC = ext.filter(c => c.va_en === 'cc').map(c => c.correo);
      const resto: string[] = [];
      if (notifGerenciaCN) resto.push(gerenteFMA.correo || 'arodriguez@manoamiga.edu.mx');
      if (notifEnrique && directorNacional.correo) resto.push(directorNacional.correo);
      if (notifCAR && form.colegio && carPorColegioMap[form.colegio]) resto.push(carPorColegioMap[form.colegio].email);
      const todos = [...extPara, ...extCC, ...resto, ...adminEmails];
      if (todos.length) { para = todos[0]; cc = [...todos.slice(1), yo]; }
    } else if (notifAngel) {
      // Un solo correo: Para Angel, con Enrique / CAR / administrador(es) de colegio en CC
      cc = [yo];
      if (notifEnrique && directorNacional.correo) cc.push(directorNacional.correo);
      if (notifCAR && form.colegio && carPorColegioMap[form.colegio]) cc.push(carPorColegioMap[form.colegio].email);
      cc.push(...adminEmails);
      para = gerenteFMA.correo || 'arodriguez@manoamiga.edu.mx';
    } else if (adminEmails.length > 0) {
      // Angel no fue notificado esta vez: el administrador del colegio va como
      // destinatario principal (el primero) y el resto, si hay más de uno, en CC.
      para = adminEmails[0];
      cc = [yo, ...adminEmails.slice(1)];
    }
    const vistos = new Set<string>(para ? [para.toLowerCase()] : []);
    cc = cc.filter(c => { const k = c.toLowerCase(); if (!c || vistos.has(k)) return false; vistos.add(k); return true; });
    return { para, cc, adminEmails, hayExterno: esCN && externosActivos.some(c => notifExternos[c.id]) };
  }, [esCN, externosActivos, notifExternos, notifGerenciaCN, notifAngel, notifEnrique, notifCAR, notifAdminColegio,
      colegioAdmins, form.colegio, gerenteFMA, directorNacional, carPorColegioMap]);

  const agregarFilaAcuerdo = () => setAcuerdosForm(prev => [...prev, { descripcion: '', responsable: '', fecha_compromiso: '' }]);
  const quitarFilaAcuerdo  = (idx: number) => setAcuerdosForm(prev => prev.filter((_, i) => i !== idx));
  const actualizarFilaAcuerdo = (idx: number, campo: keyof AcuerdoRow, valor: string) =>
    setAcuerdosForm(prev => prev.map((row, i) => i === idx ? { ...row, [campo]: valor } : row));

  // ── Guardar (crear o editar) ───────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editItem) {
        if (!puedeEditar) throw new Error('No tienes permiso para editar minutas.');
      } else {
        if (!puedeCrear) throw new Error('No tienes permiso para subir minutas.');
        if (!file) throw new Error('Selecciona el archivo PDF del documento.');
      }
      if (!form.asunto.trim()) throw new Error('Escribe el asunto de la reunión.');
      if (esCN) {
        if (!form.colegio) throw new Error('Selecciona el colegio.');
        if (!temaFinal) throw new Error('Selecciona el tema de Cumplimiento.');
      }

      let archivo_nombre = editItem?.archivo_nombre ?? '';
      let onedrive_url   = editItem?.onedrive_url ?? null;
      let onedrive_path  = editItem?.onedrive_path ?? null;

      if (file) {
        const anio    = new Date(form.fecha).getFullYear();
        const temaCarpeta = form.asunto.trim().replace(/[/\\:*?"<>|]/g, '_').slice(0, 60);
        const carpetaRaiz = cfgModulo.carpetaBase + (TIPO_CFG[form.tipo]?.carpeta ?? 'Minutas');
        const carpeta = `${carpetaRaiz}/${anio}/${form.territorio || 'GENERAL'}/${form.colegio || 'GENERAL'}/${temaCarpeta}`;
        const fecha   = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
        const nombre  = `${fecha}_${file.name}`;
        const webUrl  = await uploadCustom(file, carpeta, nombre);
        if (!webUrl) throw new Error('No se pudo subir el archivo a OneDrive.');
        archivo_nombre = nombre;
        onedrive_url   = webUrl;
        onedrive_path  = carpeta;
      }

      const payload = {
        tipo:            form.tipo,
        asunto:          form.asunto.trim(),
        fecha:           form.fecha,
        modulo,
        tema:            esCN ? temaFinal : null,
        proyecto_id:     esCN || sinProyecto ? null : (form.proyecto_id || null),
        proyecto_nombre: esCN ? null : (form.proyecto_nombre || null),
        territorio:      form.territorio || null,
        colegio:         form.colegio || null,
        notas:           form.notas || null,
        archivo_nombre,
        onedrive_url,
        onedrive_path,
        creado_por:      user?.email ?? null,
      };

      // Filas de acuerdos con descripción no vacía (numeradas en el orden capturado)
      const acuerdosValidos = acuerdosForm
        .map(a => ({ ...a, descripcion: a.descripcion.trim() }))
        .filter(a => a.descripcion)
        .map((a, i) => ({ ...a, numero: i + 1 }));

      const sincronizarAcuerdos = async (minutaId: string) => {
        const idsActuales = new Set(acuerdosValidos.filter(a => a.id).map(a => a.id));
        const idsPrevios  = new Set(acuerdosDeEditItem.map(a => a.id));

        // Elimina solo los que quitaste del formulario
        const idsABorrar = [...idsPrevios].filter(id => !idsActuales.has(id));
        if (idsABorrar.length > 0) {
          const { error } = await supabase.from('minuta_acuerdos').delete().in('id', idsABorrar);
          if (error) throw error;
        }

        for (const a of acuerdosValidos) {
          if (a.id) {
            // Solo se actualizan los campos del formulario; el estado, la fecha de
            // cumplido y las notas de seguimiento que ya tenía quedan intactos
            // (esos se editan desde la pestaña "Seguimiento de Acuerdos").
            const { error } = await supabase.from('minuta_acuerdos').update({
              numero: a.numero, descripcion: a.descripcion,
              responsable: a.responsable || null, fecha_compromiso: a.fecha_compromiso || null,
              updated_at: new Date().toISOString(),
            }).eq('id', a.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('minuta_acuerdos').insert({
              minuta_id: minutaId, numero: a.numero, descripcion: a.descripcion,
              responsable: a.responsable || null, fecha_compromiso: a.fecha_compromiso || null,
              creado_por: user?.email ?? null,
            });
            if (error) throw error;
          }
        }
      };

      if (editItem) {
        const { error } = await supabase.from('minutas')
          .update({ ...payload, notificar_admin_colegio: visibleAdminColegio })
          .eq('id', editItem.id);
        if (error) throw error;
        await sincronizarAcuerdos(editItem.id);
        logAudit({ accion: 'editar', modulo: cfgModulo.auditoria, registro_id: editItem.id, registro_ref: form.asunto });
      } else {
        const adminsSeleccionados = colegioAdmins.filter(a => notifAdminColegio[a.user_email]);
        const { data, error } = await supabase.from('minutas')
          .insert({ ...payload, notificar_admin_colegio: adminsSeleccionados.length > 0 })
          .select('id').single();
        if (error) throw error;
        if (data?.id) await sincronizarAcuerdos(data.id);
        logAudit({
          accion: 'crear', modulo: cfgModulo.auditoria, registro_id: data?.id ?? null, registro_ref: form.asunto,
          detalle: destinatarios.para ? { para: destinatarios.para, cc: destinatarios.cc } : undefined,
        });

        if (destinatarios.para) {
          // El PDF va adjunto (para quien no tiene acceso al sistema o a OneDrive); si pesa mucho, solo el link
          let adjunto: { nombre: string; base64: string } | null = null;
          if (file && file.size <= MAX_ADJUNTO_BYTES) {
            try { adjunto = { nombre: file.name, base64: await pdfABase64(file) }; } catch { adjunto = null; }
          }
          try {
            const { error: notifError } = await supabase.functions.invoke('notify-minuta-subida', {
              body: {
                para: destinatarios.para, cc: destinatarios.cc,
                modulo, tema: esCN ? temaFinal : null,
                tipo_label: TIPO_CFG[form.tipo]?.label ?? 'Minuta de Reunión',
                asunto: form.asunto, fecha: form.fecha,
                proyecto_nombre: esCN ? null : (form.proyecto_nombre || null),
                territorio: form.territorio || null, colegio: form.colegio || null,
                subido_por: user?.email ?? null,
                onedrive_url, siteUrl: window.location.origin, ruta: cfgModulo.ruta,
                adjunto,
              },
            });
            if (notifError) {
              console.error('Error al enviar notificación de minuta:', notifError);
              toast.warning('El documento se guardó, pero una notificación por correo no pudo enviarse.');
            } else if (file && !adjunto) {
              toast.info('El PDF pesa más de 4 MB: el correo se envió solo con el link de OneDrive.');
            }
          } catch (e) {
            console.error('Error al enviar notificación de minuta:', e);
            toast.warning('El documento se guardó, pero una notificación por correo no pudo enviarse.');
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minutas'] });
      qc.invalidateQueries({ queryKey: ['acuerdos_seguimiento'] });
      qc.invalidateQueries({ queryKey: ['minuta_acuerdos'] });
      toast.success(editItem ? 'Documento actualizado' : 'Documento guardado correctamente');
      setShowForm(false);
      resetForm();
    },
  });

  // ── Eliminar ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (m: Minuta) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar minutas.');
      const { error } = await supabase.from('minutas').delete().eq('id', m.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: cfgModulo.auditoria, registro_id: m.id, registro_ref: m.asunto });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minutas'] });
      toast.success('Documento eliminado');
      setDeleteItem(null);
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          esAdminColegio ? `${esCN ? 'Minutas de Cumplimiento' : 'Minutas'} — ${miColegio}` :
          esTerritorioScoped ? `${cfgModulo.titulo} — ${miTerritorioAlcance}` :
          cfgModulo.titulo
        }
        subtitle={esAdminColegio
          ? 'Minutas de reunión de tu colegio compartidas contigo'
          : esCN
          ? 'Minutas y notas técnicas de Protección Civil y Cumplimiento Normativo, por colegio y tema'
          : 'Repositorio de minutas de reunión y notas técnicas de seguimiento'}
      />

      {/* Pestañas: Documentos / Seguimiento de Acuerdos — la segunda solo la ve el admin */}
      {isAdmin && (
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'documentos', label: 'Documentos' },
            { key: 'acuerdos',   label: 'Seguimiento de Acuerdos' },
          ].map(t => (
            <button key={t.key} onClick={() => setVistaActiva(t.key as any)}
              className={`shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                vistaActiva === t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(vistaActiva === 'documentos' || !isAdmin) && <>
      {/* Filtro por tipo — un administrador de colegio nunca ve Notas Técnicas */}
      {!esAdminColegio && (
        <div className="flex gap-2">
          {[
            { key: 'all',          label: 'Todos' },
            { key: 'minuta',       label: 'Minutas de Reunión' },
            { key: 'nota_tecnica', label: 'Notas Técnicas' },
          ].map(t => (
            <button key={t.key} onClick={() => { setFilterTipo(t.key as any); setVisibleCount(PAGE_SIZE); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filterTipo === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder={esCN ? 'Buscar por asunto, tema o colegio...' : 'Buscar por asunto, proyecto o colegio...'}
            value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</span>
        {esCN && isAdmin && (
          <button onClick={() => setShowContactos(true)}
            className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
            title="Personas fuera de Mano Amiga que reciben el correo de las minutas">
            <Users className="w-4 h-4" /> Contactos externos
          </button>
        )}
        {puedeCrear && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className={`${esCN && isAdmin ? '' : 'ml-auto '}flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors`}>
            <Plus className="w-4 h-4" /> Nuevo Documento
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando minutas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <FileSignature className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No hay documentos registrados.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {visible.map(m => {
            const tipoCfg = TIPO_CFG[m.tipo] ?? TIPO_CFG.minuta;
            return (
            <div key={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${m.tipo === 'nota_tecnica' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                <FileText className={`w-4 h-4 ${m.tipo === 'nota_tecnica' ? 'text-purple-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm text-slate-900 truncate">{m.asunto}</p>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tipoCfg.color}`}>{tipoCfg.labelCorto}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(m.fecha + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                  {m.tema && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3" />{m.tema}
                    </span>
                  )}
                  {m.proyecto_nombre && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      <ClipboardList className="w-3 h-3" />{m.proyecto_nombre}
                    </span>
                  )}
                  {m.colegio && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Building2 className="w-3 h-3" />{m.colegio}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {m.onedrive_url && (
                  <a href={m.onedrive_url} target="_blank" rel="noreferrer"
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Descargar / Ver">
                    <Download className="w-4 h-4" />
                  </a>
                )}
                {puedeEditar && (
                  <button onClick={() => openEdit(m)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {puedeEliminar && (
                  <button onClick={() => setDeleteItem(m)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
            <ChevronDown className="w-4 h-4" />
            Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
          </button>
          <p className="text-xs text-slate-400">Mostrando {visible.length} de {filtered.length} minutas</p>
        </div>
      )}
      </>}

      {isAdmin && vistaActiva === 'acuerdos' && (
        <SeguimientoAcuerdos
          acuerdos={acuerdosTodos}
          isLoading={cargandoAcuerdos}
          puedeEditar={puedeEditar}
          qc={qc}
        />
      )}

      {/* ── Modal: Nueva / Editar Minuta ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">{editItem ? `Editar ${TIPO_CFG[form.tipo]?.label ?? 'Documento'}` : 'Nuevo Documento'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Documento *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['minuta', 'nota_tecnica'] as const).map(t => (
                    <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${form.tipo === t ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200'}`}>
                      <input type="radio" checked={form.tipo === t} onChange={() => setForm(f => ({ ...f, tipo: t }))} className="shrink-0" />
                      {TIPO_CFG[t].label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {form.tipo === 'nota_tecnica' ? 'Tema de la Nota Técnica *' : 'Asunto / Tema de la Reunión *'}
                </label>
                <input className={inputCls} placeholder={esCN ? 'Ej. Revisión del Programa Interno de PC MA MTY' : 'Ej. Seguimiento Barda Perimetral MA TIJ'}
                  value={form.asunto} onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de la Reunión *</label>
                <input type="date" className={inputCls} value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>

              {/* Cumplimiento: la minuta se liga a colegio + tema (no a un proyecto de Obras) */}
              {esCN && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-emerald-700 uppercase">Tema de Cumplimiento *</p>
                  <select className={inputCls} value={form.tema}
                    onChange={e => setForm(f => ({ ...f, tema: e.target.value, temaOtro: e.target.value === 'Otro' ? f.temaOtro : '' }))}>
                    <option value="">Selecciona el tema...</option>
                    {TEMAS_CN.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {form.tema === 'Otro' && (
                    <input className={inputCls} placeholder="Escribe el tema..."
                      value={form.temaOtro} onChange={e => setForm(f => ({ ...f, temaOtro: e.target.value }))} />
                  )}
                </div>
              )}

              {/* Vinculación con Proyecto — mismo patrón que NEXUS */}
              {!esCN && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-blue-700 uppercase">Vinculación con Proyecto</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${!sinProyecto ? 'border-slate-900 bg-white font-semibold' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" checked={!sinProyecto}
                      onChange={() => { setSinProyecto(false); setForm(f => ({ ...f, proyecto_nombre: '' })); }}
                      className="shrink-0" /> Proyecto registrado
                  </label>
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${sinProyecto ? 'border-slate-900 bg-white font-semibold' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" checked={sinProyecto}
                      onChange={() => { setSinProyecto(true); setForm(f => ({ ...f, proyecto_id: '', proyecto_nombre: '' })); }}
                      className="shrink-0" /> Sin proyecto registrado
                  </label>
                </div>
                {!sinProyecto ? (
                  <select className={inputCls} value={form.proyecto_id} onChange={e => {
                    const p = (rawProyectos as any[]).find(p => p.id === e.target.value);
                    setForm(f => ({ ...f, proyecto_id: e.target.value, proyecto_nombre: p?.name ?? '', territorio: p?.territorio ?? f.territorio, colegio: p?.colegio ?? f.colegio }));
                  }}>
                    <option value="">Selecciona un proyecto...</option>
                    {(rawProyectos as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name} — {p.colegio}</option>)}
                  </select>
                ) : (
                  <input className={inputCls} placeholder="Nombre del tema / proyecto a organizar..."
                    value={form.proyecto_nombre} onChange={e => setForm(f => ({ ...f, proyecto_nombre: e.target.value }))} />
                )}
              </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Territorio</label>
                  <select className={inputCls} value={form.territorio}
                    onChange={e => setForm(f => ({ ...f, territorio: e.target.value, colegio: '' }))}>
                    <option value="">{esCN ? 'Selecciona...' : 'Selecciona... (opcional)'}</option>
                    {TERRITORIOS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio{esCN ? ' *' : ''}</label>
                  <select className={inputCls} value={form.colegio}
                    onChange={e => setForm(f => ({ ...f, colegio: e.target.value }))}>
                    <option value="">{esCN ? (form.territorio ? 'Selecciona...' : 'Primero el territorio') : 'Selecciona... (opcional)'}</option>
                    {colegiosDisponibles.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
                <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Observaciones adicionales..."
                  value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>

              {(form.tipo === 'minuta' || form.tipo === 'nota_tecnica') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">
                      {form.tipo === 'nota_tecnica' ? 'Acciones Recomendadas / Siguientes Pasos' : 'Acuerdos y Compromisos'}
                    </label>
                    <button type="button" onClick={agregarFilaAcuerdo}
                      className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800">
                      <Plus className="w-3 h-3" /> {form.tipo === 'nota_tecnica' ? 'Agregar acción' : 'Agregar acuerdo'}
                    </button>
                  </div>
                  {acuerdosForm.length === 0 ? (
                    <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-3 text-center">
                      {form.tipo === 'nota_tecnica'
                        ? 'Sin acciones capturadas. Agrégalas para poder darles seguimiento después sin abrir esta nota.'
                        : 'Sin acuerdos capturados. Agrégalos para poder darles seguimiento después sin abrir esta minuta.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {acuerdosForm.map((row, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
                          <span className="text-[11px] font-bold text-slate-400 mt-2 w-4 shrink-0">{idx + 1}.</span>
                          <div className="flex-1 space-y-1.5">
                            <input value={row.descripcion} onChange={e => actualizarFilaAcuerdo(idx, 'descripcion', e.target.value)}
                              placeholder={form.tipo === 'nota_tecnica' ? '¿Qué acción se recomienda?' : '¿Qué se acordó?'}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              <input value={row.responsable} onChange={e => actualizarFilaAcuerdo(idx, 'responsable', e.target.value)}
                                placeholder="Responsable"
                                className="px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              <input type="date" value={row.fecha_compromiso} onChange={e => actualizarFilaAcuerdo(idx, 'fecha_compromiso', e.target.value)}
                                className="px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <button type="button" onClick={() => quitarFilaAcuerdo(idx)}
                            className="p-1.5 text-slate-300 hover:text-red-600 shrink-0" title="Quitar">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cumplimiento: Para el contacto externo (ORS) y en CC Gerencia y los demás */}
              {!editItem && esCN && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Notificar por correo</p>
                  {externosActivos.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No hay contactos externos activos{isAdmin ? ' (dalos de alta en "Contactos externos")' : ''}.</p>
                  ) : externosActivos.map(c => (
                    <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!notifExternos[c.id]}
                        onChange={e => setNotifExternos(prev => ({ ...prev, [c.id]: e.target.checked }))} className="w-4 h-4 rounded mt-0.5" />
                      <span>
                        <span className="font-semibold text-slate-800">{c.nombre}</span>
                        <span className="text-slate-500">{[c.organizacion, c.puesto].filter(Boolean).length ? ` — ${[c.organizacion, c.puesto].filter(Boolean).join(' · ')}` : ''}</span>
                        <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 align-middle">Externo</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={notifGerenciaCN} onChange={e => setNotifGerenciaCN(e.target.checked)} className="w-4 h-4 rounded" />
                    {gerenteFMA.nombre || 'Angel Rodríguez'} (Gerente)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={notifEnrique} onChange={e => setNotifEnrique(e.target.checked)} className="w-4 h-4 rounded" />
                    {directorNacional.nombre || 'Director Nacional'} (Director Nacional)
                  </label>
                  <label className={`flex items-center gap-2 text-sm ${form.colegio && carPorColegioMap[form.colegio] ? 'cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                    <input type="checkbox" checked={notifCAR} disabled={!form.colegio || !carPorColegioMap[form.colegio]}
                      onChange={e => setNotifCAR(e.target.checked)} className="w-4 h-4 rounded" />
                    {form.colegio && carPorColegioMap[form.colegio] ? carPorColegioMap[form.colegio].nombre + ' (CAR)' : 'CAR del Colegio (selecciona colegio primero)'}
                  </label>
                  {destinatarios.para ? (
                    <div className="mt-1 rounded-md bg-white border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 space-y-0.5">
                      <p><b>Para:</b> {destinatarios.para}</p>
                      <p><b>CC:</b> {destinatarios.cc.join(', ')}</p>
                      <p className="flex items-center gap-1 text-slate-500"><Paperclip className="w-3 h-3" /> El PDF de la minuta va adjunto al correo.</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">Sin destinatarios marcados: la minuta se guarda sin enviar correo.</p>
                  )}
                </div>
              )}

              {!editItem && !esCN && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={notifAngel} onChange={e => setNotifAngel(e.target.checked)} className="w-4 h-4 rounded" />
                    Notificar a Angel Rodríguez (Gerente)
                  </label>
                  {notifAngel && (
                    <div className="pl-6 space-y-2 border-l-2 border-slate-200 ml-1">
                      <p className="text-[11px] text-slate-400">Con copia a ti automáticamente, y opcionalmente a:</p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={notifEnrique} onChange={e => setNotifEnrique(e.target.checked)} className="w-4 h-4 rounded" />
                        {directorNacional.nombre || 'Director Nacional'}
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${form.colegio && carPorColegioMap[form.colegio] ? 'cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                        <input type="checkbox" checked={notifCAR} disabled={!form.colegio || !carPorColegioMap[form.colegio]}
                          onChange={e => setNotifCAR(e.target.checked)} className="w-4 h-4 rounded" />
                        {form.colegio && carPorColegioMap[form.colegio] ? carPorColegioMap[form.colegio].nombre + ' (CAR)' : 'CAR del Colegio (selecciona colegio primero)'}
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Notificación independiente al administrador exclusivo del colegio seleccionado.
                  Marcar esta casilla es lo único que hace visible esta minuta para ese administrador
                  dentro del sistema — sin marcarla, no la verá aunque sea de su colegio. */}
              {!editItem && form.colegio && form.colegio !== 'ECO' && colegioAdmins.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-700 uppercase">{esCN ? 'Administradores y auxiliares' : 'Administrador'} de {form.colegio}</p>
                  {colegioAdmins.map(admin => (
                    <label key={admin.user_email} className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                      <input type="checkbox"
                        checked={!!notifAdminColegio[admin.user_email]}
                        onChange={e => setNotifAdminColegio(prev => ({ ...prev, [admin.user_email]: e.target.checked }))}
                        className="w-4 h-4 rounded" />
                      {esCN
                        ? <>Enviar esta minuta a {admin.nombre || admin.user_email} <span className="text-slate-500 font-normal">(con copia, PDF adjunto)</span></>
                        : <>¿Enviar y hacer visible esta minuta a {admin.nombre || admin.user_email}?</>}
                    </label>
                  ))}
                </div>
              )}

              {/* En edición: permite otorgar o quitar visibilidad al administrador de colegio
                  sin volver a enviar correo (por ejemplo si te equivocaste al subir). */}
              {editItem && form.colegio && form.colegio !== 'ECO' && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <input type="checkbox" checked={visibleAdminColegio}
                    onChange={e => setVisibleAdminColegio(e.target.checked)} className="w-4 h-4 rounded" />
                  Visible para el administrador de {form.colegio} (no reenvía correo)
                </label>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {editItem ? 'Reemplazar archivo PDF (opcional)' : 'Archivo PDF de la Minuta *'}
                </label>
                {editItem?.onedrive_url && !file && (
                  <a href={editItem.onedrive_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-700 hover:underline mb-1">
                    <Download className="w-3 h-3" />Ver archivo actual
                  </a>
                )}
                <label
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                  onDrop={e => {
                    e.preventDefault(); setDragActive(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped && dropped.name.toLowerCase().endsWith('.pdf')) setFile(dropped);
                    else toast.error('Solo se aceptan archivos PDF (.pdf)');
                  }}
                  className={`flex items-center gap-3 cursor-pointer border-2 border-dashed rounded-lg px-4 py-3 transition
                  ${dragActive ? 'border-blue-500 bg-blue-100' : file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-sm text-slate-600 truncate">
                    {file ? file.name : 'Arrastra el archivo PDF aquí o haz clic para seleccionarlo'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50">
                {(saveMutation.isPending || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editItem ? 'Guardar Cambios' : 'Guardar Minuta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showContactos && esCN && isAdmin && (
        <ContactosExternosModal contactos={contactosExternos} onClose={() => setShowContactos(false)} qc={qc} />
      )}

      {/* ── Modal: Confirmar eliminación ─────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar documento?</h2>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">{deleteItem.asunto}</span> — esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleteItem(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deleteItem)} disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors">
                {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contactos externos (Cumplimiento) ───────────────────────────────────────
// Personas fuera de Mano Amiga que reciben el correo de las minutas aunque no
// tengan usuario. Si mañana cambia el líder de la ORS, se cambia aquí.
const CONTACTO_VACIO = { nombre: '', correo: '', organizacion: '', puesto: '', va_en: 'para' as 'para' | 'cc', marcado_default: true, activo: true };

function ContactosExternosModal({ contactos, onClose, qc }: {
  contactos: ContactoExterno[]; onClose: () => void; qc: ReturnType<typeof useQueryClient>;
}) {
  const [editId, setEditId] = useState<string | 'nuevo' | null>(null);
  const [f, setF] = useState({ ...CONTACTO_VACIO });

  const abrir = (c?: ContactoExterno) => {
    setEditId(c?.id ?? 'nuevo');
    setF(c ? { nombre: c.nombre, correo: c.correo, organizacion: c.organizacion ?? '', puesto: c.puesto ?? '',
               va_en: c.va_en, marcado_default: c.marcado_default, activo: c.activo } : { ...CONTACTO_VACIO });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const correo = f.correo.trim().toLowerCase();
      if (!f.nombre.trim()) throw new Error('Escribe el nombre.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('El correo no es válido.');
      const datos = {
        nombre: f.nombre.trim(), correo, organizacion: f.organizacion.trim() || null, puesto: f.puesto.trim() || null,
        va_en: f.va_en, marcado_default: f.marcado_default, activo: f.activo, modulo: 'minutas_cn',
        updated_at: new Date().toISOString(),
      };
      if (editId === 'nuevo') {
        const { error } = await supabase.from('contactos_notificacion').insert({ ...datos, orden: contactos.length + 1 });
        if (error) throw new Error(error.code === '23505' ? 'Ese correo ya está dado de alta.' : error.message);
        logAudit({ accion: 'crear', modulo: 'minutas_cn', registro_ref: `Contacto externo: ${datos.nombre} <${correo}>` });
      } else {
        const { error } = await supabase.from('contactos_notificacion').update(datos).eq('id', editId!);
        if (error) throw new Error(error.message);
        logAudit({ accion: 'editar', modulo: 'minutas_cn', registro_id: editId, registro_ref: `Contacto externo: ${datos.nombre} <${correo}>` });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contactos_notificacion'] });
      toast.success('Contacto guardado');
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Contactos externos</h2>
            <p className="text-xs text-slate-500">Reciben el correo de las minutas de Cumplimiento con el PDF adjunto, aunque no tengan usuario en el sistema.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {contactos.length === 0 && editId === null && (
            <p className="text-sm text-slate-400 text-center py-4">Sin contactos dados de alta.</p>
          )}
          {editId === null && contactos.map(c => (
            <div key={c.id} className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 ${c.activo ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold text-slate-900">{c.nombre}{!c.activo && <span className="ml-2 text-[10px] font-bold text-slate-500">INACTIVO</span>}</p>
                <p className="text-xs text-slate-500 truncate">{c.correo}{c.organizacion ? ` · ${c.organizacion}` : ''}{c.puesto ? ` · ${c.puesto}` : ''}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Va en {c.va_en === 'para' ? 'Para' : 'CC'} · {c.marcado_default ? 'marcado por defecto' : 'sin marcar por defecto'}</p>
              </div>
              <button onClick={() => abrir(c)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
          {editId !== null && (
            <div className="space-y-2.5">
              <input className={inputCls} placeholder="Nombre *" value={f.nombre} onChange={e => setF(v => ({ ...v, nombre: e.target.value }))} />
              <input className={inputCls} placeholder="Correo *" type="email" value={f.correo} onChange={e => setF(v => ({ ...v, correo: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Organización (ej. ORS)" value={f.organizacion} onChange={e => setF(v => ({ ...v, organizacion: e.target.value }))} />
                <input className={inputCls} placeholder="Puesto" value={f.puesto} onChange={e => setF(v => ({ ...v, puesto: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['para', 'cc'] as const).map(v => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${f.va_en === v ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200'}`}>
                    <input type="radio" checked={f.va_en === v} onChange={() => setF(x => ({ ...x, va_en: v }))} /> Va en {v === 'para' ? 'Para' : 'CC'}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.marcado_default} onChange={e => setF(v => ({ ...v, marcado_default: e.target.checked }))} className="w-4 h-4 rounded" />
                Casilla marcada por defecto al crear una minuta
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.activo} onChange={e => setF(v => ({ ...v, activo: e.target.checked }))} className="w-4 h-4 rounded" />
                Activo (si lo desactivas ya no aparece en el formulario)
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          {editId === null ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
              <button onClick={() => abrir()} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800">
                <Plus className="w-4 h-4" /> Agregar contacto
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
                {guardar.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pestaña "Seguimiento de Acuerdos" ────────────────────────────────────────
// Junta los acuerdos de TODAS las minutas en un solo tablero, para no tener
// que abrir minuta por minuta a revisar qué ya se cumplió y qué falta.
type AcuerdoConMinuta = Acuerdo & {
  minuta: { id: string; asunto: string; fecha: string; territorio: string | null; colegio: string | null; tipo: string; onedrive_url: string | null } | null;
};

function estaVencido(a: AcuerdoConMinuta): boolean {
  if (!a.fecha_compromiso || a.estado === 'cumplido' || a.estado === 'cancelado') return false;
  return new Date(a.fecha_compromiso + 'T23:59:59') < new Date();
}

function SeguimientoAcuerdos({ acuerdos, isLoading, puedeEditar, qc }: {
  acuerdos: AcuerdoConMinuta[]; isLoading: boolean; puedeEditar: boolean; qc: ReturnType<typeof useQueryClient>;
}) {
  const [filtroEstado, setFiltroEstado]   = useState<'todos' | 'vencidos' | 'pendiente' | 'en_proceso' | 'cumplido' | 'cancelado'>('todos');
  const [filtroColegio, setFiltroColegio] = useState('');
  const [search, setSearch]               = useState('');
  const [notasAbiertoId, setNotasAbiertoId] = useState<string | null>(null);
  const [notasBorrador, setNotasBorrador]   = useState('');

  const colegios = useMemo(() =>
    Array.from(new Set(acuerdos.map(a => a.minuta?.colegio).filter(Boolean) as string[])).sort(),
    [acuerdos]);

  const actualizarMutation = useMutation({
    mutationFn: async (vars: { id: string; cambios: Partial<Acuerdo> }) => {
      const { error } = await supabase.from('minuta_acuerdos').update(vars.cambios).eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acuerdos_seguimiento'] });
      toast.success('Acuerdo actualizado');
    },
    onError: () => toast.error('No se pudo actualizar el acuerdo'),
  });

  const cambiarEstado = (a: AcuerdoConMinuta, nuevoEstado: Acuerdo['estado']) => {
    actualizarMutation.mutate({
      id: a.id,
      cambios: {
        estado: nuevoEstado,
        fecha_cumplido: nuevoEstado === 'cumplido' ? format(new Date(), 'yyyy-MM-dd') : null,
      },
    });
  };

  const guardarNotas = (a: AcuerdoConMinuta) => {
    actualizarMutation.mutate({ id: a.id, cambios: { notas_seguimiento: notasBorrador || null } });
    setNotasAbiertoId(null);
  };

  const prioridadOrden = (a: AcuerdoConMinuta): number => {
    if (estaVencido(a)) return 0;
    if (a.estado === 'pendiente' || a.estado === 'en_proceso') return 1;
    if (a.estado === 'cumplido') return 2;
    return 3; // cancelado
  };

  const filtrados = useMemo(() => acuerdos
    .filter(a => {
      if (filtroEstado === 'vencidos' && !estaVencido(a)) return false;
      if (filtroEstado !== 'todos' && filtroEstado !== 'vencidos' && a.estado !== filtroEstado) return false;
      if (filtroColegio && a.minuta?.colegio !== filtroColegio) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.descripcion.toLowerCase().includes(q) && !(a.responsable ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const p = prioridadOrden(a) - prioridadOrden(b);
      if (p !== 0) return p;
      // Dentro del mismo grupo: por fecha de compromiso más próxima primero (sin fecha, al final del grupo)
      if (!a.fecha_compromiso && !b.fecha_compromiso) return 0;
      if (!a.fecha_compromiso) return 1;
      if (!b.fecha_compromiso) return -1;
      return a.fecha_compromiso.localeCompare(b.fecha_compromiso);
    }),
  [acuerdos, filtroEstado, filtroColegio, search]);

  const kpi = useMemo(() => ({
    total:     acuerdos.length,
    vencidos:  acuerdos.filter(estaVencido).length,
    pendientes: acuerdos.filter(a => a.estado === 'pendiente' || a.estado === 'en_proceso').length,
    cumplidos: acuerdos.filter(a => a.estado === 'cumplido').length,
  }), [acuerdos]);

  if (isLoading) return <div className="text-center py-16 text-slate-400 text-sm">Cargando acuerdos...</div>;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',      value: kpi.total,      color: 'text-slate-900' },
          { label: 'Vencidos',   value: kpi.vencidos,   color: 'text-red-600' },
          { label: 'Pendientes', value: kpi.pendientes, color: 'text-amber-600' },
          { label: 'Cumplidos',  value: kpi.cumplidos,  color: 'text-green-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'todos',      label: 'Todos' },
            { key: 'vencidos',   label: 'Vencidos' },
            { key: 'pendiente',  label: 'Pendientes' },
            { key: 'en_proceso', label: 'En Proceso' },
            { key: 'cumplido',   label: 'Cumplidos' },
          ].map(f => (
            <button key={f.key} onClick={() => setFiltroEstado(f.key as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filtroEstado === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        {colegios.length > 0 && (
          <select value={filtroColegio} onChange={e => setFiltroColegio(e.target.value)}
            className="w-full sm:w-auto px-3 py-1.5 border border-slate-200 rounded-full text-xs font-bold text-slate-600 bg-white focus:outline-none">
            <option value="">Todos los colegios</option>
            {colegios.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="relative w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar acuerdo o responsable..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-full text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No hay acuerdos que coincidan con el filtro.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filtrados.map(a => {
            const vencido = estaVencido(a);
            const estadoCfg = ESTADO_CFG[a.estado] ?? ESTADO_CFG.pendiente;
            return (
              <div key={a.id} className="px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{a.descripcion}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${vencido ? 'text-red-700 bg-red-50 border-red-200' : estadoCfg.color}`}>
                        {vencido ? 'Vencido' : estadoCfg.label}
                      </span>
                      {a.responsable && (
                        <span className="text-[11px] text-slate-500">👤 {a.responsable}</span>
                      )}
                      {a.fecha_compromiso && (
                        <span className={`text-[11px] ${vencido ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                          📅 {format(new Date(a.fecha_compromiso + 'T12:00:00'), "d MMM yyyy", { locale: es })}
                        </span>
                      )}
                      {a.minuta?.colegio && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          <Building2 className="w-3 h-3" />{a.minuta.colegio}
                        </span>
                      )}
                      {a.minuta && (
                        a.minuta.onedrive_url ? (
                          <a href={a.minuta.onedrive_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">
                            📄 {a.minuta.asunto}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">📄 {a.minuta.asunto}</span>
                        )
                      )}
                    </div>
                    {a.notas_seguimiento && notasAbiertoId !== a.id && (
                      <p className="text-xs text-slate-500 italic mt-1.5">"{a.notas_seguimiento}"</p>
                    )}
                    {notasAbiertoId === a.id && (
                      <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
                        <textarea value={notasBorrador} onChange={e => setNotasBorrador(e.target.value)}
                          rows={2} autoFocus placeholder="Nota de seguimiento (ej. se llamó al proveedor, entrega la próxima semana)..."
                          className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <div className="flex items-center gap-2">
                          <button onClick={() => guardarNotas(a)} className="flex-1 sm:flex-none px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800">Guardar</button>
                          <button onClick={() => setNotasAbiertoId(null)} className="flex-1 sm:flex-none px-2 py-1.5 text-slate-400 hover:text-slate-700 text-xs">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {puedeEditar && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select value={a.estado} onChange={e => cambiarEstado(a, e.target.value as Acuerdo['estado'])}
                        className="flex-1 sm:flex-none text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                        <option value="pendiente">Pendiente</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="cumplido">Cumplido</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                      {notasAbiertoId !== a.id && (
                        <button
                          onClick={() => { setNotasAbiertoId(a.id); setNotasBorrador(a.notas_seguimiento ?? ''); }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0" title="Agregar nota de seguimiento">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
