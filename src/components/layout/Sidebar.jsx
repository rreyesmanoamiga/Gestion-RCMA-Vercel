import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  ClockAlert,
  CalendarDays,
  TicketCheck,
  ClipboardEdit,
  Inbox,
  BookOpen,
  FileSignature,
  BarChart3,
  // --- ICONO AGREGADO ---
  BookUser, Package, Layers, ShieldAlert,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';

export default function Sidebar({ isOpen, onToggle }) {
  const location    = useLocation();
  const { user, signOut } = useAuth();
  const { can }     = usePermissions();
  const isAdmin     = user?.user_metadata?.role === 'admin';
  const isMobile    = useIsMobile();

  const handleNavClick = () => { if (isMobile) onToggle(); };
  const handleLogout   = async () => { await signOut(); };

  const navLinkClass = (path) => cn(
    'flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 border-l-2',
    location.pathname === path || (path !== '/' && path !== '/solicitud' && path !== '/solicitudes' && location.pathname.startsWith(path))
      ? 'border-[#ED7102] bg-white/[0.06] text-white'
      : 'border-transparent text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
  );

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
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-inner">
              <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-display font-semibold text-sidebar-foreground leading-tight tracking-tight">
                Sistema RCMA
              </h1>
              <p className="text-[10px] font-bold text-sidebar-foreground/60 uppercase tracking-widest">
                Coordinación de Obras
              </p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-sidebar" aria-label="Menú principal">

          {/* 1 — Dashboard */}
          {(isAdmin || can('ver_dashboard')) && (
            <Link to="/" onClick={handleNavClick} className={navLinkClass('/')}>
              <LayoutDashboard className="w-[18px] h-[18px]" />
              Dashboard
            </Link>
          )}

          {/* 2 — Protocolo de Proyectos */}
          <Link to="/protocolo" onClick={handleNavClick} className={navLinkClass('/protocolo')}>
            <BookOpen className="w-[18px] h-[18px]" />
            Protocolo de Proyectos
          </Link>

          {/* 3 — Solicitud de Proyecto */}
          {can('ver_solicitud_proyecto') && (
            <Link to="/solicitud" onClick={handleNavClick} className={navLinkClass('/solicitud')}>
              <ClipboardEdit className="w-[18px] h-[18px]" />
              Solicitud de Proyecto
            </Link>
          )}

          {/* 4 — Solicitudes Recibidas */}
          {isAdmin && (
            <Link to="/solicitudes" onClick={handleNavClick} className={navLinkClass('/solicitudes')}>
              <Inbox className="w-[18px] h-[18px]" />
              Solicitudes Recibidas
            </Link>
          )}

          {/* 5 — Ticket MAS */}
          {(isAdmin || can('ver_ticket_mas') || can('enviar_ticket_mas')) && (
            <Link to="/ticket-mas" onClick={handleNavClick} className={navLinkClass('/ticket-mas')}>
              <FileSignature className="w-[18px] h-[18px]" />
              Ticket MAS
            </Link>
          )}

          {/* 6 — Tickets Registrados */}
          {can('ver_tickets') && (
            <Link to="/tickets" onClick={handleNavClick} className={navLinkClass('/tickets')}>
              <TicketCheck className="w-[18px] h-[18px]" />
              Tickets Registrados
            </Link>
          )}

          {/* 7 — Proyectos */}
          {can('ver_proyectos') && (
            <Link to="/proyectos" onClick={handleNavClick} className={navLinkClass('/proyectos')}>
              <FolderKanban className="w-[18px] h-[18px]" />
              Proyectos
            </Link>
          )}

          {/* 8 — Presupuesto vs Real */}
          {(isAdmin || can('ver_reportes')) && (
            <Link to="/presupuestos" onClick={handleNavClick} className={navLinkClass('/presupuestos')}>
              <BarChart3 className="w-[18px] h-[18px]" />
              Presupuesto vs Real
            </Link>
          )}

          {/* 9 — Anteproyectos */}
          {can('ver_anteproyectos') && (
            <Link to="/anteproyectos" onClick={handleNavClick} className={navLinkClass('/anteproyectos')}>
              <FolderOpen className="w-[18px] h-[18px]" />
              Anteproyectos
            </Link>
          )}

          {/* 10 — Levantamiento Nal. */}
          {(isAdmin || can('ver_levantamiento')) && (
            <Link to="/levantamiento" onClick={handleNavClick} className={navLinkClass('/levantamiento')}>
              <Layers className="w-[18px] h-[18px]" />
              Levantamiento Nal.
            </Link>
          )}

          {/* 11 — Minutas */}
          {(isAdmin || can('ver_minutas')) && (
            <Link to="/minutas" onClick={handleNavClick} className={navLinkClass('/minutas')}>
              <FileSignature className="w-[18px] h-[18px]" />
              Minutas
            </Link>
          )}

          {/* 12 — NEXUS */}
          {(isAdmin || can('ver_nexus')) && (
            <NexusLink navLinkClass={navLinkClass} handleNavClick={handleNavClick} userEmail={user?.email} isAdmin={isAdmin} />
          )}

          {/* 13 — Checklists */}
          {can('ver_checklists') && (
            <Link to="/checklists" onClick={handleNavClick} className={navLinkClass('/checklists')}>
              <ClipboardCheck className="w-[18px] h-[18px]" />
              Checklists
            </Link>
          )}

          {/* 14 — Calendario */}
          {can('ver_calendario') && (
            <Link to="/calendario" onClick={handleNavClick} className={navLinkClass('/calendario')}>
              <CalendarDays className="w-[18px] h-[18px]" />
              Calendario
            </Link>
          )}

          {/* 15 — Insumos */}
          {(isAdmin || can('ver_insumos')) && (
            <Link to="/insumos" onClick={handleNavClick} className={navLinkClass('/insumos')}>
              <Package className="w-[18px] h-[18px]" />
              Insumos
            </Link>
          )}

          {/* 16 — Reportes */}
          {can('ver_reportes') && (
            <Link to="/reportes" onClick={handleNavClick} className={navLinkClass('/reportes')}>
              <FileText className="w-[18px] h-[18px]" />
              Reportes
            </Link>
          )}

          {/* 17 — Directorio */}
          <Link to="/directorio" onClick={handleNavClick} className={navLinkClass('/directorio')}>
            <BookUser className="w-[18px] h-[18px]" />
            Directorio
          </Link>

          {/* 18 — Accesos */}
          {isAdmin && (
            <Link to="/accesos" onClick={handleNavClick} className={navLinkClass('/accesos')}>
              <Lock className="w-[18px] h-[18px]" />
              Accesos
            </Link>
          )}

          {/* 19 — Auditoría */}
          {isAdmin && (
            <Link to="/auditoria" onClick={handleNavClick} className={navLinkClass('/auditoria')}>
              <ShieldAlert className="w-[18px] h-[18px]" />
              Auditoría
            </Link>
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