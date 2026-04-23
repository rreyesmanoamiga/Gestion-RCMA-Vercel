import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { db } from '@/lib/db';
import { useAuth } from '@/lib/AuthContext';
import { PERMISSIONS, PERMISSION_GROUPS, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { Users, UserPlus, ShieldCheck, Mail, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

// ─── Clases fuera del componente — se definen una sola vez ───────────────────
const cardClass  = "bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden";
const btnPrimary = "px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors";
const btnOutline = "px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2";

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface AppUser {
  id:        string;
  email:     string;
  full_name?: string;
  role?:     string;
}

interface PermRecord {
  id:         string;
  user_email: string;
  [key: string]: unknown;
}

interface EditingUser {
  email:   string;
  permsId: string | null;
  perms:   Record<string, boolean>;
}

interface PermissionEditorProps {
  perms:    Record<string, boolean>;
  onChange: (perms: Record<string, boolean>) => void;
}

// ─── PermissionEditor fuera del componente padre ─────────────────────────────
function PermissionEditor({ perms, onChange }: PermissionEditorProps) {
  return (
    <div className="space-y-6">
      {PERMISSION_GROUPS.map(group => (
        <div key={group.label} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            {group.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.permissions.map(perm => (
              <label key={perm} className="flex items-center gap-3 cursor-pointer group">
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={!!perms[perm]}
                    onChange={e => onChange({ ...perms, [perm]: e.target.checked })}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-800" />
                </div>
                <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
                  {PERMISSIONS[perm]}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite]   = useState(false);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePerms, setInvitePerms] = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS);
  const [inviting, setInviting]       = useState(false);

  const { data: rawUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: rawPerms = [] } = useQuery({
    queryKey: ['userPermissions'],
    queryFn: () => db.UserPermissions.list(),
  });

  const users   = rawUsers as unknown as AppUser[];
  const allPerms = rawPerms as unknown as PermRecord[];

  const adminUsers = useMemo(
    () => users.filter(u => u.role === 'admin'),
    [users]
  );

  const nonAdminUsers = useMemo(
    () => users.filter(u => u.role !== 'admin' && u.email !== currentUser?.email),
    [users, currentUser]
  );

  const updatePermsMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, boolean> }) =>
      db.UserPermissions.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success('Permisos actualizados');
      setEditingUser(null);
    },
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, permissions: invitePerms },
      });
      if (error) throw error;

      await db.UserPermissions.create({ user_email: inviteEmail, ...invitePerms });
      await qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success(`Invitación enviada a ${inviteEmail}`);
      setInviteEmail('');
      setInvitePerms(DEFAULT_PERMISSIONS);
      setShowInvite(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al invitar: ' + message);
    } finally {
      setInviting(false);
    }
  };

  const openEdit = (email: string) => {
    const rec = allPerms.find(p => p.user_email === email);
    setEditingUser({
      email,
      permsId: rec?.id ?? null,
      perms: rec ? { ...rec as Record<string, boolean> } : { ...DEFAULT_PERMISSIONS },
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    const { permsId, email, perms } = editingUser;
    if (permsId) {
      updatePermsMutation.mutate({ id: permsId, data: perms });
    } else {
      await db.UserPermissions.create({ user_email: email, ...perms });
      await qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success('Permisos guardados');
      setEditingUser(null);
    }
  };

  const closeModal = () => { setShowInvite(false); setEditingUser(null); };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
      <PageHeader
        title="Gestión de Usuarios"
        subtitle="Administra usuarios y permisos del Sistema RCMA"
        actionLabel="Invitar Usuario"
        onAction={() => setShowInvite(true)}
      />

      {/* Administradores */}
      <div className={cardClass}>
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-tight">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Administradores del Sistema
          </h2>
        </div>
        <div className="divide-y divide-slate-100 px-5">
          {adminUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                  <span className="text-sm font-bold text-slate-600">
                    {u.full_name?.[0] || u.email[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{u.full_name || u.email}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
              </div>
              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100 uppercase">
                Master Admin
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Usuarios invitados */}
      <div className={cardClass}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-tight">
            <Users className="w-4 h-4 text-slate-400" />
            Usuarios Invitados
          </h2>
        </div>
        <div className="px-5">
          {nonAdminUsers.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10 italic">
              No hay usuarios invitados registrados.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {nonAdminUsers.map(u => {
                const rec         = allPerms.find(p => p.user_email === u.email);
                const activePerms = rec ? Object.keys(PERMISSIONS).filter(k => rec[k]) : [];
                return (
                  <div key={u.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                        <span className="text-sm font-bold text-slate-400">
                          {u.full_name?.[0] || u.email[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{u.full_name || u.email}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        <p className="text-[10px] font-bold text-blue-600 mt-0.5 uppercase tracking-tighter">
                          {activePerms.length} permisos activos
                        </p>
                      </div>
                    </div>
                    <button onClick={() => openEdit(u.email)} className={btnOutline}>
                      <Pencil className="w-3.5 h-3.5" /> Gestionar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal — invitar o editar permisos */}
      {(showInvite || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                {showInvite
                  ? <><UserPlus className="w-4 h-4" /> Invitar nuevo usuario</>
                  : `Permisos: ${editingUser?.email}`}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {showInvite ? (
                <form id="invite-form" onSubmit={handleInvite} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wide">
                      Correo institucional
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="ejemplo@organizacion.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <PermissionEditor perms={invitePerms} onChange={setInvitePerms} />
                </form>
              ) : editingUser && (
                <PermissionEditor
                  perms={editingUser.perms}
                  onChange={perms => setEditingUser(prev => prev ? { ...prev, perms } : null)}
                />
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              {showInvite ? (
                <button form="invite-form" type="submit" disabled={inviting} className={btnPrimary}>
                  {inviting ? 'Enviando invitación...' : 'Enviar Invitación'}
                </button>
              ) : (
                <button
                  onClick={handleSaveEdit}
                  disabled={updatePermsMutation.isPending}
                  className={btnPrimary}
                >
                  {updatePermsMutation.isPending ? 'Guardando...' : 'Guardar cambios de acceso'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}