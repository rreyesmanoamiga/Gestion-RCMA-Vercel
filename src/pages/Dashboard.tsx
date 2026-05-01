import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FolderKanban, ClipboardCheck, Wrench, AlertTriangle, ArrowRight,
  Building2, MapPin, TicketCheck, FolderOpen, CalendarDays, ClockAlert,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import StatCard from '@/components/dashboard/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLEGIOS, type Colegio } from '@/lib/colegios';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Project {
  id:          string;
  name?:       string;
  status?:     string;
  priority?:   string;
  colegio?:    string;
  territorio?: string;
  location?:   string;
  progress?:   number;
}

interface Checklist {
  id:               string;
  overall_status?:  string;
  colegio?:         string;
  territorio?:      string;
}

interface MaintenanceRecord {
  id:             string;
  title?:         string;
  status?:        string;
  priority?:      string;
  colegio?:       string;
  territorio?:    string;
  type?:          string;
  scheduled_date?: string;
}

interface Pendiente {
  id:               string;
  nombre_proyecto?: string;
  estatus?:         string;
  colegio?:         string;
  territorio?:      string;
}

interface TicketRecord {
  id:       string;
  folio?:   string;
  estatus?: string;
}

export default function Dashboard() {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const checklistsQuery = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 500),
  });

  const maintenanceQuery = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => db.MaintenanceRecord.list('-created_at', 500),
  });

  const pendientesQuery = useQuery({
    queryKey: ['pendientes'],
    queryFn: () => db.Pendiente.list('-fecha_actualizacion', 100),
  });

  const ticketsQuery = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  // Memoizados con cast — evita que ?? [] cree un nuevo array en cada render
  const projects    = useMemo(() => (projectsQuery.data    ?? []) as unknown as Project[],    [projectsQuery.data]);
  const checklists  = useMemo(() => (checklistsQuery.data  ?? []) as unknown as Checklist[],  [checklistsQuery.data]);
  const maintenance = useMemo(() => (maintenanceQuery.data ?? []) as unknown as MaintenanceRecord[], [maintenanceQuery.data]);
  const pendientes  = useMemo(() => (pendientesQuery.data  ?? []) as unknown as Pendiente[],  [pendientesQuery.data]);
  const tickets     = useMemo(() => (ticketsQuery.data     ?? []) as unknown as TicketRecord[], [ticketsQuery.data]);

  const isLoading = projectsQuery.isLoading
    || checklistsQuery.isLoading
    || maintenanceQuery.isLoading;

  const recentPendientes = useMemo(() => pendientes.slice(0, 5), [pendientes]);

  const stats = useMemo(() => ({
    activeProjects:     projects.filter(p => p.status === 'en_proceso' || p.status === 'en_espera').length,
    criticalChecklists: checklists.filter(c => c.overall_status === 'critico' || c.overall_status === 'malo').length,
    pendingMaintenance: pendientes.filter(m => m.estatus === 'pendiente' || m.estatus === 'en_proceso').length,
    urgentItems:        projects.filter(p => p.priority === 'urgente' && p.status !== 'completado' && p.status !== 'cancelado').length,
  }), [projects, checklists, pendientes]);

  const urgentColegios = useMemo(() => {
    const s = new Set<string>();
    projects.forEach(p => {
      if (p.priority === 'urgente' && p.status !== 'completado' && p.colegio) s.add(p.colegio);
    });
    maintenance.forEach(m => {
      if (m.priority === 'urgente' && m.status !== 'completado' && m.colegio) s.add(m.colegio);
    });
    checklists.forEach(c => {
      if ((c.overall_status === 'critico' || c.overall_status === 'malo') && c.colegio) s.add(c.colegio);
    });
    return s;
  }, [projects, maintenance, checklists]);

  const territorySummary = useMemo(() =>
    ['NORTE', 'MEXICO'].map(territorio => ({
      territorio,
      colegios:    COLEGIOS.filter((c: Colegio) => c.territorio === territorio),
      projects:    projects.filter(p => p.territorio === territorio),
      checklists:  checklists.filter(c => c.territorio === territorio),
      maintenance: maintenance.filter(m => m.territorio === territorio),
    })),
    [projects, checklists, maintenance]
  );

  const recentProjects    = useMemo(() => projects.slice(0, 5),    [projects]);
  const recentMaintenance = useMemo(() => maintenance.slice(0, 5), [maintenance]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Colegios Mano Amiga</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">Panel de Gestión de Proyectos y Mantenimiento</p>
        </div>
        <div className="hidden sm:flex items-center justify-center bg-white rounded-xl p-3 shadow-sm border border-slate-100">
          <img
            src="/logo.png"
            alt="Mano Amiga"
            className="h-20 w-auto object-contain"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Proyectos Activos"
          value={stats.activeProjects}
          subtitle={`${projects.length} total`}
          icon={FolderKanban}
          color="blue"
        />
        <StatCard
          title="Inspecciones"
          value={checklists.length}
          subtitle={stats.criticalChecklists > 0 ? `${stats.criticalChecklists} requieren atención` : 'Todo en orden'}
          icon={ClipboardCheck}
          color="green"
        />
        <StatCard
          title="Pendientes"
          value={stats.pendingMaintenance}
          subtitle={`${pendientes.length} registros totales`}
          icon={Wrench}
          color="orange"
        />
        <StatCard
          title="Urgentes"
          value={stats.urgentItems}
          subtitle="Requieren acción inmediata"
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Territory summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {territorySummary.map(({ territorio, colegios, projects: tProjects, checklists: tCheck, maintenance: tMaint }) => (
          <div key={territorio} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Territorio {territorio}</h2>
                <p className="text-xs text-muted-foreground">{colegios.length} colegios</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold text-foreground">{tProjects.length}</p>
                <p className="text-[10px] text-muted-foreground">Proyectos</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold text-foreground">{tCheck.length}</p>
                <p className="text-[10px] text-muted-foreground">Inspecciones</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <p className="text-xl font-bold text-foreground">
                  {tMaint.filter(m => m.status !== 'completado').length}
                </p>
                <p className="text-[10px] text-muted-foreground">Mtto. Pend.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {colegios.map(c => (
                <span
                  key={c.colegio}
                  className={`text-xs px-2 py-0.5 rounded-md font-medium border ${
                    urgentColegios.has(c.colegio)
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {c.colegio}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Rojo = requiere atención</p>
          </div>
        ))}
      </div>

      {/* Recent sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="bg-card rounded-xl border border-border">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">Proyectos Recientes</h2>
            <Link to="/proyectos" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentProjects.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground text-center">No hay proyectos registrados</p>
            )}
            {recentProjects.map(project => (
              <Link
                key={project.id}
                to={`/proyectos/${project.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                  <p className="text-xs text-muted-foreground">{project.location || 'Sin ubicación'}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <StatusBadge status={project.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Pendientes */}
        <div className="bg-card rounded-xl border border-border">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">Pendientes Recientes</h2>
            <Link to="/pendientes" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentPendientes.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground text-center">No hay pendientes registrados</p>
            )}
            {recentPendientes.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.nombre_proyecto}</p>
                  <p className="text-xs text-muted-foreground">{p.colegio || 'Sin colegio'}</p>
                </div>
                <div className="ml-3">
                  <StatusBadge status={p.estatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accesos Rápidos */}
      <div>
        <h2 className="font-semibold text-foreground mb-4">Accesos Rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Tickets',       path: '/tickets',       icon: TicketCheck,    color: 'bg-red-50 text-red-600 border-red-200',         count: tickets.length },
            { label: 'Proyectos',     path: '/proyectos',     icon: FolderKanban,   color: 'bg-blue-50 text-blue-600 border-blue-200',       count: projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length },
            { label: 'Anteproyectos', path: '/anteproyectos', icon: FolderOpen,     color: 'bg-indigo-50 text-indigo-600 border-indigo-200', count: null },
            { label: 'Checklists',    path: '/checklists',    icon: ClipboardCheck, color: 'bg-green-50 text-green-600 border-green-200',    count: checklists.length },
            { label: 'Pendientes',    path: '/pendientes',    icon: ClockAlert,     color: 'bg-amber-50 text-amber-600 border-amber-200',    count: pendientes.filter((p: any) => p.estatus !== 'completado').length },
            { label: 'Calendario',    path: '/calendario',    icon: CalendarDays,   color: 'bg-purple-50 text-purple-600 border-purple-200', count: null },
          ].map(({ label, path, icon: Icon, color, count }) => (
            <Link key={path} to={path}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${color} hover:shadow-md transition-all duration-200 group`}>
              <div className="relative">
                <Icon className="w-6 h-6" />
                {count !== null && count > 0 && (
                  <span className="absolute -top-2 -right-2 text-[10px] font-black bg-white border rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-center leading-tight">{label}</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
