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
    storageKey:       'ma-app-auth', // evita colisiones con otras apps en el mismo dominio
    autoRefreshToken: true,
  },
});