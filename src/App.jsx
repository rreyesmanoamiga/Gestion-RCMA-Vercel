import React, { useState, useEffect } from 'react';
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
import Accesos from '@/pages/Accesos';

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

// ─── Página crear contraseña (invitación) ─────────────────────────────────────
function SetPasswordPage() {
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">¡Contraseña creada!</h2>
          <p className="text-sm text-slate-500 mb-6">Ya puedes iniciar sesión con tu correo y contraseña.</p>
          <a
            href="/"
            className="block w-full py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors text-center"
          >
            Ir al Sistema
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Sistema RCMA
          </h1>
          <p className="text-sm text-slate-500 mt-1">Crea tu contraseña de acceso</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Nueva contraseña
            </label>
            <input
              type="password"
              required
              className={inputClass}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Confirmar contraseña
            </label>
            <input
              type="password"
              required
              className={inputClass}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite tu contraseña"
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
            {loading ? 'Guardando...' : 'Crear contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

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
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-sm p-8">
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
  const [isInviteFlow, setIsInviteFlow] = useState(false);

  useEffect(() => {
    // Detecta si el hash del URL contiene un token de invitación
    const hash = window.location.hash;
    if (hash.includes('access_token') && hash.includes('type=invite')) {
      setIsInviteFlow(true);
    }
    // También detecta el evento de Supabase para invitaciones
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        setIsInviteFlow(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Si viene de una invitación, mostrar página de crear contraseña
  if (isInviteFlow || (user && window.location.hash.includes('type=invite'))) {
    return <SetPasswordPage />;
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/"                  element={<Dashboard />} />
        <Route path="/proyectos"         element={<Projects />} />
        <Route path="/proyectos/:id"     element={<ProjectDetail />} />
        <Route path="/checklists"        element={<Checklists />} />
        <Route path="/checklists/:id"    element={<ChecklistDetail />} />
        <Route path="/mantenimiento"     element={<Maintenance />} />
        <Route path="/mantenimiento/:id" element={<MaintenanceDetail />} />
        <Route path="/reportes"          element={<Reports />} />
        <Route path="/usuarios"          element={<UserManagement />} />
        <Route path="/accesos"           element={<Accesos />} />
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
          <Toaster richColors position="top-right" />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
