import { Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { login } from '@/lib/api';
import type { AuthSession } from '@/lib/useAuth';
import type { LoginResponse } from '@/lib/types';

type Mode = 'admin' | 'client';

/** شاشة تسجيل الدخول — تُوجّه حسب الدور إلى بوابة الإدارة أو مساحة العمل */
export function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<Mode>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      // /auth/login لا يعيد user/tenant — نعيد قراءتها عبر /auth/me
      const me = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${res.token}` },
      }).then((r) => r.json() as Promise<LoginResponse>);
      onLogin({ user: me.user, tenant: me.tenant ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  }

  async function devLogin(e: MouseEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'admin'
            ? { email: 'owner@demo.local', name: 'مالك المنصة', tenantSlug: 'demo', role: 'SUPER_ADMIN' }
            : { email: 'admin@demo.local', name: 'مدير التجربة', tenantSlug: 'demo' },
        ),
      });
      const data = (await res.json()) as LoginResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'فشل الدخول التجريبي');
      localStorage.setItem('token', data.token);
      onLogin({ user: data.user, tenant: data.tenant ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الدخول التجريبي');
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
          <h1 className="text-xl font-bold text-white">Universal AI Agent</h1>
          <p className="mt-1 text-sm text-slate-400">نظام إدارة المكالمات الصوتية والواتساب عبر الذكاء الاصطناعي</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          {/* تبديل البوابة */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'admin' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              الإدارة المركزية
            </button>
            <button
              type="button"
              onClick={() => setMode('client')}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'client' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserRound className="h-4 w-4" />
              مساحة العميل
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-300">البريد الإلكتروني</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'admin' ? 'owner@demo.local' : 'admin@demo.local'}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-300">كلمة المرور</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'admin' ? 'Owner@123' : 'Admin@123'}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </label>

            {error && <p className="text-sm text-danger-400">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <button
            type="button"
            onClick={devLogin}
            disabled={busy}
            className="mt-3 w-full rounded-lg border border-slate-700 py-2 text-xs text-slate-400 transition-colors hover:border-brand-500/40 hover:text-brand-400"
          >
            دخول تجريبي سريع (وضع التطوير)
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-500">
            {mode === 'admin' ? 'owner@demo.local / Owner@123' : 'admin@demo.local / Admin@123'}
          </p>
        </div>
      </div>
    </div>
  );
}
