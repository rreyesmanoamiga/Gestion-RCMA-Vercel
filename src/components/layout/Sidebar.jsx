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
  LogOut,
  Lock,
  ClockAlert,
  CalendarDays,
  TicketCheck,
  ClipboardEdit,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';

export default function Sidebar({ isOpen, onToggle }) {
  const location    = useLocation();
  const { user }    = useAuth();
  const { can }     = usePermissions();
  const isAdmin     = user?.user_metadata?.role === 'admin';
  const isMobile    = useIsMobile();

  const handleNavClick = () => { if (isMobile) onToggle(); };
  const handleLogout   = async () => { await supabase.auth.signOut(); };

  const navLinkClass = (path) => cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
    location.pathname === path || (path !== '/' && path !== '/solicitud' && path !== '/solicitudes' && location.pathname.startsWith(path))
      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
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
              <h1 className="text-sm font-black text-sidebar-foreground leading-tight tracking-tight uppercase">
                Sistema RCMA
              </h1>
              <p className="text-[10px] font-bold text-sidebar-foreground/60 uppercase tracking-widest">
                Coordinación de Obras
              </p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Menú principal">

          {/* Dashboard — siempre visible */}
          <Link to="/" onClick={handleNavClick} className={navLinkClass('/')}>
            <LayoutDashboard className="w-[18px] h-[18px]" />
            Dashboard
          </Link>

          {/* Tickets */}
          {can('ver_tickets') && (
            <Link to="/tickets" onClick={handleNavClick} className={navLinkClass('/tickets')}>
              <TicketCheck className="w-[18px] h-[18px]" />
              Tickets Registrados
            </Link>
          )}

          {/* Proyectos */}
          {can('ver_proyectos') && (
            <Link to="/proyectos" onClick={handleNavClick} className={navLinkClass('/proyectos')}>
              <FolderKanban className="w-[18px] h-[18px]" />
              Proyectos
            </Link>
          )}

          {/* Anteproyectos */}
          {can('ver_anteproyectos') && (
            <Link to="/anteproyectos" onClick={handleNavClick} className={navLinkClass('/anteproyectos')}>
              <FolderOpen className="w-[18px] h-[18px]" />
              Anteproyectos
            </Link>
          )}

          {/* Checklists */}
          {can('ver_checklists') && (
            <Link to="/checklists" onClick={handleNavClick} className={navLinkClass('/checklists')}>
              <ClipboardCheck className="w-[18px] h-[18px]" />
              Checklists
            </Link>
          )}

          {/* Calendario */}
          {can('ver_calendario') && (
            <Link to="/calendario" onClick={handleNavClick} className={navLinkClass('/calendario')}>
              <CalendarDays className="w-[18px] h-[18px]" />
              Calendario
            </Link>
          )}

          {/* Pendientes */}
          {can('ver_pendientes') && (
            <Link to="/pendientes" onClick={handleNavClick} className={navLinkClass('/pendientes')}>
              <ClockAlert className="w-[18px] h-[18px]" />
              Pendientes
            </Link>
          )}

          {/* Solicitud de Proyecto */}
          {can('ver_solicitud_proyecto') && (
            <Link to="/solicitud" onClick={handleNavClick} className={navLinkClass('/solicitud')}>
              <ClipboardEdit className="w-[18px] h-[18px]" />
              Solicitud de Proyecto
            </Link>
          )}

          {/* Solicitudes Recibidas — solo admin */}
          {isAdmin && (
            <Link to="/solicitudes" onClick={handleNavClick} className={navLinkClass('/solicitudes')}>
              <Inbox className="w-[18px] h-[18px]" />
              Solicitudes Recibidas
            </Link>
          )}

          {/* Reportes */}
          {can('ver_reportes') && (
            <Link to="/reportes" onClick={handleNavClick} className={navLinkClass('/reportes')}>
              <FileText className="w-[18px] h-[18px]" />
              Reportes
            </Link>
          )}

          {/* Accesos — solo admin */}
          {isAdmin && (
            <Link to="/accesos" onClick={handleNavClick} className={navLinkClass('/accesos')}>
              <Lock className="w-[18px] h-[18px]" />
              Accesos
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
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
