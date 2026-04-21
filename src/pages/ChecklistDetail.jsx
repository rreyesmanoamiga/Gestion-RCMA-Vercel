import React from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, AlertTriangle, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatusBadge from '@/components/shared/StatusBadge';

// Clases de botón fuera del componente — se definen una sola vez
const btnOutline = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors";
const btnDanger  = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-medium hover:bg-red-50 transition-colors";

export default function ChecklistDetail() {
  const { id: recordId } = useParams(); // ← useParams en lugar de window.location
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Pide directamente el registro por ID — no descarga todos
  const { data, isLoading, isError } = useQuery({
    queryKey: ['checklists', recordId],
    queryFn: () => db.ChecklistRecord.filter({ id: recordId }, '-created_at', 1),
    enabled: !!recordId,
  });

  const record = data?.[0];

  const updateMutation = useMutation({
    mutationFn: (payload) => db.ChecklistRecord.update(recordId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
  });

  // Delete usando useMutation — manejo de errores global + caché correcto
  const deleteMutation = useMutation({
    mutationFn: () => db.ChecklistRecord.delete(recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      navigate('/checklists');
    },
  });

  const handleDelete = () => {
    if (window.confirm('¿Eliminar este registro de inspección?')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm">No se encontró el registro de inspección.</p>
        <Link to="/checklists" className="text-sm text-blue-600 hover:underline">
          Volver a Listas
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/checklists"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Listas
        </Link>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className={btnDanger}
          >
            {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={record.status} />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Inspección Técnica
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {record.title || 'Sin Título'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Realizado por:{' '}
                <span className="font-semibold text-slate-700">
                  {record.inspector || 'No asignado'}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">Fecha de Levantamiento</p>
              <p className="text-sm font-bold text-slate-700">
                {record.created_at
                  ? format(new Date(record.created_at), 'dd MMMM, yyyy', { locale: es })
                  : '--'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Puntos de revisión */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              Puntos de Revisión
            </h3>
            <div className="grid gap-3">
              {record.items?.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 bg-white hover:border-slate-300 transition-all"
                >
                  <div className="mt-0.5">
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${item.completed ? 'text-slate-900' : 'text-slate-500'}`}>
                      {item.label}
                    </p>
                    {item.note && (
                      <p className="text-xs text-slate-400 mt-1 italic">Nota: {item.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observaciones */}
          {record.observations && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Observaciones y Hallazgos
              </h3>
              <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed">
                {record.observations}
              </p>
            </div>
          )}

          {/* Galería de fotos */}
          {record.photos?.length > 0 && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-400" />
                Evidencia Fotográfica
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {record.photos.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-lg overflow-hidden border border-slate-200 group relative"
                  >
                    <img
                      src={url}
                      alt={`Evidencia ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] text-white font-bold uppercase">Ver original</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={() => window.print()} className={btnOutline}>
            Imprimir Reporte Técnico
          </button>
        </div>
      </div>
    </div>
  );
}