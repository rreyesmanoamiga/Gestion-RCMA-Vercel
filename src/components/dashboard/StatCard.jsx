import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, color }) {
  const colorMap = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-accent/10 text-accent',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-card-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorMap[color] || colorMap.blue)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}