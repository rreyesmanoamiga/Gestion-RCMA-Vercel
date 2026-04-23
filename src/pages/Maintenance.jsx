import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Wrench, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

// Fuera del componente — se define una sola vez
const tabClass = (activeTab, id) => `
  flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-tighter transition-all border-b-2
  ${activeTab === id
    ? 'border-slate-900 text-slate-900 bg-slate-50'
    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'}
`;

export default function Maintenance() {
  const [activeTab, setActiveTab] = useState('pendientes');

  const { data: maintenanceTasks = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 500), // ← corregido: MaintenanceRecord
  });

  const filteredTasks = useMemo(() =>
    maintenanceTasks.filter(task => {
      if (activeTab === 'pendientes')  return task.status !== 'completado';
      if (activeTab === 'completados') return task.status === 'completado';
      return true;
    }),
    [maintenanceTasks, activeTab]
  );

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
        // Botón omitido hasta implementar la funcionalidad de nueva orden
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          <button onClick={() => setActiveTab('pendientes')} className={tabClass(activeTab, 'pendientes')}>
            <Clock className="w-4 h-4" /> Pendientes
          </button>
          <button onClick={() => setActiveTab('completados')} className={tabClass(activeTab, 'completados')}>
            <CheckCircle className="w-4 h-4" /> Historial
          </button>
          <button onClick={() => setActiveTab('todos')} className={tabClass(activeTab, 'todos')}>
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
            <div className="divide-y divide-slate-100">
              {filteredTasks.map(task => (
                // ← Link en lugar de div — navegación consistente con el resto de la app
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
          )}
        </div>
      </div>
    </div>
  );
}