import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {FolderKanban, ClipboardCheck, Wrench, AlertTriangle, ArrowRight,
  Building2, MapPin, TicketCheck, FolderOpen, CalendarDays, ClockAlert,
  ChevronRight, Activity, type LucideIcon, BookOpen, Bell, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import StatusBadge from '@/components/shared/StatusBadge';
import { COLEGIOS, type Colegio } from '@/lib/colegios';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from 'recharts';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Project {
  id: string; name?: string; status?: string; priority?: string;
  colegio?: string; territorio?: string; location?: string; progress?: number;
  created_at?: string; updated_at?: string; budget?: number; costo_real?: number;
}
interface Checklist {
  id: string; overall_status?: string; colegio?: string; territorio?: string;
}
interface MaintenanceRecord {
  id: string; title?: string; status?: string; priority?: string;
  colegio?: string; territorio?: string; type?: string; scheduled_date?: string;
}
interface Pendiente {
  id: string; nombre_proyecto?: string; estatus?: string;
  colegio?: string; territorio?: string; created_at?: string;
}
interface TicketRecord {
  id: string; folio?: string; estatus?: string; titulo?: string;
  colegio?: string; created_at?: string;
}
interface ActivityItem {
  id: string; label: string; sub: string; type: string; date: string; to?: string;
}

// ─── Colores para gráficas ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  en_proceso: '#5B9DFF', en_espera:  '#FFB454',
  completado: '#3DDC97', cancelado:  '#FF5C5C',
  pendiente:  '#C29CFF', revision:   '#4DD8E8',
};
const STATUS_LABELS: Record<string, string> = {
  en_proceso: 'En Proceso', en_espera: 'En Espera',
  completado: 'Completado', cancelado: 'Cancelado',
  pendiente:  'Pendiente',  revision:  'Revisión',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  to?: string;
}
function KPICard({ title, value, subtitle, icon: Icon, color, trend, trendLabel, to }: KPICardProps) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue:   { bg: 'bg-rcma-blue-bg',    icon: 'text-rcma-blue',    border: 'border-rcma-blue/30' },
    green:  { bg: 'bg-rcma-mint-bg', icon: 'text-rcma-mint', border: 'border-rcma-mint/30' },
    orange: { bg: 'bg-rcma-amber-bg',   icon: 'text-rcma-amber',   border: 'border-rcma-amber/30' },
    red:    { bg: 'bg-rcma-red-bg',     icon: 'text-rcma-red',     border: 'border-rcma-red/30' },
    purple: { bg: 'bg-rcma-blue-bg',  icon: 'text-rcma-blue',  border: 'border-rcma-blue/30' },
  };
  const c = colorMap[color];

  const inner = (
    <div className={`bg-rcma-surface rounded-xl border ${c.border} p-5 hover:shadow-md transition-all duration-200 h-full`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && trendLabel && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
            trend === 'up'   ? 'bg-rcma-mint-bg text-rcma-mint' :
            trend === 'down' ? 'bg-rcma-red-bg text-rcma-red' :
                               'bg-rcma-surface2 text-rcma-text-2'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
          </span>
        )}
      </div>
      <p className="text-3xl font-black text-rcma-text mb-0.5">{value}</p>
      <p className="text-xs font-semibold text-rcma-text-2 uppercase tracking-wide mb-0.5">{title}</p>
      {subtitle && <p className="text-xs text-rcma-text-3">{subtitle}</p>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-rcma-surface border border-rcma-border rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs font-bold text-rcma-text">{payload[0].name}</p>
        <p className="text-sm font-black text-rcma-text">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const projectsQuery    = useQuery({ queryKey: ['projects'],    queryFn: () => db.Project.list('-created_at', 500) });
  const checklistsQuery  = useQuery({ queryKey: ['checklists'],  queryFn: () => db.Checklist.list('-created_at', 500) });
  const maintenanceQuery = useQuery({ queryKey: ['maintenance'], queryFn: () => db.MaintenanceRecord.list('-created_at', 500) });
  const ticketsQuery     = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const projects    = useMemo(() => (projectsQuery.data    ?? []) as unknown as Project[],           [projectsQuery.data]);
  const checklists  = useMemo(() => (checklistsQuery.data  ?? []) as unknown as Checklist[],         [checklistsQuery.data]);
  const maintenance = useMemo(() => (maintenanceQuery.data ?? []) as unknown as MaintenanceRecord[], [maintenanceQuery.data]);
  const tickets     = useMemo(() => (ticketsQuery.data     ?? []) as unknown as TicketRecord[],      [ticketsQuery.data]);

  const isLoading = projectsQuery.isLoading || checklistsQuery.isLoading || maintenanceQuery.isLoading;

  // ─── NEXUS pendientes activos ─────────────────────────────────────────────
  const { data: nexusPendientesActivos = 0 } = useQuery({
    queryKey: ['nexus_activos_dashboard'],
    queryFn: async () => {
      const { count } = await supabase
        .from('nexus_pendientes')
        .select('*', { count: 'exact', head: true })
        .neq('estatus', 'completado');
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const { data: nexusPendientes = [] } = useQuery({
    queryKey: ['nexus_pendientes_dashboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('nexus_pendientes')
        .select('id, titulo, prioridad, estatus, tipo, asignado_nombre, fecha_limite, colegio, territorio')
        .neq('estatus', 'completado')
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  // ─── Alertas: Tickets MAS vencidos (+12h sin atender) ─────────────────────
  const { data: tmasVencidos = [] } = useQuery({
    queryKey: ['tmas_vencidos_dashboard'],
    queryFn: async () => {
      const hace12h = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('tickets_mas')
        .select('id, folio, colegio, territorio, nombre_proyecto, created_at')
        .eq('estatus', 'pendiente')
        .lt('created_at', hace12h)
        .order('created_at', { ascending: true })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  // ─── Alertas: Pagos de Levantamiento pendientes ────────────────────────────
  const { data: pagosPendientes = [] } = useQuery({
    queryKey: ['pagos_lev_pendientes_dashboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('levantamiento_pagos')
        .select('id, mes_etiqueta, concepto, monto_programado, plantel_id')
        .eq('pagado', false)
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 300000,
  });

  // ─── Alertas: NEXUS vencidos ───────────────────────────────────────────────
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const nexusVencidos = useMemo(() =>
    (nexusPendientes as any[]).filter(p => p.fecha_limite && new Date(p.fecha_limite) < hoy),
    [nexusPendientes]
  );

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    activeProjects:     projects.filter(p => p.status === 'en_proceso' || p.status === 'en_espera').length,
    completedProjects:  projects.filter(p => p.status === 'completado').length,
    criticalChecklists: checklists.filter(c => c.overall_status === 'critico' || c.overall_status === 'malo').length,
    pendingMaintenance: 0,
    urgentItems:        projects.filter(p => p.priority === 'urgente' && p.status !== 'completado' && p.status !== 'cancelado').length,
    openTickets:        tickets.filter(t => t.estatus !== 'cerrado' && t.estatus !== 'resuelto').length,
  }), [projects, checklists, tickets]);

  // ─── Datos para gráficas ───────────────────────────────────────────────────
  const projectsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { const k = p.status ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#5C6785',
    }));
  }, [projects]);

  const ticketsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    tickets.forEach(t => { const k = t.estatus ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#5C6785',
    }));
  }, [tickets]);

  // ─── Tendencia: Proyectos completados por mes (últimos 6 meses) ────────────
  const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ultimosMeses = useMemo(() => {
    const hoy = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` };
    });
  }, []);

  const proyectosCompletadosPorMes = useMemo(() =>
    ultimosMeses.map(({ year, month, label }) => {
      const count = projects.filter(p => {
        if (p.status !== 'completado' || !p.updated_at) return false;
        const d = new Date(p.updated_at);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;
      return { name: label, Completados: count };
    }), [projects, ultimosMeses]);

  // ─── Tendencia: Presupuesto planeado vs costo real por mes ─────────────────
  const presupuestoVsRealPorMes = useMemo(() =>
    ultimosMeses.map(({ year, month, label }) => {
      const delMes = projects.filter(p => {
        if (p.status !== 'completado' || !p.updated_at || p.costo_real == null) return false;
        const d = new Date(p.updated_at);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const planeado = delMes.reduce((s, p) => s + (p.budget ?? 0), 0);
      const real     = delMes.reduce((s, p) => s + (p.costo_real ?? 0), 0);
      return { name: label, Planeado: Math.round(planeado), 'Costo Real': Math.round(real) };
    }), [projects, ultimosMeses]);

  // ─── Colegios con alertas ──────────────────────────────────────────────────
  const urgentColegios = useMemo(() => {
    const s = new Set<string>();
    projects.forEach(p => { if (p.priority === 'urgente' && p.status !== 'completado' && p.colegio) s.add(p.colegio); });
    maintenance.forEach(m => { if (m.priority === 'urgente' && m.status !== 'completado' && m.colegio) s.add(m.colegio); });
    checklists.forEach(c => { if ((c.overall_status === 'critico' || c.overall_status === 'malo') && c.colegio) s.add(c.colegio); });
    return s;
  }, [projects, maintenance, checklists]);

  // ─── Resumen por territorio ────────────────────────────────────────────────
  const territorySummary = useMemo(() =>
    ['NORTE', 'MEXICO'].map(territorio => {
      const colegios  = COLEGIOS.filter((c: Colegio) => c.territorio === territorio);
      const tProjects = projects.filter(p => p.territorio === territorio);
      const tCheck    = checklists.filter(c => c.territorio === territorio);
      const tMaint    = maintenance.filter(m => m.territorio === territorio);
      const sinAlertas = colegios.filter(c => !urgentColegios.has(c.colegio)).length;
      const pct        = colegios.length > 0 ? Math.round((sinAlertas / colegios.length) * 100) : 100;
      return { territorio, colegios, tProjects, tCheck, tMaint, sinAlertas, pct };
    }),
    [projects, checklists, maintenance, urgentColegios]
  );

  // ─── Feed de actividad reciente ────────────────────────────────────────────
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    projects.slice(0, 4).forEach(p => items.push({
      id: `p-${p.id}`, label: p.name ?? 'Proyecto sin nombre', sub: p.colegio ?? '',
      type: 'proyecto', date: p.created_at ?? '', to: `/proyectos/${p.id}`,
    }));
    tickets.slice(0, 4).forEach(t => items.push({
      id: `t-${t.id}`, label: t.titulo ?? `Ticket ${t.folio ?? ''}`, sub: t.colegio ?? '',
      type: 'ticket', date: t.created_at ?? '', to: '/tickets',
    }));

    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [projects, tickets]);

  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-rcma-border border-t-rcma-orange rounded-full animate-spin" />
      </div>
    );
  }

  const typeIcon: Record<string, LucideIcon> = {
    proyecto: FolderKanban, ticket: TicketCheck, pendiente: ClockAlert,
  };
  const typeColor: Record<string, string> = {
    proyecto:  'bg-rcma-blue-bg text-rcma-blue',
    ticket:    'bg-rcma-red-bg text-rcma-red',
    pendiente: 'bg-rcma-amber-bg text-rcma-amber',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {/* Saludo dinámico */}
          <p className="text-sm font-semibold text-rcma-orange mb-1">
            {(() => { const h = new Date().getHours(); return h < 12 ? '☀️ Buenos días' : h < 19 ? '🌤️ Buenas tardes' : '🌙 Buenas noches'; })()}, Ing. Ricardo J.
          </p>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-rcma-orange flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-rcma-text uppercase tracking-tight">Colegios Mano Amiga</h1>
          </div>
          <p className="text-sm text-rcma-text-2 ml-11">
            Panel de Gestión · {projects.length} proyectos · {tickets.length} tickets
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center bg-rcma-surface rounded-xl p-3 shadow-sm border border-rcma-border">
          <img src="/logo.png" alt="Mano Amiga" className="h-16 w-auto object-contain" />
        </div>
      </div>

      {/* ─── ALERTAS ACTIVAS ─────────────────────────────────────────────────── */}
      {(tmasVencidos.length > 0 || nexusVencidos.length > 0 || pagosPendientes.length > 0 || stats.urgentItems > 0) && (
        <div className="bg-rcma-red-bg border border-rcma-red/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-rcma-red" />
            <h2 className="text-sm font-black text-rcma-red uppercase tracking-wide">
              Alertas Activas — {tmasVencidos.length + nexusVencidos.length + pagosPendientes.length + stats.urgentItems} pendiente{(tmasVencidos.length + nexusVencidos.length + pagosPendientes.length + stats.urgentItems) !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Tickets MAS vencidos */}
            {tmasVencidos.length > 0 && (
              <Link to="/ticket-mas" className="flex items-start gap-3 bg-rcma-surface rounded-lg border border-rcma-red/30 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-rcma-red-bg flex items-center justify-center shrink-0">
                  <TicketCheck className="w-4 h-4 text-rcma-red" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-rcma-red uppercase">Tickets MAS sin atender</p>
                  <p className="text-2xl font-black text-rcma-red">{tmasVencidos.length}</p>
                  <p className="text-[10px] text-rcma-red">+12h sin revisión</p>
                </div>
              </Link>
            )}

            {/* Proyectos urgentes */}
            {stats.urgentItems > 0 && (
              <Link to="/proyectos" className="flex items-start gap-3 bg-rcma-surface rounded-lg border border-rcma-amber/30 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-rcma-amber-bg flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-rcma-amber" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-rcma-amber uppercase">Proyectos Urgentes</p>
                  <p className="text-2xl font-black text-rcma-amber">{stats.urgentItems}</p>
                  <p className="text-[10px] text-rcma-amber">Requieren acción inmediata</p>
                </div>
              </Link>
            )}

            {/* NEXUS vencidos */}
            {nexusVencidos.length > 0 && (
              <Link to="/nexus" className="flex items-start gap-3 bg-rcma-surface rounded-lg border border-rcma-red/30 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-rcma-red-bg flex items-center justify-center shrink-0">
                  <ClockAlert className="w-4 h-4 text-rcma-red" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-rcma-red uppercase">NEXUS Vencidos</p>
                  <p className="text-2xl font-black text-rcma-red">{nexusVencidos.length}</p>
                  <p className="text-[10px] text-rcma-red">Fecha límite superada</p>
                </div>
              </Link>
            )}

            {/* Pagos Levantamiento pendientes */}
            {pagosPendientes.length > 0 && (
              <Link to="/levantamiento" className="flex items-start gap-3 bg-rcma-surface rounded-lg border border-rcma-amber/30 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-rcma-amber-bg flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4 text-rcma-amber" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-rcma-amber uppercase">Pagos Lev. Pendientes</p>
                  <p className="text-2xl font-black text-rcma-amber">{pagosPendientes.length}</p>
                  <p className="text-[10px] text-rcma-amber">Levantamiento Nacional</p>
                </div>
              </Link>
            )}

          </div>
        </div>
      )}

      {/* ─── KPIs ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard title="Proyectos Activos" value={stats.activeProjects}
          subtitle={`${stats.completedProjects} completados`}
          icon={FolderKanban} color="blue" to="/proyectos"
          trend={stats.activeProjects > 0 ? 'up' : 'neutral'} trendLabel={`${projects.length} total`} />
        <KPICard title="Tickets Abiertos" value={stats.openTickets}
          subtitle={`${tickets.length} tickets totales`}
          icon={TicketCheck} color="red" to="/tickets"
          trend={stats.openTickets > 5 ? 'down' : 'neutral'} trendLabel={`${tickets.length} total`} />
        <KPICard title="Pendientes Activos" value={nexusPendientesActivos}
          subtitle="Ver todos en NEXUS"
          icon={ClockAlert} color={nexusPendientesActivos > 0 ? 'orange' : 'green'} to="/nexus"
          trend={nexusPendientesActivos > 0 ? 'down' : 'up'} trendLabel={`${nexusPendientesActivos} activos`} />
        <KPICard title="Inspecciones" value={stats.criticalChecklists > 0 ? stats.criticalChecklists : checklists.length}
          subtitle={stats.criticalChecklists > 0 ? 'requieren atención' : 'sin alertas críticas'}
          icon={ClipboardCheck} color={stats.criticalChecklists > 0 ? 'red' : 'green'} to="/checklists"
          trend={stats.criticalChecklists > 0 ? 'down' : 'up'} trendLabel={`${checklists.length} total`} />
        <KPICard title="Urgentes" value={stats.urgentItems}
          subtitle="Acción inmediata"
          icon={AlertTriangle} color={stats.urgentItems > 0 ? 'red' : 'green'}
          trend={stats.urgentItems > 0 ? 'down' : 'up'} trendLabel="prioridad alta" />
      </div>

      {/* ─── Gráficas ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dona — proyectos por estatus */}
        <div className="bg-rcma-surface rounded-xl border border-rcma-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-rcma-blue-bg flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-rcma-blue" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rcma-text">Proyectos por Estatus</h2>
              <p className="text-xs text-rcma-text-3">{projects.length} proyectos totales</p>
            </div>
          </div>
          {projectsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-rcma-text-3">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={projectsByStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {projectsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#93A0BE' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Barras — tickets por estatus */}
        <div className="bg-rcma-surface rounded-xl border border-rcma-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-rcma-red-bg flex items-center justify-center">
              <TicketCheck className="w-4 h-4 text-rcma-red" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rcma-text">Tickets por Estatus</h2>
              <p className="text-xs text-rcma-text-3">{tickets.length} tickets totales</p>
            </div>
          </div>
          {ticketsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-rcma-text-3">Sin tickets registrados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ticketsByStatus} barSize={32} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#253150" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5C6785' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5C6785' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {ticketsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Tendencias históricas (últimos 6 meses) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Línea — proyectos completados por mes */}
        <div className="bg-rcma-surface rounded-xl border border-rcma-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-rcma-mint-bg flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-rcma-mint" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rcma-text">Proyectos Completados por Mes</h2>
              <p className="text-xs text-rcma-text-3">Últimos 6 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={proyectosCompletadosPorMes} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#253150" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5C6785' }} />
              <YAxis tick={{ fontSize: 10, fill: '#5C6785' }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Completados" stroke="#3DDC97" strokeWidth={2.5} dot={{ r: 4, fill: '#3DDC97' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Barras — presupuesto planeado vs costo real por mes */}
        <div className="bg-rcma-surface rounded-xl border border-rcma-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-rcma-blue-bg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-rcma-blue" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-rcma-text">Presupuesto Planeado vs. Costo Real</h2>
              <p className="text-xs text-rcma-text-3">Proyectos completados, últimos 6 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={presupuestoVsRealPorMes} barSize={16} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#253150" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5C6785' }} />
              <YAxis tick={{ fontSize: 9, fill: '#5C6785' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => '$' + v.toLocaleString('es-MX')} contentStyle={{ background: '#141D33', border: '1px solid #253150', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#F4F6FB' }} itemStyle={{ color: '#93A0BE' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#93A0BE' }} />
              <Bar dataKey="Planeado" fill="#5B9DFF" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Costo Real" fill="#FFB454" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Territorios ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {territorySummary.map(({ territorio, colegios, tProjects, tCheck, tMaint, sinAlertas, pct }) => (
          <div key={territorio} className="bg-rcma-surface rounded-xl border border-rcma-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rcma-surface2 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-rcma-text-2" />
                </div>
                <div>
                  <h2 className="font-bold text-rcma-text">Territorio {territorio}</h2>
                  <p className="text-xs text-rcma-text-3">{colegios.length} colegios</p>
                </div>
              </div>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${
                pct >= 80 ? 'bg-rcma-mint-bg text-rcma-mint' :
                pct >= 50 ? 'bg-rcma-amber-bg text-rcma-amber' :
                            'bg-rcma-red-bg text-rcma-red'}`}>
                {pct}% OK
              </span>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-rcma-text-2 mb-1">
                <span>{sinAlertas} de {colegios.length} colegios sin alertas</span>
              </div>
              <div className="h-2 bg-rcma-surface2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  pct >= 80 ? 'bg-rcma-mint' : pct >= 50 ? 'bg-rcma-amber' : 'bg-rcma-red'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Proyectos',    value: tProjects.length },
                { label: 'Inspecciones', value: tCheck.length },
                { label: 'Mtto. Pend.',  value: tMaint.filter(m => m.status !== 'completado').length },
              ].map(s => (
                <div key={s.label} className="text-center p-2 bg-rcma-surface2 rounded-lg border border-rcma-border">
                  <p className="text-xl font-black text-rcma-text">{s.value}</p>
                  <p className="text-[10px] text-rcma-text-2">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {colegios.map(c => (
                <span key={c.colegio}
                  className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${
                    urgentColegios.has(c.colegio)
                      ? 'bg-rcma-red-bg text-rcma-red border-rcma-red/30'
                      : 'bg-rcma-surface2 text-rcma-text-2 border-rcma-border'}`}>
                  {c.colegio}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-rcma-text-3 mt-2">🔴 Con alertas activas</p>
          </div>
        ))}
      </div>

      {/* ─── NEXUS Widget ──────────────────────────────────────────────────────── */}
      <div className="bg-rcma-surface rounded-xl border border-rcma-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-rcma-border">
          <h2 className="text-sm font-bold text-rcma-text uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-rcma-mint" /> NEXUS — Pendientes Activos
          </h2>
          <a href="/nexus" className="text-xs font-semibold text-rcma-mint hover:text-rcma-mint transition">Ver todos →</a>
        </div>
        {nexusPendientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-rcma-text-3">
            <BookOpen className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-semibold">¡Todo al día! Sin pendientes activos</p>
          </div>
        ) : (
          <div className="divide-y divide-rcma-border">
            {(nexusPendientes as any[]).map((p: any) => {
              const prioColors: Record<string,string> = { urgente:'bg-rcma-red', alta:'bg-rcma-amber', normal:'bg-rcma-blue', baja:'bg-rcma-text-3' };
              const prioLabels: Record<string,string> = { urgente:'Urgente', alta:'Alta', normal:'Normal', baja:'Baja' };
              return (
                <div key={p.id} className="flex items-start gap-3 px-5 py-3 hover:bg-rcma-surface2 transition">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${prioColors[p.prioridad] ?? 'bg-rcma-text-3'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-rcma-text truncate">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {p.tipo === 'compartido' && p.asignado_nombre && (
                        <span className="text-[10px] text-rcma-mint font-semibold">→ {p.asignado_nombre}</span>
                      )}
                      {p.colegio && <span className="text-[10px] text-rcma-text-3">{p.colegio}</span>}
                      {p.fecha_limite && (
                        <span className="text-[10px] text-rcma-amber font-semibold">📅 {p.fecha_limite}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${prioColors[p.prioridad] ?? 'bg-rcma-text-3'}`}>
                    {prioLabels[p.prioridad] ?? p.prioridad}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Proyectos recientes + Actividad ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-rcma-surface rounded-xl border border-rcma-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-rcma-border">
            <h2 className="text-sm font-bold text-rcma-text uppercase tracking-tight flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-rcma-blue" /> Proyectos Recientes
            </h2>
            <Link to="/proyectos" className="text-xs text-rcma-blue font-semibold flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-rcma-border">
            {recentProjects.length === 0 && (
              <p className="p-5 text-sm text-rcma-text-3 text-center">No hay proyectos registrados</p>
            )}
            {recentProjects.map(project => (
              <Link key={project.id} to={`/proyectos/${project.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-rcma-surface2 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rcma-text truncate">{project.name}</p>
                  <p className="text-xs text-rcma-text-3">{project.colegio ?? project.location ?? 'Sin ubicación'}</p>
                  {typeof project.progress === 'number' && (
                    <div className="mt-1.5 h-1.5 bg-rcma-surface2 rounded-full w-32">
                      <div className="h-full bg-rcma-blue rounded-full" style={{ width: `${project.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <StatusBadge status={project.status} />
                  <ChevronRight className="w-3 h-3 text-rcma-text-3 opacity-0 group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-rcma-surface rounded-xl border border-rcma-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-rcma-border">
            <h2 className="text-sm font-bold text-rcma-text uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-rcma-blue" /> Actividad Reciente
            </h2>
          </div>
          <div className="divide-y divide-rcma-border">
            {recentActivity.length === 0 && (
              <p className="p-5 text-sm text-rcma-text-3 text-center">Sin actividad reciente</p>
            )}
            {recentActivity.map(item => {
              const Icon = typeIcon[item.type] ?? Activity;
              const col  = typeColor[item.type] ?? 'bg-rcma-surface2 text-rcma-text-2';
              return (
                <Link key={item.id} to={item.to ?? '#'}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-rcma-surface2 transition-colors group">
                  <div className={`w-7 h-7 rounded-lg ${col} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rcma-text truncate">{item.label}</p>
                    <p className="text-xs text-rcma-text-3">{item.sub || item.type}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-rcma-text-3 opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Accesos Rápidos ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold text-rcma-text-2 uppercase tracking-widest mb-3">Accesos Rápidos</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([
            { label: 'Tickets',       path: '/tickets',       icon: TicketCheck,    color: 'bg-rcma-red-bg text-rcma-red border-rcma-red/30',             count: stats.openTickets },
            { label: 'Proyectos',     path: '/proyectos',     icon: FolderKanban,   color: 'bg-rcma-blue-bg text-rcma-blue border-rcma-blue/30',           count: stats.activeProjects },
            { label: 'Anteproyectos', path: '/anteproyectos', icon: FolderOpen,     color: 'bg-rcma-blue-bg text-rcma-blue border-rcma-blue/30',     count: null },
            { label: 'Checklists',    path: '/checklists',    icon: ClipboardCheck, color: 'bg-rcma-mint-bg text-rcma-mint border-rcma-mint/30',  count: checklists.length },
            { label: 'NEXUS',         path: '/nexus',          icon: ClockAlert,     color: 'bg-rcma-mint-bg text-rcma-mint border-rcma-mint/30',           count: 0 },
            { label: 'Calendario',    path: '/calendario',    icon: CalendarDays,   color: 'bg-rcma-blue-bg text-rcma-blue border-rcma-blue/30',     count: null },
          ] as { label: string; path: string; icon: LucideIcon; color: string; count: number | null }[]).map(
            ({ label, path, icon: Icon, color, count }) => (
              <Link key={path} to={path}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${color} hover:shadow-md transition-all duration-200 group relative`}>
                <div className="relative">
                  <Icon className="w-6 h-6" />
                  {count !== null && count > 0 && (
                    <span className="absolute -top-2 -right-2 text-[10px] font-black bg-rcma-surface border border-current rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-center leading-tight">{label}</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
