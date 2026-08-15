import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Tenant, User } from './types';

export interface AuthSession {
  user: User;
  tenant: Tenant | null;
}

/**
 * خطاف المصادقة — يقرأ /auth/me عند التحميل ويمدّد الجلسة حتى تسجيل الخروج.
 * يوجّه App لبوابة Super Admin أو مساحة العميل حسب الدور.
 */
export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api<AuthSession>('/auth/me')
      .then(setSession)
      .catch(() => {
        localStorage.removeItem('token');
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setSession(null);
  }, []);

  return { session, setSession, loading, logout };
}
