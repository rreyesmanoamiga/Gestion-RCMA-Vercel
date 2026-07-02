import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { logAudit } from './audit';
import type { User, AuthError, AuthChangeEvent, Session } from '@supabase/supabase-js';

// 2 horas de inactividad → cierre automático de sesión
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user:    null,
  loading: true,
  error:   null,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<AuthError | null>(null);
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

  const signOut = useCallback((): Promise<void> => doSignOut('manual'), [doSignOut]);

  return (
    <AuthContext.Provider value={{ user, loading, error, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);