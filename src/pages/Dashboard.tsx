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
  created_at?: string; completado_at?: string; budget?: number; costo_real?: number;
}
interface Checklist {
  id: string; overall_status?: string; colegio?: string; territorio?: string;
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
  en_proceso: '#3b82f6', en_espera:  '#f59e0b',
  completado: '#10b981', cancelado:  '#ef4444',
  pendiente:  '#8b5cf6', revision:   '#06b6d4',
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
  const colorMap: Record<string, { text: string; accent: string }> = {
    blue:   { text: 'text-[#00295A]', accent: '#4F82C2' },
    green:  { text: 'text-[#00295A]', accent: '#10b981' },
    orange: { text: 'text-[#ED7102]', accent: '#ED7102' },
    red:    { text: 'text-[#00295A]', accent: '#ef4444' },
    purple: { text: 'text-[#00295A]', accent: '#8b5cf6' },
  };
  const c = colorMap[color];

  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 pl-6 hover:shadow-md hover:border-slate-300 transition-all duration-200 h-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: c.accent }} />
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-4 h-4 text-slate-300" aria-hidden="true" />
        {trend && trendLabel && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
            trend === 'up'   ? 'bg-emerald-50 text-emerald-600' :
            trend === 'down' ? 'bg-red-50 text-red-600' :
                               'bg-slate-100 text-slate-500'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
          </span>
        )}
      </div>
      <p className={`font-display text-4xl font-semibold ${c.text} mb-1 leading-none`}>{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs font-bold text-slate-800">{payload[0].name}</p>
        <p className="text-sm font-black text-slate-900">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const projectsQuery    = useQuery({ queryKey: ['projects'],    queryFn: () => db.Project.list('-created_at', 500), refetchInterval: 60000 });
  const checklistsQuery  = useQuery({ queryKey: ['checklists'],  queryFn: () => db.Checklist.list('-created_at', 500), refetchInterval: 60000 });
  const ticketsQuery     = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500);
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const projects    = useMemo(() => (projectsQuery.data    ?? []) as unknown as Project[],           [projectsQuery.data]);
  const checklists  = useMemo(() => (checklistsQuery.data  ?? []) as unknown as Checklist[],         [checklistsQuery.data]);
  const tickets     = useMemo(() => (ticketsQuery.data     ?? []) as unknown as TicketRecord[],      [ticketsQuery.data]);

  const isLoading = projectsQuery.isLoading || checklistsQuery.isLoading;

  // ─── Mantenimiento — datos REALES del Calendario (antes leía de la tabla
  // maintenance_records, abandonada; nada le escribe desde hace tiempo) ──────
  const { data: colegiosConMtto = [] } = useQuery({
    queryKey: ['mtto_colegios_activos_dashboard'],
    queryFn: async () => {
      const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('maintenance_completions')
        .select('colegio')
        .gte('fecha_programada', inicioMes.toISOString().slice(0, 10));
      return Array.from(new Set((data ?? []).map((r: any) => r.colegio)));
    },
    refetchInterval: 60000,
  });
  const totalColegiosRed = COLEGIOS.filter((c: Colegio) => c.territorio === 'NORTE' || c.territorio === 'MEXICO').length;
  const colegiosSinMtto = useMemo(() =>
    COLEGIOS.filter((c: Colegio) => (c.territorio === 'NORTE' || c.territorio === 'MEXICO') && !colegiosConMtto.includes(c.colegio)).map(c => c.colegio),
    [colegiosConMtto]
  );

  // ─── Cumplimiento Normativo (Protección Civil / Donatarias) ───────────────
  const { data: cumplimientoStats = { vencidos: 0, porExpirar: 0 } } = useQuery({
    queryKey: ['cumplimiento_dashboard_resumen'],
    queryFn: async () => {
      const hoyISO = new Date().toISOString().slice(0, 10);
      const [{ count: vencidos }, { count: porExpirar }] = await Promise.all([
        supabase.from('compliance_documentos').select('*', { count: 'exact', head: true })
          .eq('activo', true).neq('estado', 'Verificado').not('fecha_limite_recepcion', 'is', null).lt('fecha_limite_recepcion', hoyISO),
        supabase.from('compliance_documentos').select('*', { count: 'exact', head: true })
          .eq('activo', true).eq('vigente', 'Por expirar'),
      ]);
      return { vencidos: vencidos ?? 0, porExpirar: porExpirar ?? 0 };
    },
    refetchInterval: 60000,
  });

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
    urgentItems:        projects.filter(p => p.priority === 'urgente' && p.status !== 'completado' && p.status !== 'cancelado').length,
    openTickets:        tickets.filter(t => t.estatus !== 'cerrado' && t.estatus !== 'resuelto').length,
  }), [projects, checklists, tickets]);

  // ─── Datos para gráficas ───────────────────────────────────────────────────
  const projectsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { const k = p.status ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#8F9DAE',
    }));
  }, [projects]);

  const ticketsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    tickets.forEach(t => { const k = t.estatus ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#8F9DAE',
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
        const fecha = p.completado_at;
        if (p.status !== 'completado' || !fecha) return false;
        const d = new Date(fecha);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;
      return { name: label, Completados: count };
    }), [projects, ultimosMeses]);

  // ─── Tendencia: Presupuesto planeado vs costo real por mes ─────────────────
  const presupuestoVsRealPorMes = useMemo(() =>
    ultimosMeses.map(({ year, month, label }) => {
      const delMes = projects.filter(p => {
        const fecha = p.completado_at;
        if (p.status !== 'completado' || !fecha || p.costo_real == null) return false;
        const d = new Date(fecha);
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
    checklists.forEach(c => { if ((c.overall_status === 'critico' || c.overall_status === 'malo') && c.colegio) s.add(c.colegio); });
    colegiosSinMtto.forEach(colegio => s.add(colegio));
    return s;
  }, [projects, checklists, colegiosSinMtto]);

  // ─── Resumen por territorio ────────────────────────────────────────────────
  const territorySummary = useMemo(() =>
    ['NORTE', 'MEXICO'].map(territorio => {
      const colegios  = COLEGIOS.filter((c: Colegio) => c.territorio === territorio);
      const tProjects = projects.filter(p => p.territorio === territorio);
      const tCheck    = checklists.filter(c => c.territorio === territorio);
      const tSinMtto  = colegiosSinMtto.filter(colegio => colegios.some(c => c.colegio === colegio)).length;
      const sinAlertas = colegios.filter(c => !urgentColegios.has(c.colegio)).length;
      const pct        = colegios.length > 0 ? Math.round((sinAlertas / colegios.length) * 100) : 100;
      return { territorio, colegios, tProjects, tCheck, tSinMtto, sinAlertas, pct };
    }),
    [projects, checklists, urgentColegios, colegiosSinMtto]
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
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const typeIcon: Record<string, LucideIcon> = {
    proyecto: FolderKanban, ticket: TicketCheck, pendiente: ClockAlert,
  };
  const typeColor: Record<string, string> = {
    proyecto:  'bg-blue-100 text-blue-600',
    ticket:    'bg-red-100 text-red-600',
    pendiente: 'bg-amber-100 text-amber-600',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {/* Saludo dinámico */}
          <p className="text-sm font-semibold text-teal-600 mb-1">
            {(() => { const h = new Date().getHours(); return h < 12 ? '☀️ Buenos días' : h < 19 ? '🌤️ Buenas tardes' : '🌙 Buenas noches'; })()}, Ing. Ricardo J.
          </p>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-display font-semibold text-slate-900 uppercase tracking-tight">Colegios Mano Amiga</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            Panel de Gestión · {projects.length} proyectos · {tickets.length} tickets
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center bg-white rounded-xl p-3 shadow-sm border border-slate-100">
          <img src="/logo.png" alt="Mano Amiga" className="h-16 w-auto object-contain" />
        </div>
      </div>

      {/* ─── ALERTAS ACTIVAS ─────────────────────────────────────────────────── */}
      {(tmasVencidos.length > 0 || nexusVencidos.length > 0 || pagosPendientes.length > 0 || stats.urgentItems > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-black text-red-800 uppercase tracking-wide">
              Alertas Activas — {tmasVencidos.length + nexusVencidos.length + pagosPendientes.length + stats.urgentItems} pendiente{(tmasVencidos.length + nexusVencidos.length + pagosPendientes.length + stats.urgentItems) !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Tickets MAS vencidos */}
            {tmasVencidos.length > 0 && (
              <Link to="/ticket-mas" className="flex items-start gap-3 bg-white rounded-lg border border-red-200 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <TicketCheck className="w-4 h-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-red-700 uppercase">Tickets MAS sin atender</p>
                  <p className="text-2xl font-black text-red-600">{tmasVencidos.length}</p>
                  <p className="text-[10px] text-red-500">+12h sin revisión</p>
                </div>
              </Link>
            )}

            {/* Proyectos urgentes */}
            {stats.urgentItems > 0 && (
              <Link to="/proyectos" className="flex items-start gap-3 bg-white rounded-lg border border-orange-200 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-orange-700 uppercase">Proyectos Urgentes</p>
                  <p className="text-2xl font-black text-orange-600">{stats.urgentItems}</p>
                  <p className="text-[10px] text-orange-500">Requieren acción inmediata</p>
                </div>
              </Link>
            )}

            {/* NEXUS vencidos */}
            {nexusVencidos.length > 0 && (
              <Link to="/nexus" className="flex items-start gap-3 bg-white rounded-lg border border-red-200 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <ClockAlert className="w-4 h-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-red-700 uppercase">NEXUS Vencidos</p>
                  <p className="text-2xl font-black text-red-600">{nexusVencidos.length}</p>
                  <p className="text-[10px] text-red-500">Fecha límite superada</p>
                </div>
              </Link>
            )}

            {/* Pagos Levantamiento pendientes */}
            {pagosPendientes.length > 0 && (
              <Link to="/levantamiento" className="flex items-start gap-3 bg-white rounded-lg border border-amber-200 p-3 hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-700 uppercase">Pagos Lev. Pendientes</p>
                  <p className="text-2xl font-black text-amber-600">{pagosPendientes.length}</p>
                  <p className="text-[10px] text-amber-500">Levantamiento Nacional</p>
                </div>
              </Link>
            )}

          </div>
        </div>
      )}

      {/* ─── KPIs ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
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
        <KPICard title="Mantenimiento" value={`${totalColegiosRed - colegiosSinMtto.length}/${totalColegiosRed}`}
          subtitle="Colegios con registro este mes"
          icon={Wrench} color={colegiosSinMtto.length === 0 ? 'green' : 'orange'} to="/calendario"
          trend={colegiosSinMtto.length === 0 ? 'up' : 'down'} trendLabel={`${colegiosSinMtto.length} sin registro`} />
        <KPICard title="Cumplimiento Norm." value={cumplimientoStats.vencidos}
          subtitle={`${cumplimientoStats.porExpirar} por expirar`}
          icon={BarChart3} color={cumplimientoStats.vencidos > 0 ? 'red' : 'green'} to="/cumplimiento"
          trend={cumplimientoStats.vencidos > 0 ? 'down' : 'up'} trendLabel="vencidos" />
        <KPICard title="Urgentes" value={stats.urgentItems}
          subtitle="Acción inmediata"
          icon={AlertTriangle} color={stats.urgentItems > 0 ? 'red' : 'green'}
          trend={stats.urgentItems > 0 ? 'down' : 'up'} trendLabel="prioridad alta" />
      </div>

      {/* ─── Gráficas ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dona — proyectos por estatus */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Proyectos por Estatus</h2>
              <p className="text-xs text-slate-400">{projects.length} proyectos totales</p>
            </div>
          </div>
          {projectsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={projectsByStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {projectsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Barras — tickets por estatus */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
              <TicketCheck className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Tickets por Estatus</h2>
              <p className="text-xs text-slate-400">{tickets.length} tickets totales</p>
            </div>
          </div>
          {ticketsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">Sin tickets registrados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ticketsByStatus} barSize={32} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAEDF0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
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
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Proyectos Completados por Mes</h2>
              <p className="text-xs text-slate-400">Últimos 6 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={proyectosCompletadosPorMes} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAEDF0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Completados" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Barras — presupuesto planeado vs costo real por mes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Presupuesto Planeado vs. Costo Real</h2>
              <p className="text-xs text-slate-400">Proyectos completados, últimos 6 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={presupuestoVsRealPorMes} barSize={16} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAEDF0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => '$' + v.toLocaleString('es-MX')} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Planeado" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Costo Real" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Territorios ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {territorySummary.map(({ territorio, colegios, tProjects, tCheck, tSinMtto, sinAlertas, pct }) => (
          <div key={territorio} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Territorio {territorio}</h2>
                  <p className="text-xs text-slate-400">{colegios.length} colegios</p>
                </div>
              </div>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${
                pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                pct >= 50 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'}`}>
                {pct}% OK
              </span>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{sinAlertas} de {colegios.length} colegios sin alertas</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Proyectos',    value: tProjects.length },
                { label: 'Inspecciones', value: tCheck.length },
                { label: 'Mtto. sin registro', value: tSinMtto },
              ].map(s => (
                <div key={s.label} className="text-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xl font-black text-slate-900">{s.value}</p>
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {colegios.map(c => (
                <span key={c.colegio}
                  className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${
                    urgentColegios.has(c.colegio)
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {c.colegio}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">🔴 Con alertas activas</p>
          </div>
        ))}
      </div>

      {/* ─── NEXUS Widget ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-600" /> NEXUS — Pendientes Activos
          </h2>
          <a href="/nexus" className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition">Ver todos →</a>
        </div>
        {nexusPendientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <BookOpen className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-semibold">¡Todo al día! Sin pendientes activos</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(nexusPendientes as any[]).map((p: any) => {
              const prioColors: Record<string,string> = { urgente:'bg-red-500', alta:'bg-orange-400', normal:'bg-blue-500', baja:'bg-slate-300' };
              const prioLabels: Record<string,string> = { urgente:'Urgente', alta:'Alta', normal:'Normal', baja:'Baja' };
              return (
                <div key={p.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${prioColors[p.prioridad] ?? 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {p.tipo === 'compartido' && p.asignado_nombre && (
                        <span className="text-[10px] text-teal-600 font-semibold">→ {p.asignado_nombre}</span>
                      )}
                      {p.colegio && <span className="text-[10px] text-slate-400">{p.colegio}</span>}
                      {p.fecha_limite && (
                        <span className="text-[10px] text-amber-600 font-semibold">📅 {p.fecha_limite}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${prioColors[p.prioridad] ?? 'bg-slate-300'}`}>
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
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-600" /> Proyectos Recientes
            </h2>
            <Link to="/proyectos" className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentProjects.length === 0 && (
              <p className="p-5 text-sm text-slate-400 text-center">No hay proyectos registrados</p>
            )}
            {recentProjects.map(project => (
              <Link key={project.id} to={`/proyectos/${project.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{project.name}</p>
                  <p className="text-xs text-slate-400">{project.colegio ?? project.location ?? 'Sin ubicación'}</p>
                  {typeof project.progress === 'number' && (
                    <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full w-32">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${project.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <StatusBadge status={project.status} />
                  <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" /> Actividad Reciente
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivity.length === 0 && (
              <p className="p-5 text-sm text-slate-400 text-center">Sin actividad reciente</p>
            )}
            {recentActivity.map(item => {
              const Icon = typeIcon[item.type] ?? Activity;
              const col  = typeColor[item.type] ?? 'bg-slate-100 text-slate-500';
              return (
                <Link key={item.id} to={item.to ?? '#'}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
                  <div className={`w-7 h-7 rounded-lg ${col} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub || item.type}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Accesos Rápidos ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Accesos Rápidos</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([
            { label: 'Tickets',       path: '/tickets',       icon: TicketCheck,    color: 'bg-red-50 text-red-600 border-red-100',             count: stats.openTickets },
            { label: 'Proyectos',     path: '/proyectos',     icon: FolderKanban,   color: 'bg-blue-50 text-blue-600 border-blue-100',           count: stats.activeProjects },
            { label: 'Anteproyectos', path: '/anteproyectos', icon: FolderOpen,     color: 'bg-indigo-50 text-indigo-600 border-indigo-100',     count: null },
            { label: 'Checklists',    path: '/checklists',    icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-600 border-emerald-100',  count: checklists.length },
            { label: 'NEXUS',         path: '/nexus',          icon: ClockAlert,     color: 'bg-teal-50 text-teal-600 border-teal-100',           count: 0 },
            { label: 'Calendario',    path: '/calendario',    icon: CalendarDays,   color: 'bg-purple-50 text-purple-600 border-purple-100',     count: null },
          ] as { label: string; path: string; icon: LucideIcon; color: string; count: number | null }[]).map(
            ({ label, path, icon: Icon, color, count }) => (
              <Link key={path} to={path}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${color} hover:shadow-md transition-all duration-200 group relative`}>
                <div className="relative">
                  <Icon className="w-6 h-6" />
                  {count !== null && count > 0 && (
                    <span className="absolute -top-2 -right-2 text-[10px] font-black bg-white border border-current rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
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
