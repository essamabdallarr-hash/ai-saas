import { Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { login } from '@/lib/api';
import type { AuthSession } from '@/lib/useAuth';
import type { LoginResponse } from '@/lib/types';

type Mode = 'admin' | 'client';

/** شاشة تسجيل الدخول وتوجيه المستخدم حسب نوع البوابة */
export function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<Mode>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * تسجيل الدخول الحقيقي.
   * يحتاج إلى Backend وقاعدة بيانات.
   */
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await login(email, password);

      const me = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${res.token}`,
        },
      }).then((response) => {
        if (!response.ok) {
          throw new Error('تعذر قراءة بيانات المستخدم');
        }

        return response.json() as Promise<LoginResponse>;
      });

      localStorage.setItem('token', res.token);
      localStorage.removeItem('demoMode');

      onLogin({
        user: me.user,
        tenant: me.tenant ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  }

  /**
   * تسجيل دخول تجريبي محلي.
   * لا يحتاج إلى Backend أو قاعدة بيانات.
   */
  function devLogin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const demoToken = 'demo-local-token';

      localStorage.setItem('token', demoToken);
      localStorage.setItem('demoMode', 'true');

      if (mode === 'admin') {
        const demoAdminUser = {
          id: 'demo-super-admin',
          email: 'owner@demo.local',
          name: 'مالك المنصة',
          role: 'SUPER_ADMIN',
          tenantId: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as LoginResponse['user'];

        onLogin({
          user: demoAdminUser,
          tenant: null,
        });

        return;
      }

      const demoTenant = {
        id: 'demo-tenant',
        name: 'شركة التجربة',
        slug: 'demo',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as NonNullable<LoginResponse['tenant']>;

      const demoClientUser = {
        id: 'demo-client-admin',
        email: 'admin@demo.local',
        name: 'مدير التجربة',
        role: 'TENANT_ADMIN',
        tenantId: 'demo-tenant',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as LoginResponse['user'];

      onLogin({
        user: demoClientUser,
        tenant: demoTenant,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تشغيل وضع العرض التجريبي');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 ring-1 ring-brand-500/30">
            <ShieldCheck className="h-7 w-7 text-brand-400" />
          </div>

          <h1 className="text-xl font-bold text-white">
            Universal AI Agent
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            نظام إدارة المكالمات الصوتية والواتساب عبر الذكاء الاصطناعي
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('admin');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'admin'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              الإدارة المركزية
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('client');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'client'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserRound className="h-4 w-4" />
              مساحة العميل
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-300">
                البريد الإلكتروني
              </span>

              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    mode === 'admin'
                      ? 'owner@demo.local'
                      : 'admin@demo.local'
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-300">
                كلمة المرور
              </span>

              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === 'admin'
                      ? 'Owner@123'
                      : 'Admin@123'
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </label>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-danger-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <button
            type="button"
            onClick={devLogin}
            disabled={busy}
            className="mt-3 w-full rounded-lg border border-slate-700 py-2.5 text-xs text-slate-400 transition-colors hover:border-brand-500/40 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? 'جارٍ فتح وضع العرض...'
              : 'دخول تجريبي سريع بدون Backend'}
          </button>

          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-center text-[11px] leading-5 text-amber-300">
              زر الدخول التجريبي مخصص لاستعراض النظام فقط، ولا يقوم بتنفيذ
              مكالمات أو رسائل حقيقية.
            </p>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-500">
            {mode === 'admin'
              ? 'owner@demo.local / Owner@123'
              : 'admin@demo.local / Admin@123'}
          </p>
        </div>
      </div>
    </div>
  );
}
