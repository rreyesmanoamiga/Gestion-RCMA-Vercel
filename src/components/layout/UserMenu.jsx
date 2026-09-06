import React from 'react';
import { useAuth } from '@/lib/AuthContext';

function getInitials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || 'U';
}

export default function UserMenu() {
  const { user } = useAuth();
  // Mismo patrón usado en Nexus.tsx, Insumos.tsx, ReportarProblema.tsx, etc.
  const nombre = user?.user_metadata?.nombre || user?.email || 'Usuario';
  const iniciales = getInitials(nombre);

  return (
    <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
      <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
        {iniciales}
      </div>
      <span className="hidden md:block text-sm font-semibold text-slate-700 truncate max-w-[140px]">
        {nombre}
      </span>
    </div>
  );
}
