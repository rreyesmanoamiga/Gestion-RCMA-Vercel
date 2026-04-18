import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Wrench, MapPin, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

export default function Maintenance() {
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio] = useState('all');
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.MaintenanceRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      setShowForm(false);
    },
  });

  const colegiosPorTerritorio = filterTerritorio !== 'all'
    ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
    : COLEGIOS;

  const filtered = records.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (filterTerritorio !== 'all' && r.territorio !== filterTerritorio) return false;
    if (filterColegio !== 'all' && r.colegio !== filterColegio) return false;
    return true;
  });

  const getProjectName = (id) => projects.find(p => p.id === id)?.name || '';

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Mantenimiento" subtitle="Registro de mantenimientos preventivos y correctivos" actionLabel="Nuevo Registro" onAction={() => setShowForm(true)} />

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterTerritorio} onValueChange={v => { setFilterTerritorio(v); setFilterColegio('all'); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Territorio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Territorios</SelectItem>
            {TERRITORIOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterColegio} onValueChange={setFilterColegio}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Colegio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Colegios</SelectItem>
            {colegiosPorTerritorio.map(c => <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_progreso">En Progreso</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Type tabs */}
      <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="preventivo">Preventivos</TabsTrigger>
          <TabsTrigger value="correctivo">Correctivos</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No hay registros"
          description="Crea un nuevo registro de mantenimiento preventivo o correctivo."
          actionLabel="Nuevo Registro"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(record => (
            <Link key={record.id} to={`/mantenimiento/${record.id}`} className="bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={record.type} />
                  <StatusBadge status={record.status} />
                </div>
                <div className="text-right shrink-0 ml-2">
                  {record.colegio && <p className="text-xs font-semibold text-primary">{record.colegio}</p>}
                  <PriorityBadge priority={record.priority} />
                </div>
              </div>
              <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{record.title}</h3>
              {record.project_id && <p className="text-xs text-muted-foreground mb-2">Proyecto: {getProjectName(record.project_id)}</p>}
              {record.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{record.description}</p>}

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {record.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{record.location}</span>}
                {record.responsible && <span className="flex items-center gap-1"><User className="w-3 h-3" />{record.responsible}</span>}
                {record.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(record.scheduled_date), 'dd MMM', { locale: es })}</span>}
              </div>

              {(record.photos_before?.length > 0 || record.photos_after?.length > 0) && (
                <div className="mt-3 flex gap-1">
                  {(record.photos_before || []).slice(0, 2).map((url, i) => (
                    <div key={`b${i}`} className="w-8 h-8 rounded overflow-hidden border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {(record.photos_after || []).slice(0, 2).map((url, i) => (
                    <div key={`a${i}`} className="w-8 h-8 rounded overflow-hidden border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <MaintenanceForm open={showForm} onClose={() => setShowForm(false)} onSubmit={data => createMutation.mutate(data)} projects={projects} />
    </div>
  );
}