import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, MapPin, Calendar, User, DollarSign, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';

export default function MaintenanceDetail() {
  const recordId = window.location.pathname.split('/').pop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const record = records.find(r => r.id === recordId);

  const updateMutation = useMutation({
    mutationFn: (data) => db.MaintenanceRecord.update(recordId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.MaintenanceRecord.delete(recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      navigate('/mantenimiento');
    },
  });

  if (!record) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  }

  const projectName = projects.find(p => p.id === record.project_id)?.name;

  // Clases de utilidad
  const btnOutline = "flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors";
  const btnDanger = "flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-0">
      <Link to="/mantenimiento" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Volver a Mantenimiento
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <StatusBadge status={record.type} />
              <StatusBadge status={record.status} />
              <PriorityBadge priority={record.priority} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">{record.title}</h1>
            {projectName && <p className="text-sm text-slate-500 mt-1 font-medium">Proyecto: {projectName}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className={btnOutline}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className={btnDanger}>
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        </div>

        {record.description && <p className="text-sm text-slate-600 leading-relaxed">{record.description}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
          {record.location && (
            <div className="flex items-center gap-2 text-slate-600"><MapPin className="w-4 h-4 text-slate-400" />{record.location}</div>
          )}
          {record.responsible && (
            <div className="flex items-center gap-2 text-slate-600"><User className="w-4 h-4 text-slate-400" />{record.responsible}</div>
          )}
          {record.scheduled_date && (
            <div className="flex items-center gap-2 text-slate-600"><Calendar className="w-4 h-4 text-slate-400" />Prog: {format(new Date(record.scheduled_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
          {record.completed_date && (
            <div className="flex items-center gap-2 text-slate-600"><Calendar className="w-4 h-4 text-slate-400" />Comp: {format(new Date(record.completed_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
          {record.cost && (
            <div className="flex items-center gap-2 text-slate-600 font-semibold"><DollarSign className="w-4 h-4 text-slate-400" />{Number(record.cost).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</div>
          )}
          {record.next_maintenance_date && (
            <div className="flex items-center gap-2 text-slate-600 font-medium text-blue-600"><Calendar className="w-4 h-4" />Próx: {format(new Date(record.next_maintenance_date), 'dd MMM yyyy', { locale: es })}</div>
          )}
        </div>

        {/* Detalles Técnicos */}
        <div className="space-y-4 pt-2">
          {record.findings && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Hallazgos</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{record.findings}</p>
            </div>
          )}

          {record.actions_taken && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Acciones Realizadas</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{record.actions_taken}</p>
            </div>
          )}

          {record.materials_used && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Materiales Usados</h3>
              <p className="text-sm text-slate-700">{record.materials_used}</p>
            </div>
          )}
        </div>

        {/* Fotos */}
        {record.photos_before?.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Registro Fotográfico: Antes</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {record.photos_before.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-slate-300 transition-all">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {record.photos_after?.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Registro Fotográfico: Después</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {record.photos_after.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-slate-300 transition-all">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {record.notes && (
          <div className="pt-4 border-t border-slate-100 italic">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notas Adicionales</h3>
            <p className="text-sm text-slate-500 whitespace-pre-wrap">{record.notes}</p>
          </div>
        )}
      </div>

      {/* Modal de Confirmación de Eliminación Personalizado */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar registro?</h2>
            <p className="text-sm text-slate-500 mt-2">Esta acción no se puede deshacer y el registro de mantenimiento desaparecerá del sistema.</p>
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
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md shadow-sm"
              >
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      <MaintenanceForm 
        open={editing} 
        onClose={() => setEditing(false)} 
        onSubmit={data => updateMutation.mutate(data)} 
        record={record} 
        projects={projects} 
      />
    </div>
  );
}