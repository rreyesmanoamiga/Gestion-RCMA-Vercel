import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Revisa actualizaciones cada 60 segundos
      if (r) {
        setInterval(() => r.update(), 60_000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-4">
      <RefreshCw className="w-4 h-4 text-teal-400 shrink-0" />
      <span className="text-sm font-semibold">Nueva versión disponible</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="ml-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold rounded-lg transition"
      >
        Actualizar ahora
      </button>
    </div>
  );
}
