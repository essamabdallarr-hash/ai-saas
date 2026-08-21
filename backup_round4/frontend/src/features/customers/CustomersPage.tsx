import { FileUp, Megaphone, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';

interface CustomerItem {
  id: string;
  customerCode: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  outcomeId: string | null;
  outcome?: { id: string; label: string } | null;
  createdAt: string;
}

interface CustomerPage {
  items: CustomerItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Outcome {
  id: string;
  label: string;
}

export function CustomersPage() {
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const navigate = useNavigate();

  const [data, setData] = useState<CustomerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignType, setCampaignType] = useState<'VOICE' | 'CHAT' | 'BOTH'>('VOICE');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: '20' };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (outcomeFilter) params.outcomeId = outcomeFilter;

    Promise.all([
      api<CustomerPage>('/customers', { params }),
      api<Outcome[]>('/outcomes').catch(() => []),
    ])
      .then(([c, o]) => { setData(c); setOutcomes(o); })
      .finally(() => setLoading(false));
  }, [page, search, statusFilter, outcomeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); setSelected(new Set()); setSelectAllMatching(false); }, [search, statusFilter, outcomeFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selectAllMatching) {
      setSelected(new Set());
      setSelectAllMatching(false);
    } else {
      setSelected(new Set(data.items.map((c) => c.id)));
      setSelectAllMatching(true);
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setUploadResult(null);
    try {
      const res = await uploadFile<{ rowCount: number }>('/customers/upload', file);
      setUploadResult(t.customers.uploadSuccess(res.rowCount));
      load();
    } catch {
      setUploadResult(t.customers.uploadFailed);
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    setDeleteBusy(true);
    try {
      const body: Record<string, unknown> = selectAllMatching
        ? { allMatching: true, filters: { search: search || undefined, status: statusFilter || undefined, outcomeId: outcomeFilter || undefined } }
        : { ids: Array.from(selected) };
      await api('/customers', { method: 'DELETE', json: body });
      setSelected(new Set());
      setSelectAllMatching(false);
      setDeleteConfirm(false);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleCreateCampaign() {
    if (!campaignName.trim() || selected.size === 0) return;
    setCampaignBusy(true);
    try {
      const body: Record<string, unknown> = selectAllMatching
        ? { name: campaignName.trim(), type: campaignType, message: campaignMessage || null, allMatching: true, filters: { search: search || undefined, status: statusFilter || undefined, outcomeId: outcomeFilter || undefined } }
        : { name: campaignName.trim(), type: campaignType, message: campaignMessage || null, customerIds: Array.from(selected) };
      await api('/campaigns', { method: 'POST', json: body });
      setCampaignOpen(false);
      setCampaignName('');
      setCampaignMessage('');
      setSelected(new Set());
      setSelectAllMatching(false);
    } finally {
      setCampaignBusy(false);
    }
  }

  const statusBadge = (s: string) => {
    if (s === 'DONE') return <Badge tone="green">{t.customers.done}</Badge>;
    if (s === 'DID_NOT_ANSWER') return <Badge tone="red">{t.customers.didNotAnswer}</Badge>;
    return <Badge tone="amber">{t.customers.pending}</Badge>;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.customers.title}
        subtitle={t.customers.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setUploadOpen(true)}>
              <FileUp className="h-4 w-4" />
              {t.customers.uploadExcel}
            </Button>
            {selected.size > 0 && (
              <>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4" />
                  {t.customers.deleteSelected}
                </Button>
                <Button onClick={() => setCampaignOpen(true)}>
                  <Megaphone className="h-4 w-4" />
                  {t.customers.launchCampaign}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
          <Input
            dir={isRtl ? 'rtl' : 'ltr'}
            placeholder={t.customers.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#111111]"
        >
          <option value="">{t.customers.allStatuses}</option>
          <option value="PENDING">{t.customers.pending}</option>
          <option value="DONE">{t.customers.done}</option>
          <option value="DID_NOT_ANSWER">{t.customers.didNotAnswer}</option>
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="h-10 rounded-lg border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#111111]"
        >
          <option value="">{t.customers.filterOutcome}</option>
          {outcomes.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        {selected.size > 0 && (
          <span className="text-[13px] text-brand-500 font-medium">{t.customers.selectedCount(selected.size)}</span>
        )}
      </div>

      {loading ? (
        <Spinner label={t.loading} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState text={t.customers.noCustomers} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA]">
                  <th className="px-4 py-3 text-start">
                    <input
                      type="checkbox"
                      checked={selectAllMatching}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[#D0D5DD] accent-[#00B578]"
                    />
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnName}</th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnPhone}</th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnStatus}</th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnOutcome}</th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnDate}</th>
                  <th className="px-4 py-3 text-start font-medium text-[#667085]">{t.customers.columnActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-4 w-4 rounded border-[#D0D5DD] accent-[#00B578]"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-[#111111]">{c.name}</td>
                    <td className="px-4 py-3 text-[#667085]" dir="ltr">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3 text-[#667085]">{c.outcome?.label ?? '—'}</td>
                    <td className="px-4 py-3 text-[#98A2B3]">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/workspace/customers/${c.id}`)}
                        className="text-brand-500 hover:underline text-[13px]"
                      >
                        {t.view}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#E5E7EB] px-4 py-3">
              <span className="text-[12px] text-[#98A2B3]">
                {t.showing} {data.items.length} {t.of} {data.total} {t.results}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t.previous}
                </Button>
                <span className="px-3 text-[12px] text-[#667085]">{t.page} {page} / {data.totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                  {t.next}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={t.customers.uploadTitle}>
        <p className="text-sm text-[#667085]">{t.customers.uploadHint}</p>
        <div className="mt-4 space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-[13px] text-[#667085] file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-brand-600 hover:file:bg-brand-100"
          />
          {uploadResult && (
            <p className={`text-[13px] ${uploadResult.includes(t.customers.uploadFailed) ? 'text-danger-500' : 'text-ok-600'}`}>
              {uploadResult}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleUpload} loading={uploadBusy}>
              <FileUp className="h-4 w-4" />
              {t.customers.uploadButton}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title={t.customers.confirmDelete(selected.size)}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>{t.cancel}</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteBusy}>
            <Trash2 className="h-4 w-4" />
            {t.delete}
          </Button>
        </div>
      </Modal>

      <Modal open={campaignOpen} onClose={() => setCampaignOpen(false)} title={t.customers.campaignTitle}>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[#475467]">{t.customers.campaignName}</span>
            <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[#475467]">{t.customers.campaignType}</span>
            <div className="flex gap-2">
              {(['VOICE', 'CHAT', 'BOTH'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCampaignType(type)}
                  className={`rounded-lg border px-4 py-2 text-[13px] font-medium ${
                    campaignType === type
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-[#D0D5DD] text-[#667085] hover:bg-[#F9FAFB]'
                  }`}
                >
                  {type === 'VOICE' ? t.customers.campaignVoice : type === 'CHAT' ? t.customers.campaignChat : t.customers.campaignBoth}
                </button>
              ))}
            </div>
          </label>
          {(campaignType === 'CHAT' || campaignType === 'BOTH') && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#475467]">{t.customers.campaignMessage}</span>
              <textarea
                value={campaignMessage}
                onChange={(e) => setCampaignMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-[13px] text-[#111111] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCampaignOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleCreateCampaign} loading={campaignBusy} disabled={!campaignName.trim()}>
              <Megaphone className="h-4 w-4" />
              {t.customers.campaignStart}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
