import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Spinner de carga — se muestra mientras se verifica la sesión
const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({
  fallback              = <DefaultFallback />,
  unauthenticatedElement,
}) {
  // Reconciliado con AuthContext corregido — expone { user, loading, error, signOut }
  const { user, loading } = useAuth();

  // 1. Mientras Supabase verifica la sesión — mostrar spinner
  if (loading) return fallback;

  // 2. Sin sesión activa — redirigir al login (o elemento personalizado)
  if (!user) {
    return unauthenticatedElement ?? <Navigate to="/login" replace />;
  }

  // 3. Sesión verificada — renderizar la ruta protegida
  return <Outlet />;
}