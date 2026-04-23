import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-500">
      <h1 className="text-6xl font-black text-slate-900">404</h1>
      <p className="text-lg font-medium">Página no encontrada</p>
      <p className="text-sm">La ruta que buscas no existe en el sistema.</p>
      <Link
        to="/"
        className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors"
      >
        Volver al Dashboard
      </Link>
    </div>
  );
}