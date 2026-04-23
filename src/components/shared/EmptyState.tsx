import { Plus, type LucideIcon } from 'lucide-react';

const btnPrimary = "inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm active:scale-95";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = Plus,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        {Icon && <Icon className="w-8 h-8 text-slate-400" />}
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>}

      {actionLabel && onAction && (
        <button onClick={onAction} className={btnPrimary}>
          <ActionIcon className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}