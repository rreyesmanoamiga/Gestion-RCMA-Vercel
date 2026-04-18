import { Toaster } from "sonner";
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
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

const AuthenticatedApp = () => {
  const { user, loading } = useAuth();

  // 1. Mostrar spinner mientras Supabase verifica la sesión
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  /**
   * MODIFICACIÓN DE EMERGENCIA:
   * Hemos comentado la validación de "!user" para que puedas acceder al sistema 
   * aunque no haya una sesión activa detectada.
   */
  /* if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-xl font-bold">Acceso no autorizado</h2>
        <p>Por favor inicia sesión para continuar.</p>
      </div>
    );
  } 
  */

  // 3. Render de la aplicación principal (AHORA ACCESIBLE SIEMPRE)
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/proyectos" element={<Projects />} />
        <Route path="/proyectos/:id" element={<ProjectDetail />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/checklists/:id" element={<ChecklistDetail />} />
        <Route path="/mantenimiento" element={<Maintenance />} />
        <Route path="/mantenimiento/:id" element={<MaintenanceDetail />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/usuarios" element={<UserManagement />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App;