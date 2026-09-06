import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  FolderOpen,
  FileText,
  Building2,
  Menu,
  X,
  LogOut, Wrench,
  Lock,
  CalendarDays,
  TicketCheck,
  ClipboardEdit,
  Inbox,
  BookOpen,
  FileSignature,
  BarChart3,
  BookUser, Package, Layers, ShieldAlert, ShieldCheck, ListTodo,
  Network, Clock3,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import SidebarAccordionGroup from './SidebarAccordionGroup';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';

function NexusLink({ navLinkClass, handleNavClick, userEmail, isAdmin }) {
  const { data: badge = 0 } = useQuery({
    queryKey: ['nexus_badge', userEmail],
    queryFn: async () => {
      if (!userEmail) return 0;
      let q = supabase.from('nexus_pendientes').select('id').neq('estatus','completado');
      if (!isAdmin) q = q.eq('asignado_a', userEmail);
      const { data } = await q;
      if (!data || data.length === 0) return 0;
      const ids = data.map(p => p.id);
      const { count } = await supabase.from('nexus_comentarios').select('*', { count:'exact', head:true }).in('pendiente_id', ids).eq('leido', false).neq('autor_email', userEmail);
      return (!isAdmin ? data.length : 0) + (count ?? 0);
    },
    refetchInterval: 30000,
    enabled: !!userEmail,
  });
  return (
    <Link to="/nexus" onClick={handleNavClick} className={navLinkClass('/nexus') + ' relative'}>
      <BookOpen className="w-[18px] h-[18px]" />
      NEXUS
      {badge > 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );
}

/** Item pendiente de implementación: se muestra deshabilitado, sin enlazar a una ruta 404. */
function PendingItem({ icon: Icon, label }) {
  return (
    <div
      title="Próximamente"
      className="flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-md text-sm font-medium border-l-2 border-transparent text-sidebar-foreground/30 cursor-not-allowed select-none"
    >
      <Icon className="w-[18px] h-[18px]" />
      <span className="flex-1">{label}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide bg-white/[0.06] text-sidebar-foreground/45 px-1.5 py-0.5 rounded">
        Próx.
      </span>
    </div>
  );
}

export default function Sidebar({ isOpen, onToggle }) {
  const location    = useLocation();
  const { user, signOut } = useAuth();
  const { can }     = usePermissions();
  const isAdmin     = user?.user_metadata?.role === 'admin';
  const isMobile    = useIsMobile();
  const esRicardo   = user?.email === 'rreyes@manoamiga.edu.mx';
  const navigate = useNavigate();
  const modoCompliance = esRicardo && location.pathname.startsWith('/cumplimiento');

  const handleNavClick = () => { if (isMobile) onToggle(); };
  const handleLogout   = async () => { await signOut(); };

  // Comparación "activa" compartida por clases y por el estado inicial de los acordeones.
  const isActive = (path) => (
    location.pathname === path ||
    (path !== '/' && path !== '/solicitud' && path !== '/solicitudes' && location.pathname.startsWith(path))
  );

  const navLinkClass = (path) => cn(
    'flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 border-l-2',
    isActive(path)
      ? 'border-[#ED7102] bg-white/[0.06] text-white'
      : 'border-transparent text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
  );

  // Comparación exacta (sin prefijo) — evita que "/cumplimiento" se marque
  // activo también en "/cumplimiento/alertas" o "/cumplimiento/documentos".
  const navLinkClassExacta = (path) => cn(
    'flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 border-l-2',
    location.pathname === path
      ? 'border-[#ED7102] bg-white/[0.06] text-white'
      : 'border-transparent text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
  );

  const renderLink = ({ to, icon: Icon, label }) => (
    <Link key={to} to={to} onClick={handleNavClick} className={navLinkClass(to)}>
      <Icon className="w-[18px] h-[18px]" />
      {label}
    </Link>
  );

  // ---------------------------------------------------------------------
  // MÓDULO: OBRAS Y MANTENIMIENTO — visibilidad calculada según permisos
  // ---------------------------------------------------------------------
  const nexusVisible = isAdmin || can('ver_nexus');

  const gGestionProyectos = [
    { to: '/protocolo',    icon: BookOpen,      label: 'Protocolo de Proyectos', visible: true },
    { to: '/solicitud',    icon: ClipboardEdit, label: 'Solicitud de Proyecto',  visible: can('ver_solicitud_proyecto') },
    { to: '/solicitudes',  icon: Inbox,         label: 'Solicitudes Recibidas',  visible: isAdmin },
    { to: '/anteproyectos',icon: FolderOpen,    label: 'Anteproyectos',          visible: can('ver_anteproyectos') },
  ].filter(i => i.visible);

  const gOperacion = [
    { to: '/ticket-mas',    icon: FileSignature, label: 'Ticket MAS',            visible: isAdmin || can('ver_ticket_mas') || can('enviar_ticket_mas') },
    { to: '/tickets',       icon: TicketCheck,   label: 'Tickets Registrados',   visible: can('ver_tickets') },
    { to: '/proyectos',     icon: FolderKanban,  label: 'Proyectos',             visible: can('ver_proyectos') },
    { to: '/levantamiento', icon: Layers,        label: 'Levantamiento Nal.',    visible: isAdmin || can('ver_levantamiento') },
    { to: '/checklists',    icon: ClipboardCheck,label: 'Checklists',            visible: can('ver_checklists') },
    { to: '/minutas',       icon: FileSignature, label: 'Minutas',               visible: isAdmin || can('ver_minutas') },
  ].filter(i => i.visible);

  const gFinanciero = [
    { to: '/presupuestos', icon: BarChart3, label: 'Presupuesto vs Real', visible: isAdmin || can('ver_reportes') },
    { to: '/insumos',      icon: Package,   label: 'Insumos',             visible: isAdmin || can('ver_insumos') },
  ].filter(i => i.visible);

  const gPlataformaResto = [
    { to: '/calendario', icon: CalendarDays, label: 'Calendario', visible: can('ver_calendario') },
    { to: '/directorio', icon: BookUser,     label: 'Directorio', visible: true },
    { to: '/accesos',    icon: Lock,         label: 'Accesos',    visible: isAdmin },
  ].filter(i => i.visible);
  const gPlataformaVisible = nexusVisible || gPlataformaResto.length > 0;

  const gCalidad = [
    { to: '/reportes',  icon: FileText,     label: 'Reportes',  visible: can('ver_reportes') },
    { to: '/auditoria', icon: ShieldAlert,  label: 'Auditoría', visible: isAdmin },
  ].filter(i => i.visible);

  // ---------------------------------------------------------------------
  // MÓDULO: CUMPLIMIENTO Y PROTECCIÓN CIVIL (solo perfil de coordinación)
  // ---------------------------------------------------------------------
  const cControlNormativo = [
    { to: '/cumplimiento/panel-general', icon: ShieldCheck, label: 'Panel General de Cumplimiento' },
    { to: '/cumplimiento/documentos',    icon: FileText,    label: 'Validación de Vigencias' },
  ];
  const cGestionPC = [
    { to: '/cumplimiento/alertas', icon: ShieldAlert, label: 'Inspecciones y Alertas Críticas' },
  ];
  const cGestionPCPending = [
    { icon: Clock3, label: 'Jornada Presupuestal' },
  ];
  const cMonitoreo = [
    { to: '/cumplimiento/seguimiento', icon: ListTodo, label: 'Seguimiento de Trámites' },
  ];
  const cMonitoreoPending = [
    { icon: BarChart3, label: 'Generador de Reportes Ejecutivos' },
  ];

  return (
    <>
      {isOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <button
        onClick={onToggle}
        aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={isOpen}
        aria-controls="app-sidebar"
        className="fixed top-4 left-4 z-50 lg:hidden bg-white shadow-md p-2 rounded-md hover:bg-slate-100 transition-colors border border-slate-200"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside
        id="app-sidebar"
        aria-label="Navegación principal"
        className={cn(
          'fixed left-0 top-0 h-full w-64 bg-sidebar z-40 flex flex-col transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo + Selector de módulo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-inner">
              <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-display font-semibold text-sidebar-foreground leading-tight tracking-tight">
                Sistema RCMA
              </h1>
              {esRicardo ? (
                <div className="flex bg-white/[0.07] rounded-md p-[2px] mt-1.5">
                  <button
                    onClick={() => navigate('/')}
                    className={cn(
                      'flex-1 text-center py-[5px] rounded text-[9.5px] font-bold transition-colors duration-200',
                      !modoCompliance ? 'bg-[#ED7102] text-white' : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80'
                    )}
                  >
                    Obras
                  </button>
                  <button
                    onClick={() => navigate('/cumplimiento')}
                    className={cn(
                      'flex-1 text-center py-[5px] rounded text-[9.5px] font-bold transition-colors duration-200',
                      modoCompliance ? 'bg-[#ED7102] text-white' : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80'
                    )}
                  >
                    Cumplimiento
                  </button>
                </div>
              ) : (
                <p className="text-[10px] font-bold text-sidebar-foreground/60 uppercase tracking-widest">
                  Coordinación de Obras
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-sidebar" aria-label="Menú principal">
          {modoCompliance ? (
            <>
              <Link to="/cumplimiento" onClick={handleNavClick} className={navLinkClassExacta('/cumplimiento')}>
                <LayoutDashboard className="w-[18px] h-[18px]" />
                Dashboard
              </Link>

              <div className="pt-2" />

              <SidebarAccordionGroup
                label="Control Normativo"
                icon={ShieldCheck}
                defaultOpen={cControlNormativo.some(i => isActive(i.to))}
              >
                {cControlNormativo.map(renderLink)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Gestión de Protección Civil"
                icon={ShieldAlert}
                defaultOpen={cGestionPC.some(i => isActive(i.to))}
              >
                {cGestionPC.map(renderLink)}
                {cGestionPCPending.map((i) => <PendingItem key={i.label} {...i} />)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Monitoreo y Reportes"
                icon={ListTodo}
                defaultOpen={cMonitoreo.some(i => isActive(i.to))}
              >
                {cMonitoreo.map(renderLink)}
                {cMonitoreoPending.map((i) => <PendingItem key={i.label} {...i} />)}
              </SidebarAccordionGroup>
            </>
          ) : (
            <>
              {(isAdmin || can('ver_dashboard')) && (
                <Link to="/" onClick={handleNavClick} className={navLinkClass('/')}>
                  <LayoutDashboard className="w-[18px] h-[18px]" />
                  Dashboard
                </Link>
              )}

              <div className="pt-2" />

              <SidebarAccordionGroup
                label="Gestión de Proyectos"
                icon={FolderKanban}
                hidden={gGestionProyectos.length === 0}
                defaultOpen={gGestionProyectos.some(i => isActive(i.to))}
              >
                {gGestionProyectos.map(renderLink)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Operación Diaria"
                icon={ListTodo}
                hidden={gOperacion.length === 0}
                defaultOpen={gOperacion.some(i => isActive(i.to))}
              >
                {gOperacion.map(renderLink)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Control Financiero"
                icon={BarChart3}
                hidden={gFinanciero.length === 0}
                defaultOpen={gFinanciero.some(i => isActive(i.to))}
              >
                {gFinanciero.map(renderLink)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Plataforma y Red"
                icon={Network}
                hidden={!gPlataformaVisible}
                defaultOpen={isActive('/nexus') || gPlataformaResto.some(i => isActive(i.to))}
              >
                {nexusVisible && (
                  <NexusLink navLinkClass={navLinkClass} handleNavClick={handleNavClick} userEmail={user?.email} isAdmin={isAdmin} />
                )}
                {gPlataformaResto.map(renderLink)}
              </SidebarAccordionGroup>

              <SidebarAccordionGroup
                label="Control de Calidad"
                icon={ClipboardCheck}
                hidden={gCalidad.length === 0}
                defaultOpen={gCalidad.some(i => isActive(i.to))}
              >
                {gCalidad.map(renderLink)}
              </SidebarAccordionGroup>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Link
            to="/reportar-problema"
            onClick={handleNavClick}
            title="Reportar Problema"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-amber-400 hover:bg-amber-500/10 transition-all duration-200"
          >
            <Wrench className="w-[18px] h-[18px]" />
            Reportar Problema
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Cerrar sesión
          </button>
          <p className="text-[10px] font-bold text-sidebar-foreground/40 text-center uppercase tracking-tighter pt-1">
            Sistema RCMA © 2026
          </p>
        </div>
      </aside>
    </>
  );
}
