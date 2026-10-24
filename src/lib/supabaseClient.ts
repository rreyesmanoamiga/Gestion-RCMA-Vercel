/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// En Vite se usa import.meta.env en lugar de process.env
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Falla rápido al arrancar — mejor un error claro aquí que
// errores crípticos de Supabase después en cada llamada
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase.\n' +
    'Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:   true,
    storageKey:       'ma-app-auth',
    autoRefreshToken: true,
    // sessionStorage en vez de localStorage: la sesión muere al cerrar
    // el navegador/pestaña, en vez de sobrevivir indefinidamente.
    storage:          typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
});
// ─── Modo "Ver como" (solo lectura) ───────────────────────────────────────────
// Cuando el administrador ve el sistema como otro usuario, NADA se escribe:
// se bloquean insert/update/upsert/delete, rpc, funciones (correos, OneDrive,
// descargas) y subidas a Storage. Las lecturas siguen igual.
const MSG_SOLO_LECTURA = 'Modo "Ver como": solo lectura, no se guardó nada.';
let soloLectura = false;
export const setSoloLectura = (v: boolean) => { soloLectura = v; };
export const esSoloLectura = () => soloLectura;

let ultimoAviso = 0;
const avisar = () => {
  const ahora = Date.now();
  if (ahora - ultimoAviso < 1500) return;
  ultimoAviso = ahora;
  import('sonner').then(({ toast }) => toast.info(MSG_SOLO_LECTURA)).catch(() => {});
};
const respuestaBloqueada = () => {
  avisar();
  const res = { data: null, error: { message: MSG_SOLO_LECTURA, code: 'solo_lectura' }, count: null, status: 403, statusText: 'Solo lectura' };
  const encadenable: any = new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'then') return (ok: any, ko: any) => Promise.resolve(res).then(ok, ko);
      return () => encadenable;
    },
    apply() { return encadenable; },
  });
  return encadenable;
};
const ESCRITURAS = new Set(['insert', 'update', 'upsert', 'delete']);
const origFrom = supabase.from.bind(supabase);
(supabase as any).from = (tabla: string) => {
  const b: any = origFrom(tabla);
  if (!soloLectura) return b;
  return new Proxy(b, {
    get(target, k, r) {
      if (typeof k === 'string' && ESCRITURAS.has(k)) return () => respuestaBloqueada();
      const v = Reflect.get(target, k, r);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
};
const origRpc = supabase.rpc.bind(supabase);
(supabase as any).rpc = (...args: any[]) => (soloLectura ? respuestaBloqueada() : (origRpc as any)(...args));
const getterFunctions = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(supabase), 'functions')?.get;
if (getterFunctions) {
  Object.defineProperty(supabase, 'functions', {
    configurable: true,
    get() {
      const f = getterFunctions.call(supabase);
      if (!soloLectura) return f;
      return { ...f, invoke: async () => { avisar(); return { data: null, error: new Error(MSG_SOLO_LECTURA) }; } };
    },
  });
}
const origStorageFrom = supabase.storage.from.bind(supabase.storage);
(supabase.storage as any).from = (bucket: string) => {
  const s: any = origStorageFrom(bucket);
  if (!soloLectura) return s;
  return new Proxy(s, {
    get(target, k, r) {
      if (['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl'].includes(String(k)))
        return async () => { avisar(); return { data: null, error: new Error(MSG_SOLO_LECTURA) }; };
      const v = Reflect.get(target, k, r);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
};
