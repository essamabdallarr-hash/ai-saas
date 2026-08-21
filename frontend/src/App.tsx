import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TenantShell } from '@/components/layout/TenantShell';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { TenantManager } from '@/features/admin/TenantManager';
import { AIStudio } from '@/features/admin/AIStudio';
import { ClientDashboard } from '@/features/client/ClientDashboard';
import { OmnichannelLiveInbox } from '@/features/inbox/OmnichannelLiveInbox';
import { DynamicReports } from '@/features/reports/DynamicReports';
import { WhatsAppSetup } from '@/features/whatsapp/WhatsAppSetup';
import { AgentBuilder } from '@/features/agent/AgentBuilder';
import { useAuth } from '@/lib/useAuth';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
        جارٍ التحقق من الجلسة...
      </div>
    </div>
  );
}

export default function App() {
  const { session, setSession, loading, logout } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <LoginScreen onLogin={setSession} />;

  const isAdmin = session.user.role === 'SUPER_ADMIN';

  return (
    <Routes>
      {isAdmin ? (
        <Route path="/admin" element={<SuperAdminShell onLogout={logout} />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="tenants" element={<TenantManager />} />
          <Route path="tenants/:tenantId/studio" element={<AIStudio />} />
          <Route path="metrics" element={<AdminDashboard />} />
        </Route>
      ) : (
        <Route path="/workspace" element={<TenantShell onLogout={logout} />}>
          <Route index element={<ClientDashboard />} />
          <Route path="inbox" element={<OmnichannelLiveInbox />} />
          <Route path="reports" element={<DynamicReports />} />
          <Route path="agent" element={<AgentBuilder />} />
          <Route path="knowledge" element={<AgentBuilder />} />
          <Route path="whatsapp" element={<WhatsAppSetup />} />
        </Route>
      )}
      <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/workspace'} replace />} />
    </Routes>
  );
}
