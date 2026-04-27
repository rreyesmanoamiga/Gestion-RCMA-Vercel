import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  FileText,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import ProjectForm from '@/components/projects/ProjectForm';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';

const btnDanger  = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-bold hover:bg-red-50 transition-colors";
const btnOutline = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

interface Project {
  id:           string;
  name?:        string;
  description?: string;
  status?:      string;
  priority?:    string;
  location?:    string;
  responsible?: string;
  start_date?:  string;
  progress?:    number;
  folio?:       string;
  territorio?:  string;
  colegio?:     string;
  eco?:         string;
  folio_num?:   string;
  notes?:       string;
  budget?:      number;
  end_date?:    string;
  ticket_number?: number;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => db.Project.filter({ id }, '-created_at', 1),
    enabled: !!id,
  });

  const project = (data as unknown as Project[] | undefined)?.[0];

  const updateMutation = useMutation({
    mutationFn: (formData: Record<string, unknown>) => db.Project.update(id!, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowEdit(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Project.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/proyectos');
    },
  });

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
        <Link to="/proyectos" className="text-sm text-blue-600 hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Navegación y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/proyectos"
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-tighter"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
        </Link>
        <div className="flex gap-2">
          <button className={btnOutline} onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4" /> Editar
          </button>
          <button className={btnDanger} onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>

      {/* Cabecera de proyecto */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.folio ? (
              <span className="text-xs font-black text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {project.folio}
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-300 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                Sin Ticket
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-900 leading-tight">{project.name}</h1>
          {project.notes ? (
            <p className="text-red-600 mt-2 max-w-2xl text-sm leading-relaxed font-medium">
              {project.notes}
            </p>
          ) : (
            <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed italic">
              Sin descripción técnica detallada.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-white">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ubicación / Colegio</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">{project.location || 'No especificada'}</p>
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
        </div>
      </div>

      {/* Avance y detalles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Estado del Avance
            </h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-black text-slate-900">{project.progress || 0}%</span>
              <span className="text-xs font-bold text-slate-400 mb-1">PROGRESO TOTAL</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className="bg-slate-900 h-full transition-all duration-1000 ease-out"
                style={{ width: `${project.progress || 0}%` }}
              />
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

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar proyecto?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Esta acción no se puede deshacer y el proyecto desaparecerá del sistema permanentemente.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate();
                  setShowDeleteConfirm(false);
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md shadow-sm disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
