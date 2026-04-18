import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function PageHeader({ title, subtitle, actionLabel, onAction, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {actionLabel && onAction && (
          <Button onClick={onAction} className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}