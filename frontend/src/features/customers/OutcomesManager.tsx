import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';

interface Outcome {
  id: string;
  label: string;
  position: number;
}

interface Props {
  tenantId: string;
  onUpdated?: () => void;
}

export function OutcomesManager({ tenantId, onUpdated }: Props) {
  const { t } = useI18n();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api<Outcome[]>(`/admin/tenants/${tenantId}/outcomes`)
      .then(setOutcomes)
      .catch(() => setOutcomes([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [tenantId]);

  async function add() {
    if (!newLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/tenants/${tenantId}/outcomes`, { method: 'POST', json: { label: newLabel.trim() } });
      setNewLabel('');
      load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create outcome');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/tenants/${tenantId}/outcomes/${id}`, { method: 'PATCH', json: { label: editLabel.trim() } });
      setEditingId(null);
      load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update outcome');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/tenants/${tenantId}/outcomes/${id}`, { method: 'DELETE' });
      load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete outcome');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <h4 className="text-sm font-semibold text-[#111111]">{t.outcomes.title}</h4>
      {error && (
        <p className="mt-2 rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs text-danger-600">{error}</p>
      )}
      {outcomes.length === 0 ? (
        <EmptyState text={t.clientDashboard.noOutcomes} />
      ) : (
        <div className="mt-3 space-y-2">
          {outcomes.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-2.5">
              {editingId === o.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(o.id); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 rounded border border-brand-500 bg-white px-2 py-1 text-[13px] text-[#111111] focus:outline-none"
                />
              ) : (
                <span className="text-[13px] font-medium text-[#111111]">{o.label}</span>
              )}
              <div className="flex items-center gap-1">
                {editingId !== o.id && (
                  <button
                    onClick={() => { setEditingId(o.id); setEditLabel(o.label); }}
                    className="p-1 text-[#98A2B3] hover:text-brand-500"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => remove(o.id)} className="p-1 text-[#98A2B3] hover:text-danger-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={t.outcomes.label}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-[13px] text-[#111111] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12"
        />
        <Button onClick={add} loading={busy} disabled={!newLabel.trim()}>
          <Plus className="h-4 w-4" />
          {t.outcomes.addOutcome}
        </Button>
      </div>
    </div>
  );
}
