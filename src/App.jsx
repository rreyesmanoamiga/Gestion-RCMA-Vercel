import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import PageNotFound from './lib/PageNotFound';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Checklists from '@/pages/Checklists';
import ChecklistDetail from '@/pages/ChecklistDetail';
import Maintenance from '@/pages/Maintenance';
import MaintenanceDetail from '@/pages/MaintenanceDetail';
import Reports from '@/pages/Reports';
import UserManagement from '@/pages/UserManagement';

// ─── Página de login ──────────────────────────────────────────────────────────
function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
    // Si tiene éxito, onAuthStateChange en AuthContext actualizará `user`
    // y el guard de AuthenticatedApp redirigirá automáticamente al Dashboard
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-sm p-8">

        {/* Logo / título */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Sistema RCMA
          </h1>
          <p className="text-sm text-slate-500 mt-1">Coordinación de Obras</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── App autenticada ──────────────────────────────────────────────────────────
function AuthenticatedApp() {
  const { user, loading } = useAuth();

  // 1. Spinner mientras Supabase verifica la sesión
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // 2. Sin sesión — mostrar login
  if (!user) return <LoginPage />;

  // 3. Sesión activa — renderizar la app
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/"                  element={<Dashboard />} />
        <Route path="/proyectos"          element={<Projects />} />
        <Route path="/proyectos/:id"      element={<ProjectDetail />} />
        <Route path="/checklists"         element={<Checklists />} />
        <Route path="/checklists/:id"     element={<ChecklistDetail />} />
        <Route path="/mantenimiento"      element={<Maintenance />} />
        <Route path="/mantenimiento/:id"  element={<MaintenanceDetail />} />
        <Route path="/reportes"           element={<Reports />} />
        <Route path="/usuarios"           element={<UserManagement />} />
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*"      element={<PageNotFound />} />
    </Routes>
  );
}

// ─── Raíz ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router>
          <AuthenticatedApp />
          <Toaster richColors position="top-right" /> {/* dentro del Router */}
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}