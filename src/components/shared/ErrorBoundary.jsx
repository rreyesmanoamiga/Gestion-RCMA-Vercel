// Pantalla amigable cuando una página truena (en lugar de quedarse en blanco).
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Sistema RCMA] Error en pantalla:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Al cambiar de página se limpia el error para que el resto del sistema siga funcionando
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message ?? this.state.error ?? '');
    const esVersion = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg);
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold mb-3">!</div>
          <h2 className="text-lg font-bold text-slate-900">
            {esVersion ? 'El sistema se actualizó' : 'Algo salió mal en esta pantalla'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {esVersion
              ? 'Hay una versión nueva. Recarga la página para continuar.'
              : 'Recarga la página. Si vuelve a pasar, usa "Reportar Problema" y describe qué estabas haciendo.'}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800">
              Recargar página
            </button>
            <button onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}
              className="px-4 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">
              Ir al inicio
            </button>
          </div>
          {!esVersion && msg && <p className="text-[11px] text-slate-400 mt-4 break-words">Detalle: {msg.slice(0, 200)}</p>}
        </div>
      </div>
    );
  }
}
