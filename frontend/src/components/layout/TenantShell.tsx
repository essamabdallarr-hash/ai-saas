import { Bot, Home, Inbox, LayoutDashboard, LogOut, MessageCircle } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';

export function TenantShell({ onLogout }: { onLogout: () => void }) {
  const { t, lang, toggleLang, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const navigate = useNavigate();

  const navItems = [
    { to: '/workspace', label: t.tenantNav.home, icon: Home },
    { to: '/workspace/inbox', label: t.tenantNav.inbox, icon: Inbox },
    { to: '/workspace/reports', label: t.tenantNav.reports, icon: LayoutDashboard },
    { to: '/workspace/agent', label: t.tenantNav.agent, icon: Bot },
    { to: '/workspace/whatsapp', label: t.tenantNav.whatsapp, icon: MessageCircle },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      {/* Header */}
      <header
        className="flex h-[58px] shrink-0 items-center bg-white"
        style={{ borderBottom: '1px solid #E5E7EB' }}
      >
        <div className="flex w-full items-center px-6" style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100">
              <Bot className="h-5 w-5 text-brand-500" />
            </span>
            <span className="text-[13px] font-bold text-[#111111]">{t.login.welcomeSubtitle}</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1" style={{ direction: isRtl ? 'rtl' : 'ltr', marginInlineStart: 32 }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/workspace'}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'text-brand-500 border-b-2 border-brand-500 rounded-none'
                      : 'text-[#344054] hover:text-brand-500'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 ms-auto">
            <button
              onClick={toggleLang}
              className="rounded-md border border-[#D0D5DD] px-2.5 py-1 text-[12px] font-semibold text-[#344054] hover:bg-[#F9FAFB]"
            >
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            <button
              onClick={() => {
                onLogout();
                navigate('/');
              }}
              className="flex items-center gap-2 text-[13px] font-medium text-[#667085] hover:text-danger-500"
            >
              <LogOut className="h-4 w-4" />
              {t.adminShell.logout}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
