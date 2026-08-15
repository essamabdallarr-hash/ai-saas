import { LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/admin/dashboard', label: 'لوحة القيادة', icon: LayoutDashboard },
  { to: '/admin/tenants', label: 'إدارة العملاء', icon: Users },
];

/** غلاف بوابة الإدارة المركزية — Dark Mode */
export function SuperAdminShell({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 ring-1 ring-brand-500/30">
            <ShieldCheck className="h-5 w-5 text-brand-400" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">الإدارة المركزية</p>
            <p className="text-[11px] text-slate-500">Super Admin · Managed Service</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-slate-800 text-white ring-1 ring-slate-700' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <button
            onClick={() => {
              onLogout();
              navigate('/');
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-danger-500/10 hover:text-danger-400"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <div className="h-full max-h-screen overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
