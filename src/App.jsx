import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import PageNotFound from './lib/PageNotFound';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Checklists from '@/pages/Checklists';
import ChecklistDetail from '@/pages/ChecklistDetail';
import Anteproyectos from '@/pages/Anteproyectos';
import Tickets from '@/pages/Tickets';
import Reports from '@/pages/Reports';
import UserManagement from '@/pages/UserManagement';
import Accesos from '@/pages/Accesos';
import Pendientes from '@/pages/Pendientes';
import CalendarioMantenimiento from '@/pages/CalendarioMantenimiento';

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

// ─── Página establecer contraseña ─────────────────────────────────────────────
function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const token = params.get('token') || params.get('access_token');
    const type  = params.get('type');

    if (token && (type === 'invite' || type === 'recovery')) {
      supabase.auth.verifyOtp({
        token_hash: token,
        type: type === 'invite' ? 'invite' : 'recovery',
      })
        .then(({ error }) => {
          if (error) {
            setError('El link de invitación es inválido o expiró. Pide uno nuevo.');
          } else {
            setVerified(true);
          }
          setVerifying(false);
        });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setVerified(true);
        } else {
          setError('No se encontró un link válido. Usa el enlace del correo de invitación.');
        }
        setVerifying(false);
      });
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6)  { setError('Mínimo 6 caracteres'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setSuccess(true);
    setLoading(false);
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full max-w-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">¡Contraseña establecida!</h2>
          <p className="text-sm text-slate-500 mb-6">Ya puedes iniciar sesión con tu correo y contraseña.</p>
          <a href="/" className="block w-full py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors text-center">
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
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Sistema RCMA</h1>
          <p className="text-sm text-slate-500 mt-1">Establece tu contraseña de acceso</p>
        </div>
        {error && !verified ? (
          <div className="text-center">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{error}</p>
            <a href="/" className="text-sm text-slate-600 underline">Volver al inicio</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nueva contraseña</label>
              <input type="password" required className={inputClass} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirmar contraseña</label>
              <input type="password" required className={inputClass} value={confirm}
                onChange={e => setConfirm(e.target.value)} placeholder="Repite tu contraseña" />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !verified}
              className="w-full py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
              {loading ? 'Guardando...' : 'Establecer contraseña'}
            </button>
          </form>
        )}
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
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Sistema RCMA</h1>
          <p className="text-sm text-slate-500 mt-1">Coordinación de Obras</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo electrónico</label>
            <input id="email" type="email" required autoComplete="email" className={inputClass}
              value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase mb-1">Contraseña</label>
            <input id="password" type="password" required autoComplete="current-password" className={inputClass}
              value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Interceptor de tokens en el hash ────────────────────────────────────────
function AuthHashHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;

    if (hash.includes('type=recovery') || hash.includes('type=invite')) {
      navigate(`/reset-password${hash}`, { replace: true });
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}

// ─── App autenticada ──────────────────────────────────────────────────────────
function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/reset-password" element={<SetPasswordPage />} />
      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <Route element={<AppLayout />}>
          <Route path="/"                  element={<Dashboard />} />
          <Route path="/tickets"           element={<Tickets />} />
          <Route path="/proyectos"         element={<Projects />} />
          <Route path="/proyectos/:id"     element={<ProjectDetail />} />
          <Route path="/checklists"        element={<Checklists />} />
          <Route path="/checklists/:id"    element={<ChecklistDetail />} />
          <Route path="/anteproyectos"     element={<Anteproyectos />} />
          <Route path="/reportes"          element={<Reports />} />
          <Route path="/usuarios"          element={<UserManagement />} />
          <Route path="/accesos"           element={<Accesos />} />
          <Route path="/pendientes"        element={<Pendientes />} />
          <Route path="/calendario"        element={<CalendarioMantenimiento />} />
          <Route path="/login"             element={<Navigate to="/" replace />} />
          <Route path="*"                  element={<PageNotFound />} />
        </Route>
      )}
    </Routes>
  );
}

// ─── Raíz ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router>
          <AuthHashHandler />
          <AuthenticatedApp />
          <Toaster richColors position="top-right" />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
