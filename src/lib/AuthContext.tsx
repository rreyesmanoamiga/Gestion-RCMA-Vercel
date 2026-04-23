import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { User, AuthError, AuthChangeEvent, Session } from '@supabase/supabase-js';

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

  useEffect(() => {
    // onAuthStateChange dispara INITIAL_SESSION al montar
    // por lo que getSession() es redundante y genera race condition
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setError(null);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) setError(error);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);