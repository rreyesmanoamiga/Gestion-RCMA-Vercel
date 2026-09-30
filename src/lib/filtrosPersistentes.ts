// Filtros que se conservan mientras el usuario se mueve DENTRO de un módulo
// (lista → detalle → regresar), y se borran en cuanto cambia a otro módulo.
// Viven en memoria: no usan base de datos ni el almacenamiento del navegador.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// clave de la pantalla → rutas que cuentan como "el mismo módulo"
const MODULOS: Record<string, (ruta: string) => boolean> = {
  proyectos: r => r === '/proyectos' || r.startsWith('/proyectos/'),
};

const guardados = new Map<string, unknown>();

export function leerFiltros<T>(clave: string): T | undefined {
  return guardados.get(clave) as T | undefined;
}

export function guardarFiltros<T>(clave: string, valor: T) {
  guardados.set(clave, valor);
}

/** Va en el layout: al salir de un módulo, olvida sus filtros. */
export function useLimpiarFiltrosAlSalir() {
  const { pathname } = useLocation();
  useEffect(() => {
    for (const [clave, pertenece] of Object.entries(MODULOS)) {
      if (!pertenece(pathname)) guardados.delete(clave);
    }
  }, [pathname]);
}
