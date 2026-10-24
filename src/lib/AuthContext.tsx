import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase, setSoloLectura } from './supabaseClient';
import { logAudit } from './audit';
import type { User, AuthError, AuthChangeEvent, Session } from '@supabase/supabase-js';

// 2 horas de inactividad → cierre automático de sesión
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

// Modo "Ver como": el administrador ve el sistema con la identidad de otro
// usuario (sus permisos, su colegio/territorio, su menú), en SOLO LECTURA.
// La sesión real sigue siendo la del administrador; solo cambia el `user` que
// ven las pantallas. Se guarda en sessionStorage para sobrevivir un recargar.
export interface VerComo { email: string; nombre?: string | null }
const VER_COMO_KEY = 'rcma-ver-como';
const leerVerComo = (): VerComo | null => {
  try { const v = sessionStorage.getItem(VER_COMO_KEY); return v ? JSON.parse(v) as VerComo : null; } catch { return null; }
};

interface AuthContextType {
  user: User | null;
  /** Usuario realmente autenticado (el administrador cuando está en "Ver como"). */
  realUser: User | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  verComo: VerComo | null;
  iniciarVerComo: (v: VerComo) => void;
  salirVerComo: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user:     null,
  realUser: null,
  loading:  true,
  error:    null,
  signOut:  async () => {},
  verComo:  null,
  iniciarVerComo: () => {},
  salirVerComo:   () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<AuthError | null>(null);
  const [verComoState, setVerComoState] = useState<VerComo | null>(leerVerComo);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef       = useRef<User | null>(null);
  userRef.current = user;

  const doSignOut = useCallback(async (motivo: 'manual' | 'inactividad'): Promise<void> => {
    const current = userRef.current;
    // Registrar el logout ANTES de cerrar sesión — una vez cerrada,
    // ya no hay usuario autenticado para validar el registro de auditoría.
    if (current) {
      await logAudit({
        accion: 'logout',
        modulo: 'usuarios',
        registro_id:  current.id,
        registro_ref: current.email ?? null,
        detalle: { motivo },
      });
    }
    const { error } = await supabase.auth.signOut();
    if (error) setError(error);
  }, []);

  // ── Cierre automático por inactividad (2 horas) ────────────────────────────
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        doSignOut('inactividad');
      }, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [user, doSignOut]);

  useEffect(() => {
    // Este listener SOLO sincroniza el estado de sesión (user/loading).
    // El registro de auditoría del login se hace explícitamente en el
    // formulario de inicio de sesión (App.jsx), no aquí — el evento
    // 'SIGNED_IN' puede repetirse por revalidaciones internas de Supabase
    // (llamadas a getUser(), functions.invoke(), subidas a OneDrive, etc.)
    // y no es una señal confiable de que el usuario acaba de iniciar sesión.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setError(null);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback((): Promise<void> => {
    try { sessionStorage.removeItem(VER_COMO_KEY); } catch { /* sin storage */ }
    setVerComoState(null);
    setSoloLectura(false);
    return doSignOut('manual');
  }, [doSignOut]);

  // Solo el administrador puede usar "Ver como"
  const esAdminReal = user?.user_metadata?.role === 'admin';
  const verComo = esAdminReal ? verComoState : null;
  setSoloLectura(!!verComo);

  const iniciarVerComo = useCallback((v: VerComo) => {
    if (userRef.current?.user_metadata?.role !== 'admin') return;
    // Registro en Auditoría ANTES de activar el modo (en solo lectura ya no se escribe)
    logAudit({
      accion: 'login', modulo: 'usuarios',
      registro_ref: v.email,
      detalle: { tipo: 'Ver como', usuario: v.email, nombre: v.nombre ?? null },
    }).catch(() => {});
    try { sessionStorage.setItem(VER_COMO_KEY, JSON.stringify(v)); } catch { /* sin storage */ }
    setSoloLectura(true);
    setVerComoState(v);
  }, []);

  const salirVerComo = useCallback(() => {
    try { sessionStorage.removeItem(VER_COMO_KEY); } catch { /* sin storage */ }
    setSoloLectura(false);
    setVerComoState(null);
  }, []);

  // Identidad que ven las pantallas: la del usuario elegido, sin rol de admin.
  const userVisible = React.useMemo<User | null>(() => {
    if (!user || !verComo) return user;
    return {
      ...user,
      email: verComo.email,
      role: 'authenticated',
      user_metadata: { ...user.user_metadata, role: 'user', nombre: verComo.nombre ?? verComo.email, avatar_url: null },
    } as User;
  }, [user, verComo]);

  return (
    <AuthContext.Provider value={{ user: userVisible, realUser: user, loading, error, signOut, verComo, iniciarVerComo, salirVerComo }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);