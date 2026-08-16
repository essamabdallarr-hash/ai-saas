import { CheckCircle2, Database, Flame, Phone, PhoneCall, RefreshCw, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { formatDate, formatDuration, formatUsd } from '@/lib/format';
import type { DynamicField, ReportRow, UsageLedger } from '@/lib/types';

interface SimResult {
  callId: string;
  conversationId: string;
  status: string;
}

export function ClientDashboard() {
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fieldCount, setFieldCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [simOpen, setSimOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api<UsageLedger>('/tenants/me/usage?month=current').catch(() => null),
      api<ReportRow[]>('/reports').catch(() => []),
      api<DynamicField[]>('/dynamic-fields').catch(() => []),
    ])
      .then(([u, r, f]) => {
        setUsage(u);
        setRows(r);
        setFieldCount(f.length);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const stats = useMemo(() => {
    const completed = rows.filter((r) => r.status === 'COMPLETED').length;
    return {
      total: rows.length,
      completed,
      successRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      cost: rows.reduce((s, r) => s + (r.apiCostUsd ?? 0), 0),
      minutes: rows.reduce((s, r) => s + (r.durationSec ?? 0), 0),
      lastExtractions: rows
        .flatMap((r) => Object.entries(r.extractedData ?? {}))
        .slice(-6),
    };
  }, [rows]);

  async function runSimulation() {
    if (!phone.trim()) return;
    setSimBusy(true);
    setSimError(null);
    setSimResult(null);
    try {
      const res = await api<SimResult>('/calls', {
        method: 'POST',
        json: { toNumber: phone.trim() },
      });
      setSimResult(res);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : t.clientDashboard.simulationError);
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.clientDashboard.title}
        subtitle={t.clientDashboard.subtitle}
        actions={
          <Button onClick={() => window.location.reload()} variant="secondary">
            <RefreshCw className="h-4 w-4" />
            {t.clientDashboard.refresh}
          </Button>
        }
      />

      {loading ? (
        <Spinner label={t.clientDashboard.loading} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-t-4 border-t-ok-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.successfulCalls}</span>
                <CheckCircle2 className="h-4 w-4 text-ok-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{stats.completed}</p>
              <p className="text-xs text-[#98A2B3]">{t.clientDashboard.ofTotal(stats.total)} · {t.clientDashboard.successRate(stats.successRate)}</p>
            </Card>

            <Card className="border-t-4 border-t-brand-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.callMinutes}</span>
                <Phone className="h-4 w-4 text-brand-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{formatDuration(stats.minutes)}</p>
              <p className="text-xs text-[#98A2B3]">
                {t.clientDashboard.planUsage}: {usage ? `${formatDuration(usage.voiceMinutes * 60)}` : '—'}
              </p>
            </Card>

            <Card className="border-t-4 border-t-violet-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.extractionFields}</span>
                <Database className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{fieldCount}</p>
              <p className="text-xs text-[#98A2B3]">{t.clientDashboard.fieldsAutoReport}</p>
            </Card>

            <Card className="border-t-4 border-t-amber-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.estimatedCost}</span>
                <Wallet className="h-4 w-4 text-warn-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{formatUsd(stats.cost)}</p>
              <p className="text-xs text-[#98A2B3]">{t.clientDashboard.currentMonth}</p>
            </Card>
          </div>

          <Card
            title={t.clientDashboard.simulationTitle}
            hint={t.clientDashboard.simulationHint}
            actions={<Flame className="h-5 w-5 text-warn-500" />}
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="max-w-md flex-1 text-sm text-[#667085]">
                {t.clientDashboard.simulationDescription}
              </p>
              <Button onClick={() => setSimOpen(true)} size="lg">
                <PhoneCall className="h-5 w-5" />
                {t.clientDashboard.testBotNow}
              </Button>
            </div>
            {simResult && (
              <div className="mt-4 rounded-lg border border-ok-500/30 bg-ok-50 p-3 text-sm text-ok-600">
                {t.clientDashboard.simulationStarted(simResult.status)}
              </div>
            )}
          </Card>

          <Card title={t.clientDashboard.latestExtractions} hint={t.clientDashboard.latestExtractionsHint}>
            {stats.lastExtractions.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#98A2B3]">
                {t.clientDashboard.noExtractions}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.lastExtractions.map(([key, value], i) => (
                  <span key={`${key}-${i}`} className="rounded-lg bg-[#FAFAFA] px-2.5 py-1 text-xs ring-1 ring-[#E5E7EB]">
                    <span className="text-[#98A2B3]">[{key}]</span> <span className="font-medium text-[#111111]">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title={t.clientDashboard.latestCalls}>
            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#98A2B3]">{t.clientDashboard.noCalls}</p>
            ) : (
              <div className="divide-y divide-[#FAFAFA]">
                {rows.slice(0, 5).map((r) => (
                  <div key={r.callId} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-[#111111]" dir="ltr">
                        {r.callerNumber ?? t.clientDashboard.unknownNumber}
                      </p>
                      <p className="text-xs text-[#98A2B3]">{formatDate(r.startedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'}>
                        {r.status}
                      </Badge>
                      <span className="text-xs text-[#667085]">{formatDuration(r.durationSec)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal open={simOpen} onClose={() => setSimOpen(false)} title={t.clientDashboard.simulationModalTitle}>
        <p className="text-sm text-[#667085]">
          {t.clientDashboard.simulationModalDescription}
        </p>
        <div className="mt-4 space-y-3">
          <Field label={t.clientDashboard.phoneNumber} hint={t.clientDashboard.phoneNumberHint}>
            <Input dir="ltr" value={phone} placeholder="+201000000000" onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {simError && <p className="text-sm text-danger-600">{simError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSimOpen(false)}>
              {t.clientDashboard.cancel}
            </Button>
            <Button onClick={runSimulation} loading={simBusy}>
              <PhoneCall className="h-4 w-4" />
              {simBusy ? t.clientDashboard.calling : t.clientDashboard.startTest}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
