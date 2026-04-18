import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { db } from '@/lib/db';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PERMISSIONS, PERMISSION_GROUPS, DEFAULT_PERMISSIONS } from '@/lib/permissions';
import { Users, UserPlus, Shield, ShieldCheck, Mail, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // { email, permsId, perms }
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePerms, setInvitePerms] = useState(DEFAULT_PERMISSIONS);
  const [inviting, setInviting] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: allPerms = [] } = useQuery({
    queryKey: ['userPermissions'],
    queryFn: () => db.UserPermissions.list(),
  });

  const updatePermsMutation = useMutation({
    mutationFn: ({ id, data }) => db.UserPermissions.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['userPermissions']); toast.success('Permisos actualizados'); setEditingUser(null); },
  });

  const deletePermsMutation = useMutation({
    mutationFn: (id) => db.UserPermissions.delete(id),
    onSuccess: () => { qc.invalidateQueries(['userPermissions']); toast.success('Permisos restablecidos'); },
  });

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    await base44.users.inviteUser(inviteEmail, 'user');
    await db.UserPermissions.create({ user_email: inviteEmail, ...invitePerms });
    await qc.invalidateQueries(['userPermissions']);
    toast.success(`Invitación enviada a ${inviteEmail}`);
    setInviteEmail('');
    setInvitePerms(DEFAULT_PERMISSIONS);
    setShowInvite(false);
    setInviting(false);
  };

  const openEdit = (email) => {
    const rec = allPerms.find(p => p.user_email === email);
    setEditingUser({
      email,
      permsId: rec?.id || null,
      perms: rec ? { ...rec } : { ...DEFAULT_PERMISSIONS },
    });
  };

  const handleSaveEdit = async () => {
    const { permsId, email, perms } = editingUser;
    if (permsId) {
      updatePermsMutation.mutate({ id: permsId, data: perms });
    } else {
      await db.UserPermissions.create({ user_email: email, ...perms });
      await qc.invalidateQueries(['userPermissions']);
      toast.success('Permisos guardados');
      setEditingUser(null);
    }
  };

  const nonAdminUsers = users.filter(u => u.role !== 'admin' && u.email !== currentUser?.email);
  const adminUsers = users.filter(u => u.role === 'admin');

  const PermissionEditor = ({ perms, onChange }) => (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-sm font-semibold text-foreground mb-2">{group.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {group.permissions.map(perm => (
              <div key={perm} className="flex items-center gap-2">
                <Switch
                  checked={!!perms[perm]}
                  onCheckedChange={v => onChange({ ...perms, [perm]: v })}
                />
                <span className="text-sm text-muted-foreground">{PERMISSIONS[perm]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Gestión de Usuarios"
        subtitle="Administra usuarios y sus permisos en la plataforma"
        actionLabel="Invitar Usuario"
        onAction={() => setShowInvite(true)}
      />

      {/* Admins */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Administradores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {adminUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{u.full_name?.[0] || u.email[0].toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <Badge className="bg-primary/10 text-primary border-0"><Shield className="w-3 h-3 mr-1" />Admin</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Regular Users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-muted-foreground" />
            Usuarios Invitados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nonAdminUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay usuarios invitados aún.</p>
          ) : (
            <div className="space-y-2">
              {nonAdminUsers.map(u => {
                const rec = allPerms.find(p => p.user_email === u.email);
                const activePerms = rec ? Object.keys(PERMISSIONS).filter(k => rec[k]) : [];
                return (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-bold text-muted-foreground">{u.full_name?.[0] || u.email[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.full_name || u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{activePerms.length} permiso(s) activo(s)</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(u.email)}>
                        <Pencil className="w-3 h-3 mr-1" />Permisos
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" />Invitar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-5">
            <div>
              <Label>Correo electrónico *</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  className="pl-9"
                  placeholder="usuario@ejemplo.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-3">Permisos del usuario</p>
              <PermissionEditor perms={invitePerms} onChange={setInvitePerms} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancelar</Button>
              <Button type="submit" disabled={inviting}>{inviting ? 'Enviando...' : 'Enviar Invitación'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Permisos de {editingUser.email}</DialogTitle>
            </DialogHeader>
            <PermissionEditor
              perms={editingUser.perms}
              onChange={perms => setEditingUser(prev => ({ ...prev, perms }))}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit}>Guardar Permisos</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}