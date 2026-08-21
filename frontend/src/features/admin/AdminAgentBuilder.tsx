import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Spinner } from '@/components/ui';
import { AgentBuilder } from '@/features/agent/AgentBuilder';

interface TenantListItem {
  id: string;
  name: string;
}

export function AdminAgentBuilder() {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<TenantListItem[]>('/admin/tenants')
      .then((list) => {
        setTenants(list);
        if (list.length > 0) setSelectedTenant(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label={t.loading} />;
  if (tenants.length === 0) {
    return <p className="p-8 text-center text-sm text-[#667085]">No tenants found</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-[#475467]">Tenant</label>
        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="h-10 rounded-lg border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#111111]"
        >
          {tenants.map((tn) => (
            <option key={tn.id} value={tn.id}>{tn.name}</option>
          ))}
        </select>
      </div>
      {selectedTenant && <AgentBuilder adminTenantId={selectedTenant} />}
    </div>
  );
}
