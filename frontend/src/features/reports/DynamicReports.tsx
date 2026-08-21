import { Download, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, Spinner } from '@/components/ui';
import { CallAudioPlayer } from './CallAudioPlayer';
import { api } from '@/lib/api';
import type { CallStatus, ConversationChannel, DynamicField, ReportRow } from '@/lib/types';
import { formatDate, formatDuration, formatUsd } from '@/lib/format';

/**
 * تقارير ديناميكية: أعمدة الجدول تتغير تلقائيًا بناءً على حقول
 * Data Extraction التي اختارها العميل في AgentBuilder.
 */
export function DynamicReports() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState('');
  const [channel, setChannel] = useState<ConversationChannel | ''>('');
  const [status, setStatus] = useState<CallStatus | ''>('');

  useEffect(() => {
    // Step 3: GET /reports + GET /dynamic-fields
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

  // الأعمدة: أساسية + الحقول الديناميكية النشطة
  const dynamicKeys = useMemo(
    () => fields.filter((f) => f.enabled).sort((a, b) => a.position - b.position),
    [fields],
  );

  function exportCsv() {
    const head = [
      'التاريخ',
      'العميل',
      'القناة',
      'المدة',
      'الحالة',
      'التكلفة ($)',
      'ملخص AI',
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
        title="التقارير الديناميكية"
        subtitle="أعمدة الجدول تتغير تلقائيًا حسب الحقول التي حددتها في باني الوكيل"
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            تصدير CSV
          </Button>
        }
      />

      {/* الفلاتر */}
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="الفترة">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">الكل</option>
              <option value="today">اليوم</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">آخر 30 يومًا</option>
            </Select>
          </Field>
          <Field label="القناة">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as ConversationChannel | '')}>
              <option value="">الكل</option>
              <option value="VOICE">صوتي</option>
              <option value="WHATSAPP">واتساب</option>
            </Select>
          </Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as CallStatus | '')}>
              <option value="">الكل</option>
              <option value="COMPLETED">مكتملة</option>
              <option value="TRANSFERRED_TO_HUMAN">تم التحويل لبشري</option>
              <option value="FAILED">فاشلة</option>
              <option value="IN_PROGRESS">قيد التنفيذ</option>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Button variant="secondary" size="md" onClick={() => { setFrom(''); setChannel(''); setStatus(''); }}>
              مسح الفلاتر
            </Button>
          </div>
        </div>
      </Card>

      {/* الجدول */}
      <Card className="overflow-x-auto">
        {loading ? (
          <Spinner label="جارٍ تحميل التقارير..." />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8 text-slate-300" />}
            text="لا توجد سجلات ضمن الفلاتر المحددة"
          />
        ) : (
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">التاريخ</th>
                <th className="px-3 py-2 font-medium">العميل</th>
                <th className="px-3 py-2 font-medium">القناة</th>
                <th className="px-3 py-2 font-medium">المدة</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
                <th className="px-3 py-2 font-medium">ملخص AI</th>
                <th className="px-3 py-2 font-medium">التسجيل</th>
                {dynamicKeys.map((f) => (
                  <th key={f.key} className="px-3 py-2 font-medium text-brand-600">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">التكلفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.callId} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                    {formatDate(r.startedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" dir="ltr">
                    {r.callerNumber ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.channel === 'VOICE' ? 'صوتي' : 'واتساب'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{formatDuration(r.durationSec)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="max-w-52 px-3 py-2.5 text-xs text-slate-500">
                    {r.aiSummary ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <CallAudioPlayer src={r.audioUrl} />
                  </td>
                  {dynamicKeys.map((f) => (
                    <td key={f.key} className="px-3 py-2.5 font-medium text-slate-700">
                      {r.extractedData[f.key] ?? '—'}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
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
  const map: Record<CallStatus, { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray'; label: string }> = {
    COMPLETED: { tone: 'green', label: 'مكتملة' },
    TRANSFERRED_TO_HUMAN: { tone: 'amber', label: 'تحويل بشري' },
    FAILED: { tone: 'red', label: 'فاشلة' },
    IN_PROGRESS: { tone: 'blue', label: 'قيد التنفيذ' },
    RINGING: { tone: 'gray', label: 'رنين' },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
