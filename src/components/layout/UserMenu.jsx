import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { X, Camera, User } from 'lucide-react';
import { toast } from 'sonner';

function getInitials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || 'U';
}

async function uploadAvatar(email, file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${email.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) throw new Error('No se pudo subir la foto: ' + error.message);
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export default function UserMenu() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nombreDraft, setNombreDraft] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Mismo patrón usado en Nexus.tsx, Insumos.tsx, ReportarProblema.tsx, etc.
  const nombreMetadata = user?.user_metadata?.nombre || user?.email || 'Usuario';

  // Fila propia en user_permissions (existe aunque el admin no aparezca en el listado de Accesos)
  const { data: miPerfil } = useQuery({
    queryKey: ['miPerfil', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase.from('user_permissions').select('nombre, avatar_url').eq('user_email', user.email).maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });

  const nombre = miPerfil?.nombre || nombreMetadata;
  const avatarUrl = miPerfil?.avatar_url || null;
  const iniciales = getInitials(nombre);

  const openModal = () => {
    setNombreDraft(nombre);
    setAvatarFile(null);
    setAvatarPreview(null);
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) finalAvatarUrl = await uploadAvatar(user.email, avatarFile);

      // Upsert — si el admin aún no tiene fila en user_permissions, se crea aquí sin tocar permisos.
      const { error } = await supabase
        .from('user_permissions')
        .upsert({ user_email: user.email, nombre: nombreDraft, avatar_url: finalAvatarUrl, role: 'admin' }, { onConflict: 'user_email' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['miPerfil', user?.email] });
      toast.success('Perfil actualizado');
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2.5 pl-3 border-l border-slate-200 hover:opacity-80 transition-opacity"
        title="Editar mi perfil"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={nombre} className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {iniciales}
          </div>
        )}
        <span className="hidden md:block text-sm font-semibold text-slate-700 truncate max-w-[140px]">
          {nombre}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <User className="w-4 h-4" /> Mi perfil
              </h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {(avatarPreview || avatarUrl) ? (
                    <img src={avatarPreview || avatarUrl} alt={nombre} className="w-16 h-16 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                      <span className="text-lg font-bold text-white">{iniciales}</span>
                    </div>
                  )}
                  <label htmlFor="mi-avatar-input" className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors">
                    <Camera className="w-3 h-3 text-white" />
                  </label>
                  <input id="mi-avatar-input" type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)); }
                    }} />
                </div>
                <div>
                  <label htmlFor="mi-avatar-input" className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer underline underline-offset-2">
                    Cambiar foto
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">Se muestra arriba a la derecha del sistema</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Nombre completo</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  value={nombreDraft}
                  onChange={e => setNombreDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Correo</label>
                <p className="text-sm text-slate-500 px-3 py-2 bg-slate-50 rounded-md border border-slate-200">{user?.email}</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
                Cancelar
              </button>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
