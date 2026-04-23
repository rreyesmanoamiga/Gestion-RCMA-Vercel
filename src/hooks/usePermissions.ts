import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/lib/AuthContext';
import { hasPermission } from '@/lib/permissions';

export function usePermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: permsRecord } = useQuery({
    queryKey: ['userPermissions', user?.email],
    queryFn: async () => {
      if (!user?.email || isAdmin) return null;
      const results = await db.UserPermissions.filter({ user_email: user.email });
      return results?.[0] ?? null;
    },
    enabled: !!user && !isAdmin,
  });

  const can = useCallback(
    (permission: string): boolean =>
      isAdmin || hasPermission(permsRecord as Record<string, boolean> | null, permission),
    [isAdmin, permsRecord]
  );

  return { can, isAdmin, permsRecord };
}