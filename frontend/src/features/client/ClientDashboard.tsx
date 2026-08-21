import { Phone, PhoneCall, Wallet, QrCode, RefreshCw, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { formatDuration, formatUsd } from '@/lib/format';
import type { WhatsappConnection } from '@/lib/types';

interface DashboardStats {
  customers: { total: number; pending: number; done: number; didNotAnswer: number };
  month: { cost: number; minutes: number; calls: number };
  recentCalls: { id: string; callerNumber: string | null; status: string; startedAt: string; durationSec: number }[];
}

interface SimResult {
  callId: string;
  conversationId: string;
  status: string;
}

export function ClientDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [simOpen, setSimOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrConn, setQrConn] = useState<WhatsappConnection | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCreating, setQrCreating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function load() {
    setLoading(true);
    api<DashboardStats>('/dashboard')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function runSimulation() {
    if (!phone.trim()) return;
    setSimBusy(true);
    setSimError(null);
    setSimResult(null);
    try {
      const res = await api<SimResult>('/calls', { method: 'POST', json: { toNumber: phone.trim() } });
      setSimResult(res);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : t.clientDashboard.simulationError);
    } finally {
      setSimBusy(false);
    }
  }

  async function openQrModal() {
    setQrOpen(true);
    setQrLoading(true);
    setQrError(null);
    try {
      const conns = await api<WhatsappConnection[]>('/whatsapp/connections');
      const freeQr = conns.find((c) => c.engine === 'FREE_QR');
      if (freeQr) {
        setQrConn(freeQr);
      } else {
        if (qrCreating) return;
        setQrCreating(true);
        try {
          const created = await api<WhatsappConnection>('/whatsapp/connections', {
            method: 'POST',
            json: { engine: 'FREE_QR' },
          });
          setQrConn(created);
        } catch {
          setQrError('فشل إنشاء اتصال QR');
          setQrConn(null);
        } finally {
          setQrCreating(false);
        }
      }
    } catch {
      setQrError('فشل الاتصال بالخادم');
      setQrConn(null);
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    if (!qrOpen || !qrConn || qrConn.status === 'CONNECTED' || qrConn.status === 'BANNED' || qrConn.status === 'BROKEN') {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      return;
    }
    qrPollRef.current = setInterval(async () => {
      try {
        const fresh = await api<WhatsappConnection>(`/whatsapp/connections/${qrConn.id}/status`);
        setQrConn(fresh);
      } catch { /* retry */ }
    }, 3000);
    return () => { if (qrPollRef.current) clearInterval(qrPollRef.current); };
  }, [qrOpen, qrConn?.id, qrConn?.status]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.clientDashboard.title}
        subtitle={t.clientDashboard.subtitle}
        actions={
          <Button onClick={load} variant="secondary">
            {t.clientDashboard.refresh}
          </Button>
        }
      />

      {loading ? (
        <Spinner label={t.loading} />
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-t-4 border-t-brand-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.totalCustomers}</span>
                <TrendingUp className="h-4 w-4 text-brand-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{stats.customers.total}</p>
              <div className="mt-1 flex gap-2">
                <span className="text-[11px] text-amber-600">{stats.customers.pending} {t.clientDashboard.pending}</span>
                <span className="text-[11px] text-ok-600">{stats.customers.done} {t.clientDashboard.done}</span>
                <span className="text-[11px] text-danger-600">{stats.customers.didNotAnswer} {t.clientDashboard.didNotAnswer}</span>
              </div>
            </Card>

            <Card className="border-t-4 border-t-ok-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.monthCalls}</span>
                <Phone className="h-4 w-4 text-ok-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{stats.month.calls}</p>
              <p className="text-xs text-[#98A2B3]">{t.clientDashboard.monthMinutes}: {formatDuration(stats.month.minutes * 60)}</p>
            </Card>

            <Card className="border-t-4 border-t-violet-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.monthCost}</span>
                <Wallet className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[#111111]">{formatUsd(stats.month.cost)}</p>
              <p className="text-xs text-[#98A2B3]">{t.clientDashboard.monthStats}</p>
            </Card>

            <Card className="border-t-4 border-t-blue-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#667085]">{t.clientDashboard.qrTitle}</span>
                <QrCode className="h-4 w-4 text-blue-500" />
              </div>
              <p className="mt-2 text-[13px] text-[#667085]">{t.clientDashboard.qrHint}</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={openQrModal}>
                <QrCode className="h-4 w-4" />
                {t.clientDashboard.qrButton}
              </Button>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Card title={t.clientDashboard.simulationTitle} hint={t.clientDashboard.simulationHint}>
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

              <Card title={t.clientDashboard.dailyChart}>
                {stats.recentCalls.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#98A2B3]">{t.empty.noCalls}</p>
                ) : (
                  <div className="divide-y divide-[#FAFAFA]">
                    {stats.recentCalls.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium text-[#111111]" dir="ltr">{r.callerNumber ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={r.status === 'COMPLETED' ? 'green' : 'amber'}>{r.status}</Badge>
                          <span className="text-xs text-[#667085]">{formatDuration(r.durationSec)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card title={t.clientDashboard.customOutcomes}>
                <p className="text-sm text-[#98A2B3]">{t.clientDashboard.noOutcomes}</p>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      <Modal open={simOpen} onClose={() => setSimOpen(false)} title={t.clientDashboard.simulationModalTitle}>
        <p className="text-sm text-[#667085]">{t.clientDashboard.simulationModalDescription}</p>
        <div className="mt-4 space-y-3">
          <Field label={t.clientDashboard.phoneNumber} hint={t.clientDashboard.phoneNumberHint}>
            <Input dir="ltr" value={phone} placeholder="+201000000000" onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {simError && <p className="text-sm text-danger-600">{simError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSimOpen(false)}>{t.clientDashboard.cancel}</Button>
            <Button onClick={runSimulation} loading={simBusy}>
              <PhoneCall className="h-4 w-4" />
              {simBusy ? t.clientDashboard.calling : t.clientDashboard.startTest}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={t.clientDashboard.qrTitle}>
        {qrLoading ? (
          <Spinner label={t.loading} />
        ) : qrConn ? (
          <div className="space-y-4">
            {qrConn.status === 'QR_PENDING' && qrConn.qrCode && (
              <div className="flex flex-col items-center gap-2">
                <img src={qrConn.qrCode} alt="QR" className="h-56 w-56 rounded-xl border border-[#E5E7EB] bg-white p-2" />
                <p className="text-sm text-[#667085]">{t.clientDashboard.qrHint}</p>
              </div>
            )}
            {qrConn.status === 'CONNECTED' && (
              <div className="flex flex-col items-center gap-2">
                <Badge tone="green">{t.whatsapp.statusConnected}</Badge>
                <p className="text-sm text-[#667085]">{t.clientDashboard.qrHint}</p>
              </div>
            )}
            {qrConn.status === 'DISCONNECTED' && (
              <div className="flex flex-col items-center gap-2">
                <Badge tone="gray">{t.whatsapp.statusDisconnected}</Badge>
                <p className="text-sm text-[#667085]">{t.clientDashboard.qrHint}</p>
                <Button variant="secondary" size="sm" onClick={openQrModal}>
                  <RefreshCw className="h-4 w-4" />
                  {t.whatsapp.refresh}
                </Button>
              </div>
            )}
            {(qrConn.status === 'BROKEN' || qrConn.status === 'BANNED') && (
              <div className="flex flex-col items-center gap-2">
                <Badge tone="red">{qrConn.status}</Badge>
                <Button variant="secondary" size="sm" onClick={openQrModal}>
                  <RefreshCw className="h-4 w-4" />
                  {t.whatsapp.refresh}
                </Button>
              </div>
            )}
          </div>
        ) : qrError ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-danger-600">{qrError}</p>
            <Button variant="secondary" size="sm" onClick={openQrModal}>
              <RefreshCw className="h-4 w-4" />
              {t.whatsapp.refresh}
            </Button>
          </div>
        ) : (
          <Spinner label={t.loading} />
        )}
      </Modal>
    </div>
  );
}
