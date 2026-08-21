import { Download, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, Spinner } from '@/components/ui';
import { CallAudioPlayer } from './CallAudioPlayer';
import { api } from '@/lib/api';
import type { CallStatus, ConversationChannel, DynamicField, ReportRow } from '@/lib/types';
import { formatDate, formatDuration, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';

export function DynamicReports() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState('');
  const [channel, setChannel] = useState<ConversationChannel | ''>('');
  const [status, setStatus] = useState<CallStatus | ''>('');

  useEffect(() => {
    api<DynamicField[]>('/dynamic-fields')
      .then(setFields)
      .catch(() => setFields([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (channel) q.set('channel', channel);
    if (status) q.set('status', status);
    api<ReportRow[]>(`/reports?${q.toString()}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [from, channel, status]);

  const dynamicKeys = useMemo(
    () => fields.filter((f) => f.enabled).sort((a, b) => a.position - b.position),
    [fields],
  );

  function exportCsv() {
    const head = [
      t.reports.columns.date,
      t.reports.columns.caller,
      t.reports.columns.channel,
      t.reports.columns.duration,
      t.reports.columns.status,
      t.reports.costUsd,
      t.reports.aiSummary,
      ...dynamicKeys.map((f) => f.label),
    ];
    const lines = rows.map((r) =>
      [
        r.startedAt,
        r.callerNumber ?? '',
        r.channel,
        r.durationSec,
        r.status,
        r.apiCostUsd.toFixed(3),
        (r.aiSummary ?? '').replace(/[",\n]/g, ' '),
        ...dynamicKeys.map((f) => (r.extractedData[f.key] ?? '').replace(/[",\n]/g, ' ')),
      ].join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            {t.reports.exportCsv}
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t.reports.filterPeriod}>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">{t.reports.all}</option>
              <option value="today">{t.reports.periodToday}</option>
              <option value="week">{t.reports.periodLast7}</option>
              <option value="month">{t.reports.periodLast30}</option>
            </Select>
          </Field>
          <Field label={t.reports.filterChannel}>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as ConversationChannel | '')}>
              <option value="">{t.reports.all}</option>
              <option value="VOICE">{t.reports.channelVoice}</option>
              <option value="WHATSAPP">{t.reports.channelWhatsapp}</option>
            </Select>
          </Field>
          <Field label={t.reports.filterStatus}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as CallStatus | '')}>
              <option value="">{t.reports.all}</option>
              <option value="COMPLETED">{t.reports.badgeCompleted}</option>
              <option value="TRANSFERRED_TO_HUMAN">{t.reports.badgeTransferred}</option>
              <option value="FAILED">{t.reports.badgeFailed}</option>
              <option value="IN_PROGRESS">{t.reports.badgeInProgress}</option>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Button variant="secondary" size="md" onClick={() => { setFrom(''); setChannel(''); setStatus(''); }}>
              {t.reports.clearFilters}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <Spinner label={t.reports.loading} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8 text-[#98A2B3]" />}
            text={t.reports.emptyState}
          />
        ) : (
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-xs text-[#667085]">
                <th className="px-3 py-2 font-medium">{t.reports.columns.date}</th>
                <th className="px-3 py-2 font-medium">{t.reports.columns.caller}</th>
                <th className="px-3 py-2 font-medium">{t.reports.columns.channel}</th>
                <th className="px-3 py-2 font-medium">{t.reports.columns.duration}</th>
                <th className="px-3 py-2 font-medium">{t.reports.columns.status}</th>
                <th className="px-3 py-2 font-medium">{t.reports.aiSummary}</th>
                <th className="px-3 py-2 font-medium">{t.reports.columns.recording}</th>
                {dynamicKeys.map((f) => (
                  <th key={f.key} className="px-3 py-2 font-medium text-brand-500">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">{t.reports.cost}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.callId} className="hover:bg-[#F9FCFB]">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#667085]">
                    {formatDate(r.startedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">
                    {r.callerNumber ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.channel === 'VOICE' ? t.reports.channelVoice : t.reports.channelWhatsapp}
                  </td>
                  <td className="px-3 py-2.5 text-[#667085]">{formatDuration(r.durationSec)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="max-w-52 px-3 py-2.5 text-xs text-[#667085]">
                    {r.aiSummary ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <CallAudioPlayer src={r.audioUrl} />
                  </td>
                  {dynamicKeys.map((f) => (
                    <td key={f.key} className="px-3 py-2.5 font-medium text-[#111111]">
                      {r.extractedData[f.key] ?? '—'}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#667085]">
                    {formatUsd(r.apiCostUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: CallStatus }) {
  const { t } = useI18n();
  const map: Record<CallStatus, { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray'; label: string }> = {
    COMPLETED: { tone: 'green', label: t.reports.badgeCompleted },
    TRANSFERRED_TO_HUMAN: { tone: 'amber', label: t.reports.badgeTransferred },
    FAILED: { tone: 'red', label: t.reports.badgeFailed },
    IN_PROGRESS: { tone: 'blue', label: t.reports.badgeInProgress },
    RINGING: { tone: 'gray', label: t.reports.badgeRinging },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
