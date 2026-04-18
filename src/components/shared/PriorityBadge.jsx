import React from 'react';

export default function PriorityBadge({ priority }) {
  const configs = {
    baja: { label: 'Baja', class: 'bg-slate-100 text-slate-600 border-slate-200' },
    media: { label: 'Media', class: 'bg-blue-50 text-blue-600 border-blue-200' },
    alta: { label: 'Alta', class: 'bg-orange-50 text-orange-600 border-orange-200' },
    critica: { label: 'Crítica', class: 'bg-red-50 text-red-600 border-red-200' },
  };

  const config = configs[priority?.toLowerCase()] || configs.media;

  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${config.class}`}>
      {config.label}
    </span>
  );
}