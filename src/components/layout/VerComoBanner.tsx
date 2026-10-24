import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getAreaInfo, resumenAlcance } from '@/lib/areas';

/**
 * Franja fija mientras el administrador está en "Ver como": dice a quién está
 * viendo, qué alcance tiene, que todo es solo lectura, y permite salir.
 */
export default function VerComoBanner() {
  const { verComo, salirVerComo } = useAuth();
  const { permsRecord } = usePermissions();
  if (!verComo) return null;

  const r = (permsRecord ?? null) as Record<string, unknown> | null;
  const area = r?.area ? getAreaInfo(String(r.area))?.label ?? String(r.area) : null;
  const alcance = r
    ? resumenAlcance({ area: r.area as string, territorio: r.territorio as string, colegio: r.colegio as string }).texto
    : null;

  const salir = () => {
    salirVerComo();
    window.location.assign('/accesos');
  };

  return (
    <div className="sticky top-0 z-30 bg-amber-400 text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 lg:px-8 py-2 text-sm">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="font-bold">Viendo como {verComo.nombre || verComo.email}</span>
        <span className="text-amber-900/80">
          {[area, alcance].filter(Boolean).join(' · ')}
          {permsRecord === null && 'Este usuario no tiene permisos registrados'}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-950/10 rounded px-1.5 py-0.5">Solo lectura</span>
        <button onClick={salir}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-amber-950 text-amber-50 px-3 py-1 text-xs font-bold hover:bg-amber-900 transition-colors">
          <LogOut className="w-3.5 h-3.5" /> Salir de "Ver como"
        </button>
      </div>
    </div>
  );
}
