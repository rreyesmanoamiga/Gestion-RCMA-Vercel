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
  ClipboardList,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/lib/supabaseClient';

const NAV_ITEMS = [
  { label: 'Dashboard',             path: '/',               icon: LayoutDashboard },
  { label: 'Tickets Registrados',   path: '/tickets',        icon: TicketCheck     },
  { label: 'Proyectos',             path: '/proyectos',      icon: FolderKanban    },
  { label: 'Anteproyectos',         path: '/anteproyectos',  icon: FolderOpen      },
  { label: 'Checklists',            path: '/checklists',     icon: ClipboardCheck  },
  { label: 'Calendario',            path: '/calendario',     icon: CalendarDays    },
  { label: 'Pendientes',            path: '/pendientes',     icon: ClockAlert      },
  { label: 'Solicitud de Proyecto', path: '/solicitud',      icon: ClipboardList   },
  { label: 'Reportes',              path: '/reportes',       icon: FileText        },
];

export default function Sidebar({ isOpen, onToggle }) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin  = user?.user_metadata?.role === 'admin';
  const isMobile = useIsMobile();

  const handleNavClick = () => {
    if (isMobile) onToggle();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

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
        <nav className="flex-1 p-4 space-y-1" aria-label="Menú principal">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              onClick={handleNavClick}
              className={navLinkClass(path)}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </Link>
          ))}

          {/* Solicitudes Recibidas — solo admin */}
          {isAdmin && (
            <Link
              to="/solicitudes"
              onClick={handleNavClick}
              className={navLinkClass('/solicitudes')}
            >
              <Inbox className="w-[18px] h-[18px]" />
              Solicitudes Recibidas
            </Link>
          )}

          {/* Accesos — solo admin */}
          {isAdmin && (
            <Link
              to="/accesos"
              onClick={handleNavClick}
              className={navLinkClass('/accesos')}
            >
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
