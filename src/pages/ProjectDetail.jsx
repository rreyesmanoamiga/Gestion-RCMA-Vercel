import React from 'react';
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
  Clock
} from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const project = projects.find(p => p.id === id);

  const deleteMutation = useMutation({
    mutationFn: () => db.Project.delete(id),
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

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">El proyecto no existe o ha sido eliminado.</p>
        <Link to="/proyectos" className="text-blue-600 font-bold mt-4 inline-block italic underline">Volver al listado</Link>
      </div>
    );
  }

  // Estilos de botones nativos
  const btnDanger = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-bold hover:bg-red-50 transition-colors";
  const btnOutline = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors";

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      {/* Navegación y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link to="/proyectos" className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-tighter">
          <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
        </Link>
        <div className="flex gap-2">
          <button className={btnOutline} onClick={() => alert('Función de edición en desarrollo')}>
            <Pencil className="w-4 h-4" /> Editar
          </button>
          <button 
            className={btnDanger}
            onClick={() => {
              if (window.confirm('¿Confirmas la eliminación definitiva de este proyecto?')) {
                deleteMutation.mutate();
              }
            }}
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>

      {/* Cabecera de Proyecto */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 leading-tight">{project.name}</h1>
          <p className="text-slate-500 mt-2 max-w-2xl text-sm leading-relaxed italic">
            {project.description || "Sin descripción técnica detallada."}
          </p>
        </div>

        {/* Ficha Técnica */}
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

      {/* Avance y Detalles */}
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
    </div>
  );
}