import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import {
  ArrowLeft, Calendar, MapPin, User, FileText, Trash2, Pencil,
  CheckCircle2, Clock, AlertTriangle, DollarSign, TrendingUp,
  TrendingDown, Minus, Save, X, ClipboardList, Camera, Upload, ImagePlus,
} from 'lucide-react';
import ProjectForm from '@/components/projects/ProjectForm';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import { notifyByEmail } from '@/lib/notifications';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { useDirectorio, findColegio } from '@/lib/directorio';

const btnDanger  = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-bold hover:bg-red-50 transition-colors";
const btnOutline = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

const fmtMXN = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const parseMXN = (v: string) => v.replace(/[^0-9.]/g, '');
const formatMXN = (v: string) => {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
  return clean ? '$' + integer + decimal : '';
};

interface Project {
  id: string; name?: string; description?: string; status?: string;
  priority?: string; location?: string; responsible?: string;
  start_date?: string; progress?: number; folio?: string;
  territorio?: string; colegio?: string; eco?: string;
  notes?: string; budget?: number; end_date?: string;
  ticket_number?: number; costo_real?: number | null;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, can } = usePermissions();
  const puedeEditar   = isAdmin || can('editar_proyectos');
  const { data: directorioRows = [] } = useDirectorio();
  const puedeEliminar = isAdmin || can('eliminar_proyectos');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCostoReal, setShowCostoReal] = useState(false);
  const [costoRealInput, setCostoRealInput] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => db.Project.filter({ id }, '-created_at', 1),
    enabled: !!id,
  });

  const project = (data as unknown as Project[] | undefined)?.[0];

  // Buscar ticket vinculado por proyecto_id para mostrar el folio TMAS
  const { data: ticketVinculado } = useQuery({
    queryKey: ['ticket-vinculado', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('folio')
        .eq('proyecto_id', id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const folioDisplay = project?.folio || (ticketVinculado as any)?.folio || null;

  // ── Seguimiento NEXUS: verificar si este proyecto ya tiene uno ────────────
  const { data: seguimientoExistente } = useQuery({
    queryKey: ['seguimiento-existente', id],
    queryFn: async () => {
      const { data } = await supabase.from('nexus_seguimientos').select('id').eq('proyecto_id', id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const agregarSeguimientoMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('nexus_seguimientos').insert({
        proyecto_id: id!, proyecto_nombre: project?.name ?? null,
        territorio: project?.territorio ?? null, colegio: project?.colegio ?? null,
        estatus: 'activo',
      });
      if (error) throw error;
      logAudit({ accion: 'crear', modulo: 'nexus', registro_id: id ?? null, registro_ref: project?.name ?? null, detalle: { origen: 'ficha_proyecto' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seguimiento-existente', id] });
      queryClient.invalidateQueries({ queryKey: ['nexus_seguimientos'] });
      toast.success('Proyecto agregado a Seguimiento en NEXUS');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al agregar a seguimiento'),
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: Record<string, unknown>) => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar proyectos.');

      // Si el status cambia a completado, sella la fecha real de cierre —
      // updated_at ni siquiera existe como columna en projects — por eso se
      // necesita este campo dedicado, sellado justo al momento de completar.
      const datosGuardar = { ...formData };
      if (formData.status === 'completado' && project?.status !== 'completado') {
        datosGuardar.completado_at = new Date().toISOString();
      }
      await db.Project.update(id!, datosGuardar);

      // Auditoría: distinguir completar / cancelar / editar / actualizar costo real
      const statusAnterior = project?.status;
      const statusNuevo    = formData.status as string | undefined;
      const accionAudit =
        statusNuevo === 'completado' && statusAnterior !== 'completado' ? 'completar' :
        statusNuevo === 'cancelado'  && statusAnterior !== 'cancelado'  ? 'cancelar'  :
        'editar';
      logAudit({
        accion:       accionAudit,
        modulo:       'proyectos',
        registro_id:  id ?? null,
        registro_ref: (formData.name as string) ?? project?.name ?? null,
        detalle: {
          status_anterior: statusAnterior, status_nuevo: statusNuevo,
          budget: formData.budget, costo_real: formData.costo_real,
        },
      });

      // Si el status cambia a completado, notificar por correo
      if (formData.status === 'completado' && project?.status !== 'completado') {
        const territorio = (formData.territorio ?? project?.territorio) as string ?? '';
        const colegioProyecto = (formData.colegio as string) ?? project?.colegio ?? '';
        const correoCAR  = findColegio(directorioRows, colegioProyecto)?.car_correo ?? '';
        const nombreProyecto = (formData.name as string) ?? project?.name ?? 'Proyecto';

        notifyByEmail('rreyes@manoamiga.edu.mx', {
          tipo:    'exito',
          titulo:  `Proyecto Completado: ${nombreProyecto}`,
          mensaje: `${colegioProyecto} — Cerrado correctamente`,
          link:    `/proyectos/${id}`,
          modulo:  'proyectos',
        });
        if (correoCAR) {
          notifyByEmail(correoCAR, {
            tipo:    'exito',
            titulo:  `Proyecto Completado en tu territorio: ${nombreProyecto}`,
            mensaje: `${colegioProyecto} — Cerrado correctamente`,
            link:    `/proyectos/${id}`,
            modulo:  'proyectos',
          });
        }

        await supabase.functions.invoke('notify-proyecto-completado', {
          body: {
            nombre_proyecto: formData.name ?? project?.name,
            colegio:         formData.colegio ?? project?.colegio,
            territorio,
            responsable:     formData.responsible ?? project?.responsible,
            presupuesto:     formData.budget ?? project?.budget,
            costo_real:      formData.costo_real ?? project?.costo_real,
            folio:           project?.folio,
            correo_admin:    'rreyes@manoamiga.edu.mx',
            correo_car:      correoCAR,
            site_url:        window.location.origin,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['proyectos_nexus'] });
      setShowEdit(false);
      setShowCostoReal(false);
      toast.success('Proyecto actualizado correctamente');
    },
    onError: () => toast.error('Error al actualizar el proyecto'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar proyectos.');
      await db.Project.delete(id!);
      logAudit({
        accion:       'eliminar',
        modulo:       'proyectos',
        registro_id:  id ?? null,
        registro_ref: project?.name ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['proyectos_nexus'] });
      navigate('/proyectos');
    },
  });

  const handleGuardarCostoReal = () => {
    const valor = parseFloat(parseMXN(costoRealInput));
    if (isNaN(valor) || valor <= 0) { toast.error('Ingresa un monto válido'); return; }
    updateMutation.mutate({ costo_real: valor });
  };

  // ── Evidencia Fotográfica (Antes / Durante / Después) ─────────────────────
  const [showEvidencia, setShowEvidencia] = useState(false);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [progresoEvidencia, setProgresoEvidencia] = useState('');
  const [evidenciaFiles, setEvidenciaFiles] = useState<{ antes: File[]; durante: File[]; despues: File[] }>({
    antes: [], durante: [], despues: [],
  });

  const limpiarNombre = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_');

  const subirEvidenciaFotografica = async () => {
    const totalArchivos = evidenciaFiles.antes.length + evidenciaFiles.durante.length + evidenciaFiles.despues.length;
    if (totalArchivos === 0) { toast.error('Selecciona al menos una foto.'); return; }

    setSubiendoEvidencia(true);
    try {
      // Reconstruir la misma ruta que usó Ticket MAS al crear el Expediente
      // (mismo folio/colegio/nombre/año), para subir dentro de las carpetas
      // Antes/Durante/Después que ya existen ahí.
      const folio = folioDisplay;
      let anio = new Date().getFullYear();
      let colegioCarpeta = limpiarNombre(project!.colegio ?? 'SIN_COLEGIO');
      let nombreCarpeta = limpiarNombre((project!.name ?? 'Sin nombre').slice(0, 60));

      if (folio) {
        const { data: tmas } = await supabase.from('tickets_mas')
          .select('created_at, colegio, nombre_proyecto, descripcion').eq('folio', folio).maybeSingle();
        const origen = tmas ?? (await supabase.from('tickets')
          .select('created_at, colegio, nombre_proyecto, descripcion').eq('folio', folio).maybeSingle()).data;
        if (origen) {
          anio = origen.created_at ? new Date(origen.created_at).getFullYear() : anio;
          colegioCarpeta = limpiarNombre(origen.colegio ?? project!.colegio ?? 'SIN_COLEGIO');
          nombreCarpeta = limpiarNombre(((origen.nombre_proyecto ?? origen.descripcion ?? project!.name) ?? 'Sin nombre').slice(0, 60));
        }
      }
      const folioCarpeta = folio ?? 'SIN_FOLIO';
      const raiz = `Expedientes/${anio}/${colegioCarpeta}/${folioCarpeta} - ${nombreCarpeta}/ECO/06 - Fotografías`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token    = sessionData?.session?.access_token ?? '';
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const spUp = async (file: File, carpeta: string, fileName: string) => {
        const fd = new FormData();
        fd.append('file', file); fd.append('carpeta', carpeta); fd.append('fileName', fileName);
        const res = await fetch(`${SUPA_URL}/functions/v1/sharepoint-upload`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY }, body: fd,
        });
        return res.json();
      };

      const categorias: { key: 'antes' | 'durante' | 'despues'; carpeta: string }[] = [
        { key: 'antes',   carpeta: 'Antes' },
        { key: 'durante', carpeta: 'Durante' },
        { key: 'despues', carpeta: 'Después' },
      ];

      let subidas = 0;
      for (const cat of categorias) {
        const archivos = evidenciaFiles[cat.key];
        for (const file of archivos) {
          subidas++;
          setProgresoEvidencia(`Subiendo ${subidas} de ${totalArchivos}...`);
          const r = await spUp(file, `${raiz}/${cat.carpeta}`, file.name);
          if (r?.error) throw new Error(`${file.name}: ${r.error}`);
        }
      }

      logAudit({
        accion: 'editar', modulo: 'proyectos', registro_id: id ?? null, registro_ref: project?.name ?? null,
        detalle: { evidencia_fotografica: { antes: evidenciaFiles.antes.length, durante: evidenciaFiles.durante.length, despues: evidenciaFiles.despues.length } },
      });

      toast.success(`${totalArchivos} foto${totalArchivos !== 1 ? 's' : ''} subida${totalArchivos !== 1 ? 's' : ''} al Expediente ✓`);
      setEvidenciaFiles({ antes: [], durante: [], despues: [] });
      setShowEvidencia(false);
    } catch (e: any) {
      toast.error('Error al subir evidencia: ' + (e.message ?? 'desconocido'));
    } finally {
      setSubiendoEvidencia(false);
      setProgresoEvidencia('');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm">El proyecto no existe o ha sido eliminado.</p>
        <Link to="/proyectos" className="text-sm text-blue-600 hover:underline">Volver al listado</Link>
      </div>
    );
  }

  // Cálculo presupuesto vs real
  const tienePresupuesto = project.budget != null && project.budget > 0;
  const tieneCostoReal   = project.costo_real != null && project.costo_real > 0;
  const esCompletado     = project.status === 'completado';
  const diferencia       = tienePresupuesto && tieneCostoReal
    ? project.costo_real! - project.budget!
    : null;
  const pctDiferencia    = tienePresupuesto && tieneCostoReal && project.budget! > 0
    ? Math.round((diferencia! / project.budget!) * 100)
    : null;
  const esSobrecosto     = diferencia !== null && diferencia > 0;
  const esAhorro         = diferencia !== null && diferencia < 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Navegación y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link to="/proyectos"
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-tighter">
          <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
        </Link>
        <div className="flex gap-2">
          {puedeEditar && !seguimientoExistente && project?.status && ['en_espera','en_proceso','pausado'].includes(project.status) && (
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-sm font-bold hover:bg-teal-100 transition-colors disabled:opacity-50"
            onClick={() => agregarSeguimientoMutation.mutate()} disabled={agregarSeguimientoMutation.isPending}>
            <ClipboardList className="w-4 h-4" /> {agregarSeguimientoMutation.isPending ? 'Agregando...' : 'Agregar a Seguimiento'}
          </button>
          )}
          {puedeEditar && (
          <button className={btnOutline} onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4" /> Editar
          </button>
          )}
          {puedeEliminar && (
          <button className={btnDanger} onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
          )}
        </div>
      </div>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {folioDisplay ? (
              <span className="text-xs font-black text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {folioDisplay}
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-300 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                Sin Ticket
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-900 leading-tight">{project.name}</h1>
          {project.notes ? (
            <p className="text-red-600 mt-2 max-w-2xl text-sm leading-relaxed font-medium">{project.notes}</p>
          ) : (
            <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed italic">Sin descripción técnica detallada.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-white">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ubicación / Colegio</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">
              {project.territorio && project.colegio
                ? `${project.territorio} / ${project.colegio}`
                : project.colegio || project.location || 'No especificada'}
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable de Obra</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">{project.responsible || 'Sin asignar'}</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha de Inicio</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">{project.start_date || 'Pendiente'}</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Presupuesto Inicial</span>
            </div>
            <p className="text-sm font-bold text-blue-600 ml-7">
              {tienePresupuesto ? fmtMXN(project.budget!) : 'Sin definir'}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sección Presupuesto vs Real ─────────────────────────────────── */}
      {esCompletado && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Presupuesto vs Costo Real
            </h3>
            {!showCostoReal && (
              <button onClick={() => { setShowCostoReal(true); setCostoRealInput(project.costo_real ? String(project.costo_real) : ''); }}
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                <Pencil className="w-3 h-3" />
                {tieneCostoReal ? 'Editar costo real' : 'Registrar costo real'}
              </button>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* Formulario costo real */}
            {showCostoReal && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-bold text-blue-900 mb-3">Costo Real Final del Proyecto</p>
                <div className="flex gap-3">
                  <input
                    className={inputClass}
                    placeholder="$0.00"
                    value={formatMXN(costoRealInput)}
                    onChange={e => setCostoRealInput(parseMXN(e.target.value))}
                    autoFocus
                  />
                  <button onClick={handleGuardarCostoReal} disabled={updateMutation.isPending}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-50 shrink-0">
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setShowCostoReal(false)}
                    className="p-2 border border-slate-300 rounded-md text-slate-500 hover:bg-slate-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Comparativa */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Presupuesto inicial */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Presupuesto Inicial</p>
                <p className="text-2xl font-black text-blue-700">
                  {tienePresupuesto ? fmtMXN(project.budget!) : '—'}
                </p>
              </div>

              {/* Costo real */}
              <div className={`border rounded-xl p-4 text-center ${tieneCostoReal ? 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-dashed border-slate-300'}`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo Real Final</p>
                {tieneCostoReal ? (
                  <p className="text-2xl font-black text-slate-900">{fmtMXN(project.costo_real!)}</p>
                ) : (
                  <p className="text-sm text-slate-400 italic mt-2">Sin registrar</p>
                )}
              </div>

              {/* Diferencia */}
              <div className={`border rounded-xl p-4 text-center ${
                diferencia === null ? 'bg-slate-50 border-dashed border-slate-300' :
                esSobrecosto ? 'bg-red-50 border-red-200' :
                esAhorro     ? 'bg-emerald-50 border-emerald-200' :
                               'bg-slate-100 border-slate-200'
              }`}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-500">
                  {esSobrecosto ? 'Sobrecosto' : esAhorro ? 'Ahorro' : 'Diferencia'}
                </p>
                {diferencia !== null ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      {esSobrecosto ? <TrendingUp className="w-5 h-5 text-red-600" /> :
                       esAhorro     ? <TrendingDown className="w-5 h-5 text-emerald-600" /> :
                                      <Minus className="w-5 h-5 text-slate-500" />}
                      <p className={`text-2xl font-black ${esSobrecosto ? 'text-red-700' : esAhorro ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {fmtMXN(Math.abs(diferencia))}
                      </p>
                    </div>
                    {pctDiferencia !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        esSobrecosto ? 'bg-red-100 text-red-600' :
                        esAhorro     ? 'bg-emerald-100 text-emerald-600' :
                                       'bg-slate-200 text-slate-600'}`}>
                        {esSobrecosto ? '+' : ''}{pctDiferencia}% {esSobrecosto ? 'sobre' : 'bajo'} presupuesto
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic mt-2">—</p>
                )}
              </div>
            </div>

            {/* Barra visual */}
            {tienePresupuesto && tieneCostoReal && (
              <div className="mt-2">
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                  <span>Presupuesto inicial</span>
                  <span>Costo real</span>
                </div>
                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div className="absolute h-full bg-blue-400 rounded-full" style={{ width: '100%' }} />
                  <div className={`absolute h-full rounded-full transition-all duration-700 ${esSobrecosto ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min((project.costo_real! / project.budget!) * 100, 150)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{fmtMXN(project.budget!)}</span>
                  <span>{fmtMXN(project.costo_real!)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Sección Evidencia Fotográfica ───────────────────────────────── */}
      {esCompletado && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#ED7102]" />
              Evidencia Fotográfica
            </h3>
            {!showEvidencia && (
              <button onClick={() => setShowEvidencia(true)}
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                <ImagePlus className="w-3 h-3" /> Agregar fotos
              </button>
            )}
          </div>

          {showEvidencia ? (
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Las fotos se suben directo al Expediente del proyecto en OneDrive, dentro de <span className="font-mono">ECO / 06 - Fotografías</span>.
                Selecciona todas las que quieras a la vez — no hay límite de cuántas eliges por categoría.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                  { key: 'antes' as const,   label: 'Antes' },
                  { key: 'durante' as const, label: 'Durante' },
                  { key: 'despues' as const, label: 'Después' },
                ]).map(cat => (
                  <div key={cat.key} className="border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">{cat.label}</p>
                    <label className="flex flex-col items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-600">
                      <Upload className="w-5 h-5" />
                      <span className="text-[11px]">
                        {evidenciaFiles[cat.key].length > 0
                          ? `${evidenciaFiles[cat.key].length} foto${evidenciaFiles[cat.key].length !== 1 ? 's' : ''} seleccionada${evidenciaFiles[cat.key].length !== 1 ? 's' : ''}`
                          : 'Elegir fotos...'}
                      </span>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={e => {
                          const nuevos = Array.from(e.target.files ?? []);
                          setEvidenciaFiles(prev => ({ ...prev, [cat.key]: [...prev[cat.key], ...nuevos] }));
                          e.target.value = '';
                        }} />
                    </label>
                    {evidenciaFiles[cat.key].length > 0 && (
                      <button onClick={() => setEvidenciaFiles(prev => ({ ...prev, [cat.key]: [] }))}
                        className="text-[10px] text-red-500 hover:underline mt-1.5">Quitar todas</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={subirEvidenciaFotografica} disabled={subiendoEvidencia}
                  className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-50">
                  <Upload className="w-4 h-4" />
                  {subiendoEvidencia ? (progresoEvidencia || 'Subiendo...') : 'Subir evidencia'}
                </button>
                <button onClick={() => { setShowEvidencia(false); setEvidenciaFiles({ antes: [], durante: [], despues: [] }); }}
                  disabled={subiendoEvidencia}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4">
              <p className="text-xs text-slate-400 italic">Sin fotos agregadas desde aquí todavía. Usa "Agregar fotos" para subir evidencia de Antes / Durante / Después directo al Expediente.</p>
            </div>
          )}
        </div>
      )}

      {/* Avance y detalles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Estado del Avance
            </h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-black text-slate-900">{project.progress || 0}%</span>
              <span className="text-xs font-bold text-slate-400 mb-1">PROGRESO TOTAL</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div className="bg-slate-900 h-full transition-all duration-1000 ease-out"
                style={{ width: `${project.progress || 0}%` }} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
            <FileText className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 rotate-12" />
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-4">Acceso Rápido</h3>
            <div className="space-y-3 relative z-10">
              <button className="w-full py-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors text-left flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" /> Ver Checklists Vinculados
              </button>
              <button className="w-full py-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors text-left flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" /> Generar Reporte PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal editar */}
      <ProjectForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSubmit={data => updateMutation.mutate(data)}
        project={project as unknown as Record<string, unknown>}
      />

      {/* Modal eliminar */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar proyecto?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Esta acción no se puede deshacer y el proyecto desaparecerá del sistema permanentemente.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
                Cancelar
              </button>
              <button onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md shadow-sm disabled:opacity-50">
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
