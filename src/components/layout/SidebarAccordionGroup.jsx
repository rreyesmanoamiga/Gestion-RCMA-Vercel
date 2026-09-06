import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Grupo colapsable (acordeón) para el sidebar modular.
 * - No renderiza nada si `hidden` es true (usado cuando ningún hijo es visible por permisos).
 * - `defaultOpen` se calcula en el padre según si la ruta activa pertenece al grupo.
 * - Transición vía CSS grid-rows (sin medir alturas en JS): suave y sin "flash".
 */
export default function SidebarAccordionGroup({ label, icon: Icon, defaultOpen = false, hidden = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  if (hidden) return null;

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[10.5px] font-bold uppercase tracking-wider text-sidebar-foreground/45 hover:text-sidebar-foreground/85 hover:bg-white/[0.03] transition-colors duration-200"
      >
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-300 ease-in-out',
            open ? 'rotate-180' : 'rotate-0'
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 pt-0.5 pb-1.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
