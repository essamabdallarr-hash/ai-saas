import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useI18n } from '@/i18n';
import { login } from '@/lib/api';
import type { AuthSession } from '@/lib/useAuth';
import type { LoginResponse } from '@/lib/types';

type Mode = 'admin' | 'client';

export function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const [mode, setMode] = useState<Mode>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      const me = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${res.token}` },
      }).then((r) => r.json() as Promise<LoginResponse>);
      onLogin({ user: me.user, tenant: me.tenant ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.loginFailed);
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
      if (!res.ok) throw new Error(data.error ?? t.login.devLoginFailed);
      localStorage.setItem('token', data.token);
      onLogin({ user: data.user, tenant: data.tenant ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.devLoginFailed);
    } finally {
      setBusy(false);
    }
  }

  const isDev = import.meta.env.VITE_DEV_AUTH_ENABLED === 'true';

  return (
    <div className="flex min-h-screen" style={{ flexDirection: isRtl ? 'row' : 'row-reverse' }}>
      {/* Left/Right decorative area */}
      <div
        className="relative hidden w-[34%] items-center justify-center overflow-hidden bg-[#EAF8F3] md:flex"
        style={{ minHeight: '100vh' }}
      >
        {/* Decorative lines */}
        <div className="absolute left-4 top-12 h-[180px] w-2 rounded-full bg-brand-500 opacity-60" />
        <div className="absolute right-8 top-10 h-[120px] w-[1px] rounded-full bg-brand-300 opacity-40" />
        <div className="absolute bottom-16 left-12 h-[1px] w-[120px] rounded-full bg-[#111111] opacity-20" />

        <div className="relative z-10 text-center px-8">
          <p className="text-[14px] text-brand-700 font-medium mb-2">{t.login.welcomeTitle}</p>
          <h2 className="text-[46px] font-bold text-[#111111] leading-tight">
            {t.login.welcomeSubtitle}
          </h2>
        </div>
      </div>

      {/* Form area */}
      <div className="flex w-full items-center justify-center bg-white md:w-[66%]" style={{ minHeight: '100vh' }}>
        <div className="w-full max-w-[520px] px-6">
          {/* Logo */}
          <div className="mb-6 flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
              <ShieldCheck className="h-6 w-6 text-brand-500" />
            </span>
            <span className="text-[16px] font-bold text-[#111111]">Universal AI Agent</span>
          </div>

          <h1 className="text-[30px] font-bold text-[#111111]" style={{ textAlign: isRtl ? 'right' : 'left' }}>
            {t.login.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#667085]" style={{ textAlign: isRtl ? 'right' : 'left' }}>
            {t.login.subtitle}
          </p>

          {/* Portal tabs */}
          <div className="mt-6 mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[#F2F4F7] p-1">
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === 'admin' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#667085] hover:text-[#111111]'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              {t.login.adminPortal}
            </button>
            <button
              type="button"
              onClick={() => setMode('client')}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === 'client' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#667085] hover:text-[#111111]'
              }`}
            >
              {t.login.clientPortal}
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#475467]" style={{ textAlign: isRtl ? 'right' : 'left' }}>
                {t.login.emailLabel}
              </span>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'admin' ? 'owner@demo.local' : 'admin@demo.local'}
                  className="w-full rounded-lg border border-[#D0D5DD] bg-[#F4F7FB] py-2.5 pl-3 pr-10 text-[13px] text-[#111111] placeholder:text-[#98A2B3] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12"
                  style={{ height: 44 }}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#475467]" style={{ textAlign: isRtl ? 'right' : 'left' }}>
                {t.login.passwordLabel}
              </span>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'admin' ? 'Owner@123' : 'Admin@123'}
                  className="w-full rounded-lg border border-[#D0D5DD] bg-[#F4F7FB] py-2.5 pl-10 pr-10 text-[13px] text-[#111111] placeholder:text-[#98A2B3] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12"
                  style={{ height: 44 }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-[#667085]"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  )}
                </button>
              </div>
            </label>

            {error && <p className="text-[13px] text-danger-500">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-lg bg-brand-500 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50"
              style={{ height: 42, borderRadius: 5 }}
            >
              {busy ? t.login.signingIn : t.login.signIn}
            </button>
          </form>

          {isDev && (
            <button
              type="button"
              onClick={devLogin}
              disabled={busy}
              className="mt-3 w-full rounded-lg border border-[#D0D5DD] py-2 text-[12px] text-[#667085] transition-colors hover:bg-[#F9FAFB]"
            >
              {t.login.devLogin}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
