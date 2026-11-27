// Aviso de versión nueva.
// Antes el sistema se actualizaba solo (y recargaba la página) en cuanto se
// publicaba un cambio, y quien estaba capturando perdía lo que llevaba.
// Ahora la versión nueva queda en espera y el usuario decide cuándo actualizar.
// Si no actualiza, se aplica sola la próxima vez que abra el sistema.
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const POSPONER_MIN = 30;

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Revisa si hay versión nueva cada 5 minutos (solo avisa, no recarga)
      if (r) setInterval(() => r.update(), 5 * 60_000);
    },
  });
  const [pospuesto, setPospuesto] = useState(false);

  useEffect(() => {
    if (!pospuesto) return;
    const id = setTimeout(() => setPospuesto(false), POSPONER_MIN * 60_000);
    return () => clearTimeout(id);
  }, [pospuesto]);

  if (!needRefresh || pospuesto) return null;

  return (
    <div role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <RefreshCw className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Hay una versión nueva del sistema</p>
          <p className="text-xs text-slate-300 mt-0.5">Termina y guarda lo que estás capturando, y después actualiza. No se pierde nada guardado.</p>
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => updateServiceWorker(true)}
              className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold rounded-lg transition">
              Actualizar ahora
            </button>
            <button onClick={() => setPospuesto(true)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition">
              Más tarde
            </button>
          </div>
        </div>
        <button onClick={() => setPospuesto(true)} aria-label="Cerrar aviso" className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
