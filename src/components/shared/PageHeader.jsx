import React from 'react';
import { Plus } from 'lucide-react';

export default function PageHeader({ title, subtitle, actionLabel, onAction }) {
  // Estilo de botón consistente con el resto del sistema RCMA
  const btnPrimary = "inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-500 font-medium mt-1 italic">
            {subtitle}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <button 
          onClick={onAction}
          className={btnPrimary}
        >
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}