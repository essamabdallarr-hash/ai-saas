import { Bot, LayoutDashboard, LogOut, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';

export function SuperAdminShell({ onLogout }: { onLogout: () => void }) {
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const navigate = useNavigate();

  const navItems = [
    { to: '/admin/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { to: '/admin/tenants', label: t.nav.tenants, icon: Users },
    { to: '/admin/agent', label: t.tenantNav.agent, icon: Bot },
    { to: '/admin/whatsapp', label: t.tenantNav.whatsapp, icon: MessageCircle },
  ];

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]" style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
      <aside
        className="flex w-[185px] shrink-0 flex-col border-b-0 bg-white"
        style={{ [isRtl ? 'borderLeft' : 'borderRight']: '1px solid #E5E7EB', height: '100vh', position: 'fixed', [isRtl ? 'right' : 'left']: 0, top: 0, zIndex: 30 }}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100">
            <ShieldCheck className="h-5 w-5 text-brand-500" />
          </span>
          <div>
            <p className="text-[13px] font-bold text-[#111111]">Apollo io</p>
            <p className="text-[10px] text-[#98A2B3]">{t.adminShell.brandSub}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[#EDF8F4] text-brand-500'
                    : 'text-[#475467] hover:bg-[#F4FBF8] hover:text-brand-500'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <button
            onClick={() => { onLogout(); navigate('/'); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#667085] transition-colors hover:bg-danger-50 hover:text-danger-500"
          >
            <LogOut className="h-4 w-4" />
            {t.adminShell.logout}
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-hidden" style={{ [isRtl ? 'marginRight' : 'marginLeft']: 185 }}>
        <header
          className="flex h-[58px] items-center bg-white"
          style={{ [isRtl ? 'borderLeft' : 'borderRight']:'none', borderBottom: '1px solid #E5E7EB' }}
        >
          <div className="flex-1 px-6" />
        </header>
        <main className="overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
