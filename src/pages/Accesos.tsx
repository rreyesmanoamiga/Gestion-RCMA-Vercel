import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { PERMISSIONS, PERMISSION_GROUPS, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { Lock, UserPlus, Mail, Pencil, X, Trash2, ShieldCheck, Users, Search, User, Building2, MapPin, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import { COLEGIOS, TERRITORIOS, getColegiosByTerritorio } from '@/lib/colegios';

const cardClass  = 'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden';
const btnPrimary = 'px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors';
const btnDanger  = 'px-4 py-2 border border-red-200 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2';
const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none';


interface PermRecord {
  id:         string;
  user_email: string;
  role?:      string;
  nombre?:    string;
  puesto?:    string;
  territorio?: string;
  colegio?:   string;
  [key: string]: unknown;
}

interface EditingUser {
  email:      string;
  nombre:     string;
  puesto:     string;
  territorio: string;
  colegio:    string;
  permsId:    string | null;
  perms:      Record<string, boolean>;
}

interface PermissionEditorProps {
  perms:    Record<string, boolean>;
  onChange: (perms: Record<string, boolean>) => void;
}

function PermissionEditor({ perms, onChange }: PermissionEditorProps) {
  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map(group => (
        <div key={group.label} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{group.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.permissions.map(perm => (
              <label key={perm} className="flex items-center gap-3 cursor-pointer group">
                <div className="relative inline-flex items-center">
                  <input type="checkbox" className="sr-only peer"
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

export default function Accesos() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite]   = useState(false);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [inviting, setInviting]       = useState(false);

  // Campos del formulario de invitación
  const [inviteEmail,      setInviteEmail]      = useState('');
  const [inviteNombre,     setInviteNombre]     = useState('');
  const [invitePuesto,     setInvitePuesto]     = useState('');
  const [inviteTerritorio, setInviteTerritorio] = useState('');
  const [inviteColegio,    setInviteColegio]    = useState('');
  const [invitePerms,      setInvitePerms]      = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS);

  const { data: rawPerms = [] } = useQuery({
    queryKey: ['userPermissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('*');
      if (error) throw error;
      return data;
    },
  });

  const allPerms     = rawPerms as unknown as PermRecord[];
  const nonAdminUsers = useMemo(() => allPerms.filter(p => String(p.role) !== 'admin'), [allPerms]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return nonAdminUsers;
    const q = search.toLowerCase();
    return nonAdminUsers.filter(u =>
      String(u.user_email).toLowerCase().includes(q) ||
      String(u.nombre ?? '').toLowerCase().includes(q) ||
      String(u.puesto ?? '').toLowerCase().includes(q) ||
      String(u.colegio ?? '').toLowerCase().includes(q)
    );
  }, [nonAdminUsers, search]);

  // ── Update permisos + datos del usuario ───────────────────────────────────
  const updatePermsMutation = useMutation({
    mutationFn: async ({ email, perms, nombre, puesto, territorio, colegio }: {
      email: string; perms: Record<string, boolean>;
      nombre: string; puesto: string; territorio: string; colegio: string;
    }) => {
      const { error } = await supabase
        .from('user_permissions')
        .update({ ...perms, nombre, puesto, territorio, colegio })
        .eq('user_email', email);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success('Usuario actualizado');
      setEditingUser(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  });

  // ── Revocar acceso ─────────────────────────────────────────────────────────
  const deletePermsMutation = useMutation({
    mutationFn: async (email: string) => {
      await supabase.functions.invoke('delete-user', { body: { email } });
      const { error } = await supabase.from('user_permissions').delete().eq('user_email', email);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success('Acceso revocado');
      setRevokeEmail(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Error al revocar'),
  });

  // ── Invitar usuario ────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_email:  inviteEmail,
          nombre:      inviteNombre,
          puesto:      invitePuesto,
          territorio:  inviteTerritorio,
          colegio:     inviteColegio,
          ...invitePerms,
        }, { onConflict: 'user_email' });

      if (error) throw new Error(error.message);

      supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, permissions: invitePerms },
      }).catch(() => {});

      await qc.invalidateQueries({ queryKey: ['userPermissions'] });
      toast.success(`Invitación enviada a ${inviteEmail}`);
      resetInviteForm();
      setShowInvite(false);
    } catch (err: unknown) {
      toast.error('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setInviting(false);
    }
  };

  const resetInviteForm = () => {
    setInviteEmail(''); setInviteNombre(''); setInvitePuesto('');
    setInviteTerritorio(''); setInviteColegio('');
    setInvitePerms(DEFAULT_PERMISSIONS);
  };

  const openEdit = (u: PermRecord) => {
    setEditingUser({
      email:      String(u.user_email),
      nombre:     String(u.nombre ?? ''),
      puesto:     String(u.puesto ?? ''),
      territorio: String(u.territorio ?? ''),
      colegio:    String(u.colegio ?? ''),
      permsId:    u.id ?? null,
      perms:      { ...(u as Record<string, boolean>) },
    });
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    updatePermsMutation.mutate({
      email:      editingUser.email,
      perms:      editingUser.perms,
      nombre:     editingUser.nombre,
      puesto:     editingUser.puesto,
      territorio: editingUser.territorio,
      colegio:    editingUser.colegio,
    });
  };

  const closeModal = () => { setShowInvite(false); setEditingUser(null); };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
      <PageHeader
        title="Accesos"
        subtitle="Gestiona quién puede entrar y qué puede hacer en el sistema"
        actionLabel="Invitar Usuario"
        onAction={() => { resetInviteForm(); setShowInvite(true); }}
      />

      {/* ── Tabla de Usuarios ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-tight shrink-0">
            <Users className="w-4 h-4 text-slate-400" />
            Usuarios con Acceso ({nonAdminUsers.length})
          </h2>
          {/* Buscador */}
          {nonAdminUsers.length > 0 && (
            <div className="relative sm:ml-auto w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, correo o colegio..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {nonAdminUsers.length === 0 ? (
          <div className="py-12 text-center">
            <Lock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400 italic">
              No hay usuarios invitados. Usa el botón "Invitar Usuario" para agregar accesos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Header tabla */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre / Correo</div>
              <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Puesto</div>
              <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Territorio / Colegio</div>
              <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permisos Activos</div>
              <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-400">No se encontraron usuarios para "{search}"</p>
                </div>
              ) : (
                filteredUsers.map(u => {
                  const activePerms = Object.keys(PERMISSIONS).filter(k => u[k]);
                  const initials = (u.nombre ? String(u.nombre) : String(u.user_email)).slice(0, 2).toUpperCase();
                  return (
                    <div key={u.id} className="px-4 sm:px-5 py-3 sm:py-4 hover:bg-slate-50/50 transition-colors">
                      {/* Mobile card */}
                      <div className="md:hidden space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-white">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{String(u.nombre || u.user_email)}</p>
                              <p className="text-xs text-slate-500 truncate">{String(u.user_email)}</p>
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => openEdit(u)} className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setRevokeEmail(String(u.user_email))} className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {u.puesto && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{String(u.puesto)}</span>}
                          {u.territorio && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{String(u.territorio)}</span>}
                          {u.colegio && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{String(u.colegio)}</span>}
                        </div>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">
                          {activePerms.length} permiso{activePerms.length !== 1 ? 's' : ''} activo{activePerms.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Desktop grid */}
                      <div className="hidden md:grid grid-cols-12 gap-3 items-center">
                        {/* Nombre / Correo */}
                        <div className="col-span-3 flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-white">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{String(u.nombre || '—')}</p>
                            <p className="text-[11px] text-slate-400 truncate">{String(u.user_email)}</p>
                          </div>
                        </div>
                        {/* Puesto */}
                        <div className="col-span-2">
                          <p className="text-sm text-slate-700 truncate">{String(u.puesto || '—')}</p>
                        </div>
                        {/* Territorio / Colegio */}
                        <div className="col-span-2">
                          <p className="text-sm font-semibold text-slate-800">{String(u.territorio || '—')}</p>
                          <p className="text-[11px] text-slate-400">{String(u.colegio || '—')}</p>
                        </div>
                        {/* Permisos */}
                        <div className="col-span-3">
                          <div className="flex flex-wrap gap-1">
                            {activePerms.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">Sin permisos</span>
                            ) : activePerms.length <= 3 ? (
                              activePerms.map(p => (
                                <span key={p} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                  {PERMISSIONS[p]?.split(' ').slice(0, 2).join(' ')}
                                </span>
                              ))
                            ) : (
                              <>
                                {activePerms.slice(0, 2).map(p => (
                                  <span key={p} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    {PERMISSIONS[p]?.split(' ').slice(0, 2).join(' ')}
                                  </span>
                                ))}
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  +{activePerms.length - 2} más
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Acciones */}
                        <div className="col-span-2 flex gap-2 justify-end">
                          <button onClick={() => openEdit(u)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                            <Pencil className="w-3 h-3" /> Editar
                          </button>
                          <button onClick={() => setRevokeEmail(String(u.user_email))} className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Permisos disponibles ──────────────────────────────────────────── */}
      <div className={cardClass}>
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-tight">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Permisos Disponibles
          </h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PERMISSION_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{group.label}</p>
                <ul className="space-y-1">
                  {group.permissions.map(perm => (
                    <li key={perm} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      {PERMISSIONS[perm]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modal — Invitar usuario ────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Invitar nuevo usuario
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <form id="invite-form" onSubmit={handleInvite}>
                {/* Datos del usuario */}
                <div className="space-y-4 mb-6">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del usuario</p>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Nombre completo</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" className={`${inputClass} pl-10`} placeholder="Ej. Juan Pérez García"
                        value={inviteNombre} onChange={e => setInviteNombre(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Correo institucional *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" required className={`${inputClass} pl-10`} placeholder="ejemplo@organizacion.com"
                        value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Puesto</label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" className={`${inputClass} pl-10`} placeholder="Ej. Administrador, Director de Obras"
                        value={invitePuesto} onChange={e => setInvitePuesto(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Territorio</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select className={`${inputClass} pl-10 bg-white`}
                          value={inviteTerritorio} onChange={e => { setInviteTerritorio(e.target.value); setInviteColegio(''); }}>
                          <option value="">Seleccionar...</option>
                          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Colegio</label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select className={`${inputClass} pl-10 bg-white`} disabled={!inviteTerritorio}
                          value={inviteColegio} onChange={e => setInviteColegio(e.target.value)}>
                          <option value="">{inviteTerritorio ? 'Seleccionar colegio...' : 'Primero selecciona territorio'}</option>
                          {inviteTerritorio && <option value="ECO">── ECO (cubre varios colegios) ──</option>}
                          {inviteTerritorio && getColegiosByTerritorio(inviteTerritorio).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Permisos */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Privilegios del sistema</p>
                  <PermissionEditor perms={invitePerms} onChange={setInvitePerms} />
                </div>
              </form>
            </div>
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button onClick={closeModal} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors text-center">
                Cancelar
              </button>
              <button form="invite-form" type="submit" disabled={inviting} className={btnPrimary + " w-full sm:w-auto"}>
                {inviting ? 'Enviando...' : 'Enviar Invitación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal — Editar usuario + permisos ─────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 min-w-0">
                <Pencil className="w-4 h-4 shrink-0" />
                <span className="truncate text-sm">Editar: {editingUser.email}</span>
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Datos editables */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del usuario</p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Nombre completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" className={`${inputClass} pl-10`} placeholder="Nombre completo"
                      value={editingUser.nombre}
                      onChange={e => setEditingUser(prev => prev ? { ...prev, nombre: e.target.value } : null)} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Puesto</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" className={`${inputClass} pl-10`} placeholder="Puesto"
                      value={editingUser.puesto}
                      onChange={e => setEditingUser(prev => prev ? { ...prev, puesto: e.target.value } : null)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Territorio</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select className={`${inputClass} pl-10 bg-white`}
                        value={editingUser.territorio}
                        onChange={e => setEditingUser(prev => prev ? { ...prev, territorio: e.target.value, colegio: '' } : null)}>
                        <option value="">Seleccionar...</option>
                        {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide">Colegio</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select className={`${inputClass} pl-10 bg-white`} disabled={!editingUser.territorio}
                        value={editingUser.colegio}
                        onChange={e => setEditingUser(prev => prev ? { ...prev, colegio: e.target.value } : null)}>
                        <option value="">{editingUser.territorio ? 'Seleccionar colegio...' : 'Primero selecciona territorio'}</option>
                        {editingUser.territorio && <option value="ECO">── ECO (cubre varios colegios) ──</option>}
                        {editingUser.territorio && getColegiosByTerritorio(editingUser.territorio).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Permisos */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Privilegios del sistema</p>
                <PermissionEditor
                  perms={editingUser.perms}
                  onChange={perms => setEditingUser(prev => prev ? { ...prev, perms } : null)}
                />
              </div>
            </div>
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button onClick={closeModal} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors text-center">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={updatePermsMutation.isPending} className={btnPrimary + " w-full sm:w-auto"}>
                {updatePermsMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal — confirmar revocar ──────────────────────────────────────── */}
      {revokeEmail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Revocar acceso?</h2>
            <p className="text-sm text-slate-500 mt-2">
              <span className="font-semibold text-slate-700">{revokeEmail}</span> perderá todos sus permisos y acceso al sistema.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setRevokeEmail(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
                Cancelar
              </button>
              <button onClick={() => deletePermsMutation.mutate(revokeEmail)} disabled={deletePermsMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md disabled:opacity-50">
                {deletePermsMutation.isPending ? 'Revocando...' : 'Revocar Acceso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
