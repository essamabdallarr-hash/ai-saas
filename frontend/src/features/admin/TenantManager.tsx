import { Building2, KeyRound, Plus, Search, Sparkles, UserPlus, Users } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { DarkBadge, DarkCard, DarkField, DarkInput, DarkNotice } from './darkUi';
import type { TenantListItem } from '@/lib/types';

interface CreateClientPayload {
  name: string;
  slug: string;
  email: string;
  userName: string;
  password: string;
  role: 'CLIENT_ADMIN' | 'CLIENT_AGENT';
}

interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

const EMPTY: CreateClientPayload = {
  name: '',
  slug: '',
  email: '',
  userName: '',
  password: '',
  role: 'CLIENT_ADMIN',
};

function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `tenant-${Date.now()}`;
}

function tenantStatusTone(status: string): 'green' | 'red' | 'amber' | 'gray' {
  switch (status) {
    case 'ACTIVE':
      return 'green';
    case 'SUSPENDED':
      return 'red';
    case 'CANCELLED':
      return 'gray';
    default:
      return 'amber';
  }
}

/** إدارة العملاء — إنشاء مستخدم جديد مع كلمة مرور (إجبارية من هنا فقط) */
export function TenantManager() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // نموذج إنشاء العميل
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateClientPayload>(EMPTY);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // إدارة المستخدمين / كلمات المرور
  const [usersByTenant, setUsersByTenant] = useState<Record<string, TenantUser[]>>({});
  const [usersOpenFor, setUsersOpenFor] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [usersLoading, setUsersLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<TenantListItem[]>('/admin/tenants')
      .then(setTenants)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل العملاء'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants, query]);

  function patch(p: Partial<CreateClientPayload>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function createClient() {
    setNotice(null);
    if (!form.name.trim() || !form.slug.trim()) {
      setNotice({ kind: 'error', text: 'يلزم اسم العميل والـ slug' });
      return;
    }
    if (!form.email.trim() || !form.userName.trim()) {
      setNotice({ kind: 'error', text: 'يلزم بريد المستخدم واسمه' });
      return;
    }
    if (form.password.length < 8) {
      setNotice({ kind: 'error', text: 'كلمة المرور إلزامية وتجب ألا تقل عن 8 أحرف' });
      return;
    }

    setSaving(true);
    try {
      // 1) إنشاء المستأجر
      const tenant = await api<{ id: string }>('/admin/tenants', {
        method: 'POST',
        json: { name: form.name.trim(), slug: form.slug.trim(), status: 'TRIAL' },
      });
      // 2) إنشاء مستخدم مع كلمة مرور (مشفّرة في الـ Backend)
      const user = await api<{ email: string; role: string }>(`/admin/tenants/${tenant.id}/users`, {
        method: 'POST',
        json: {
          email: form.email.trim(),
          name: form.userName.trim(),
          role: form.role,
          password: form.password,
        },
      });
      setNotice({ kind: 'ok', text: `تم إنشاء العميل بنجاح — المستخدم "${user.email}" (${user.role}) وكلمة المرور مضبوطة.` });
      setForm(EMPTY);
      setCreating(false);
      load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل إنشاء العميل' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(t: TenantListItem) {
    const next = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api(`/admin/tenants/${t.id}`, { method: 'PATCH', json: { status: next } });
      load();
    } catch {
      /* تجاهل — يظهر الخطأ عبر load الحالي */
    }
  }

  async function toggleUsers(t: TenantListItem) {
    if (usersOpenFor === t.id) {
      setUsersOpenFor(null);
      return;
    }
    setUsersOpenFor(t.id);
    if (!usersByTenant[t.id]) {
      setUsersLoading(t.id);
      try {
        const users = await api<TenantUser[]>(`/admin/tenants/${t.id}/users`);
        setUsersByTenant((m) => ({ ...m, [t.id]: users }));
      } catch {
        setUsersByTenant((m) => ({ ...m, [t.id]: [] }));
      } finally {
        setUsersLoading(null);
      }
    }
  }

  async function resetPassword(tenantId: string, user: TenantUser) {
    const password = passwords[user.id] ?? '';
    if (password.length < 8) {
      setNotice({ kind: 'error', text: `كلمة المرور للمستخدم ${user.email} يجب ألا تقل عن 8 أحرف` });
      return;
    }
    try {
      await api(`/admin/tenants/${tenantId}/users/${user.id}/password`, { method: 'PUT', json: { password } });
      setPasswords((p) => ({ ...p, [user.id]: '' }));
      setNotice({ kind: 'ok', text: `أُعيد تعيين كلمة مرور ${user.email} بنجاح.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل إعادة التعيين' });
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">إدارة العملاء</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            إنشاء حسابات العملاء وإدارة باقاتهم — كلمة المرور تُعيّن هنا فقط
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Create Client
        </button>
      </header>

      {/* نموذج إنشاء العميل */}
      {creating && (
        <DarkCard
          title="إنشاء عميل جديد"
          hint="إنشاء المستأجر + مستخدم دخول بكلمة مرور (تُشفَّر في الخادم — لا تُعرض لاحقًا)"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DarkField label="اسم الشركة">
              <DarkInput
                value={form.name}
                placeholder="مثال: شركة النور للتأمين"
                onChange={(e) => patch({ name: e.target.value, slug: toSlug(e.target.value) })}
              />
            </DarkField>
            <DarkField label="Slug (معرّف فريد)">
              <DarkInput value={form.slug} dir="ltr" onChange={(e) => patch({ slug: e.target.value })} />
            </DarkField>
            <DarkField label="بريد المستخدم" hint="يُستخدم للدخول إلى مساحة العمل">
              <DarkInput type="email" value={form.email} dir="ltr" placeholder="ceo@noor.com" onChange={(e) => patch({ email: e.target.value })} />
            </DarkField>
            <DarkField label="اسم المستخدم">
              <DarkInput value={form.userName} placeholder="مثال: أحمد محمد" onChange={(e) => patch({ userName: e.target.value })} />
            </DarkField>
            <DarkField label="الدور">
              <select
                value={form.role}
                onChange={(e) => patch({ role: e.target.value as CreateClientPayload['role'] })}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              >
                <option value="CLIENT_ADMIN">مدير العميل</option>
                <option value="CLIENT_AGENT">موظف العميل</option>
              </select>
            </DarkField>
            <DarkField label="كلمة المرور (إلزامية)" hint="8 أحرف على الأقل">
              <DarkInput type="password" value={form.password} dir="ltr" placeholder="••••••••" onChange={(e) => patch({ password: e.target.value })} />
            </DarkField>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {notice && (
              <div className="mr-auto">
                <DarkNotice kind={notice.kind}>{notice.text}</DarkNotice>
              </div>
            )}
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              إلغاء
            </button>
            <button
              onClick={createClient}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-ok-600 px-4 py-2 text-sm font-semibold text-white hover:bg-ok-500 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {saving ? 'جارٍ الإنشاء...' : 'إنشاء العميل وكلمة المرور'}
            </button>
          </div>
        </DarkCard>
      )}

      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
          {error}
        </div>
      )}

      {/* البحث */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث باسم العميل أو الـ slug..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-3 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {/* الجدول */}
      <DarkCard className="overflow-x-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              {query ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء بعد — اضغط Create Client للبدء'}
            </p>
          </div>
        ) : (
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">العميل</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
                <th className="px-3 py-2 font-medium">المستخدمون</th>
                <th className="px-3 py-2 font-medium">الوكلاء</th>
                <th className="px-3 py-2 font-medium">المكالمات</th>
                <th className="px-3 py-2 font-medium">المحادثات</th>
                <th className="px-3 py-2 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((t) => (
                <Fragment key={t.id}>
                  <tr className="text-slate-300 hover:bg-slate-800/40">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {t.slug}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <DarkBadge tone={tenantStatusTone(t.status)}>{t.status}</DarkBadge>
                  </td>
                  <td className="px-3 py-3">{t._count?.users ?? 0}</td>
                  <td className="px-3 py-3">{t._count?.agents ?? 0}</td>
                  <td className="px-3 py-3">{t._count?.calls ?? 0}</td>
                  <td className="px-3 py-3">{t._count?.conversations ?? 0}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/admin/tenants/${t.id}/studio`}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Studio
                      </Link>
                      <button
                        onClick={() => toggleUsers(t)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        <Users className="h-3.5 w-3.5" />
                        المستخدمون
                      </button>
                      <button
                        onClick={() => toggleStatus(t)}
                        className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                      >
                        {t.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </div>
                  </td>
                </tr>
                {usersOpenFor === t.id && (
                  <tr className="bg-slate-900/60">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="space-y-2">
                        {usersLoading === t.id ? (
                          <p className="text-xs text-slate-500">جارٍ تحميل المستخدمين...</p>
                        ) : (usersByTenant[t.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-500">لا يوجد مستخدمون لهذا العميل — أنشئ من نموذج Create Client.</p>
                        ) : (
                          (usersByTenant[t.id] ?? []).map((u) => (
                            <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-slate-200">
                                  {u.name} <span className="text-slate-500" dir="ltr">({u.email})</span>
                                </span>
                                <span className="text-xs text-slate-500">
                                  {u.role === 'CLIENT_ADMIN' ? 'مدير العميل' : 'موظف العميل'} · {u.active ? 'نشط' : 'موقوف'}
                                </span>
                              </span>
                              <input
                                type="password"
                                dir="ltr"
                                value={passwords[u.id] ?? ''}
                                onChange={(e) => setPasswords((p) => ({ ...p, [u.id]: e.target.value }))}
                                placeholder="كلمة مرور جديدة (8+ أحرف)"
                                className="w-52 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
                              />
                              <button
                                onClick={() => resetPassword(t.id, u)}
                                className="flex items-center gap-1.5 rounded-lg bg-ok-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ok-500"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                إعادة التعيين
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </DarkCard>
    </div>
  );
}
