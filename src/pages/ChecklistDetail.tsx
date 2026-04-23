import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import {
  ArrowLeft,
  AlertTriangle,
  Trash2,
  MapPin,
  User,
  Calendar,
  ClipboardCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusBadge from '@/components/shared/StatusBadge';

const btnDanger = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-bold hover:bg-red-50 transition-colors";

interface ChecklistItem {
  label?:     string;
  condition?: string;
  notes?:     string;
}

interface Checklist {
  id:                   string;
  title?:               string;
  overall_status?:      string;
  infrastructure_type?: string;
  colegio?:             string;
  territorio?:          string;
  inspector?:           string;
  inspection_date?:     string;
  description?:         string;
  items?:               ChecklistItem[];
}

const conditionConfig: Record<string, { label: string; class: string }> = {
  bueno:   { label: 'Bueno',   class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  regular: { label: 'Regular', class: 'bg-amber-50  text-amber-700  border-amber-200'    },
  malo:    { label: 'Malo',    class: 'bg-red-50    text-red-700    border-red-200'       },
  critico: { label: 'Crítico', class: 'bg-red-100   text-red-800    border-red-300'      },
};

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['checklists', id],
    queryFn: () => db.Checklist.filter({ id }, '-created_at', 1),
    enabled: !!id,
  });

  const checklist = (data as unknown as Checklist[] | undefined)?.[0];

  const deleteMutation = useMutation({
    mutationFn: () => db.Checklist.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      navigate('/checklists');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !checklist) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm">La inspección no existe o ha sido eliminada.</p>
        <Link to="/checklists" className="text-sm text-blue-600 hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  const items: ChecklistItem[] = checklist.items ?? [];
  const counts = { bueno: 0, regular: 0, malo: 0, critico: 0 };
  items.forEach(item => {
    if (item.condition && item.condition in counts) {
      counts[item.condition as keyof typeof counts]++;
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Navegación y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/checklists"
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-tighter"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Inspecciones
        </Link>
        <button className={btnDanger} onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="w-4 h-4" /> Eliminar
        </button>
      </div>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge status={checklist.overall_status} />
            {checklist.infrastructure_type && (
              <span className="px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200">
                {checklist.infrastructure_type === 'concreto' ? 'Concreto' : 'Metálica'}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">
            {checklist.title || 'Sin título'}
          </h1>
          {checklist.description && (
            <p className="text-slate-500 mt-2 text-sm leading-relaxed italic">
              {checklist.description}
            </p>
          )}
        </div>

        {/* Ficha técnica */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-white">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Colegio</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">{checklist.colegio || 'No especificado'}</p>
            {checklist.territorio && (
              <p className="text-xs text-slate-400 ml-7 mt-0.5">{checklist.territorio}</p>
            )}
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inspector</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">{checklist.inspector || 'Sin asignar'}</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</span>
            </div>
            <p className="text-sm font-bold text-slate-800 ml-7">
              {checklist.inspection_date
                ? format(new Date(checklist.inspection_date), 'dd MMM yyyy', { locale: es })
                : 'Sin fecha'}
            </p>
          </div>
        </div>
      </div>

      {/* Resumen de condiciones */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(counts).map(([key, count]) => {
          const config = conditionConfig[key];
          return (
            <div key={key} className={`p-4 rounded-xl border text-center ${config.class}`}>
              <p className="text-2xl font-black">{count}</p>
              <p className="text-xs font-bold uppercase tracking-wide mt-1">{config.label}</p>
            </div>
          );
        })}
      </div>

      {/* Items de inspección */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
            Items Inspeccionados ({items.length})
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-400 text-sm">No hay items registrados en esta inspección.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item, i) => {
              const config = item.condition ? conditionConfig[item.condition] : null;
              return (
                <div key={i} className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{item.label || `Item ${i + 1}`}</p>
                    {item.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 italic">{item.notes}</p>
                    )}
                  </div>
                  {config && (
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider shrink-0 ${config.class}`}>
                      {config.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal confirmación eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar inspección?</h2>
            <p className="text-sm text-slate-500 mt-2">
              Esta acción no se puede deshacer y la inspección desaparecerá del sistema permanentemente.
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
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Inspección'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
