import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Wrench, Clock, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';

const PAGE_SIZE = 20;

interface MaintenanceTask {
  id:          string;
  title?:      string;
  status?:     string;
  location?:   string;
  updated_at?: string;
  created_at?: string;
}

const tabClass = (activeTab: string, id: string) => `
  flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-tighter transition-all border-b-2
  ${activeTab === id
    ? 'border-slate-900 text-slate-900 bg-slate-50'
    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'}
`;

export default function Maintenance() {
  const [activeTab, setActiveTab]       = useState('pendientes');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showForm, setShowForm]         = useState(false);
  const queryClient = useQueryClient();

  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 500),
  });

  const maintenanceTasks = rawTasks as unknown as MaintenanceTask[];

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => db.MaintenanceRecord.create(data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setShowForm(false);
      if (result?._offline) {
        toast.warning('📶 Sin conexión — Mantenimiento guardado localmente, se sincronizará cuando haya internet');
      } else {
        toast.success('Mantenimiento creado correctamente');
      }
    },
    onError: () => {
      toast.error('Error al crear el mantenimiento');
    },
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setVisibleCount(PAGE_SIZE);
  };

  const filteredTasks = useMemo(() =>
    maintenanceTasks.filter(task => {
      if (activeTab === 'pendientes')  return task.status !== 'completado';
      if (activeTab === 'completados') return task.status === 'completado';
      return true;
    }),
    [maintenanceTasks, activeTab]
  );

  const visible   = useMemo(() => filteredTasks.slice(0, visibleCount), [filteredTasks, visibleCount]);
  const hasMore   = visibleCount < filteredTasks.length;
  const remaining = filteredTasks.length - visibleCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mantenimiento"
        subtitle="Control de órdenes de trabajo y correctivos"
        actionLabel="Nuevo Mantenimiento"
        onAction={() => setShowForm(true)}
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          <button onClick={() => handleTabChange('pendientes')} className={tabClass(activeTab, 'pendientes')}>
            <Clock className="w-4 h-4" /> Pendientes
          </button>
          <button onClick={() => handleTabChange('completados')} className={tabClass(activeTab, 'completados')}>
            <CheckCircle className="w-4 h-4" /> Historial
          </button>
          <button onClick={() => handleTabChange('todos')} className={tabClass(activeTab, 'todos')}>
            <Wrench className="w-4 h-4" /> Todos
          </button>
        </div>

        <div>
          {filteredTasks.length === 0 ? (
            <div className="py-20 text-center">
              <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No se encontraron órdenes de mantenimiento.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {visible.map(task => (
                  <Link
                    key={task.id}
                    to={`/mantenimiento/${task.id}`}
                    className="p-5 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 p-2 rounded-lg ${task.status === 'completado' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 leading-tight">{task.title}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            Edificio: <b className="text-slate-700">{task.location || 'N/A'}</b>
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            Ref: <span className="text-slate-400">#{task.id?.slice(-5).toUpperCase()}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-14 md:ml-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Última actualización</p>
                        <p className="text-xs font-bold text-slate-600">
                          {task.updated_at || task.created_at || 'Reciente'}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  </Link>
                ))}
              </div>

              {hasMore && (
                <div className="flex flex-col items-center gap-2 py-6 border-t border-slate-100">
                  <button
                    onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
                  </button>
                  <p className="text-xs text-slate-400">
                    Mostrando {visible.length} de {filteredTasks.length} registros
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <MaintenanceForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={(data: Record<string, unknown>) => createMutation.mutate(data)}
      />
    </div>
  );
}
