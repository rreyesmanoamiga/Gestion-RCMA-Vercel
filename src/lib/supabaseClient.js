import { createClient } from '@supabase/supabase-js';

// En Vite, se usa import.meta.env en lugar de process.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Error: No se encontraron las variables de entorno de Supabase. Revisa tu archivo .env o la configuración en Vercel.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);