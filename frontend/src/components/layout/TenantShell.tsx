import { Bot, Home, Inbox, LayoutDashboard, LogOut, MessageCircle, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { UsageLedger } from '@/lib/types';
import { formatMinutes } from '@/lib/format';

const navItems = [
  { to: '/workspace', label: 'الرئيسية', icon: Home },
  { to: '/workspace/inbox', label: 'البريد الوارد المباشر', icon: Inbox },
  { to: '/workspace/reports', label: 'التقارير الديناميكية', icon: LayoutDashboard },
  { to: '/workspace/agent', label: 'باني الوكيل', icon: Bot },
  { to: '/workspace/whatsapp', label: 'الواتساب', icon: MessageCircle },
];

/** غلاف مساحة عمل العميل — Light Mode نظيف */
export function TenantShell({ onLogout }: { onLogout: () => void }) {
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [usageError, setUsageError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<UsageLedger>('/tenants/me/usage?month=current')
      .then(setUsage)
      .catch(() => setUsageError(true));
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 ring-1 ring-brand-100">
            <Bot className="h-5 w-5 text-brand-600" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">وكيلك الذكي</p>
            <p className="text-[11px] text-slate-400">مساحة العميل</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* استهلاك الباقة */}
        <div className="border-t border-slate-100 p-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Wallet className="h-3.5 w-3.5" />
              استهلاك الباقة هذا الشهر
            </div>
            {usageError ? (
              <p className="mt-1 text-xs text-slate-400">غير متاح مؤقتًا</p>
            ) : (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>دقائق الصوت</span>
                  <span className="font-semibold">{usage ? formatMinutes(usage.voiceMinutes) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>رسائل واتساب</span>
                  <span className="font-semibold">{usage?.whatsappMsgs ?? 0}</span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              onLogout();
              navigate('/');
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-slate-50">
        <div className="h-full max-h-screen overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
