import { CheckCircle2, Database, Flame, Phone, PhoneCall, RefreshCw, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, formatDuration, formatUsd } from '@/lib/format';
import type { DynamicField, ReportRow, UsageLedger } from '@/lib/types';

interface SimResult {
  callId: string;
  conversationId: string;
  status: string;
}

/** لوحة العميل — إحصائيات خاصة + زر اختبار البوت على رقمه الشخصي */
export function ClientDashboard() {
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fieldCount, setFieldCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Simulation Test
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
      setSimError(err instanceof Error ? err.message : 'فشل بدء المكالمة التجريبية');
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="لوحة العمل الرئيسية"
        subtitle="أداء بوتك: المكالمات الناجحة، الاستخراج، والاستهلاك"
        actions={
          <Button onClick={() => window.location.reload()} variant="secondary">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      {loading ? (
        <Spinner label="جارٍ تحميل الإحصائيات..." />
      ) : (
        <>
          {/* البطاقات الإحصائية */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-t-4 border-t-ok-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">المكالمات الناجحة</span>
                <CheckCircle2 className="h-4 w-4 text-ok-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{stats.completed}</p>
              <p className="text-xs text-slate-400">من أصل {stats.total} · نجاح {stats.successRate}%</p>
            </Card>

            <Card className="border-t-4 border-t-brand-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">دقائق المكالمات</span>
                <Phone className="h-4 w-4 text-brand-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatDuration(stats.minutes)}</p>
              <p className="text-xs text-slate-400">
                استهلاك الباقة: {usage ? `${formatDuration(usage.voiceMinutes * 60)}` : '—'}
              </p>
            </Card>

            <Card className="border-t-4 border-t-violet-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">حقول الاستخراج</span>
                <Database className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{fieldCount}</p>
              <p className="text-xs text-slate-400">تظهر كأعمدة في التقارير تلقائيًا</p>
            </Card>

            <Card className="border-t-4 border-t-amber-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">التكلفة التقديرية</span>
                <Wallet className="h-4 w-4 text-warn-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatUsd(stats.cost)}</p>
              <p className="text-xs text-slate-400">الشهر الحالي عبر جميع المحادثات</p>
            </Card>
          </div>

          {/* اختبار المحاكاة */}
          <Card
            title="اختبار المحاكاة (Simulation Test)"
            hint="جرّب البوت على رقمك الشخصي قبل إطلاق الحملات"
            actions={<Flame className="h-5 w-5 text-warn-500" />}
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="max-w-md flex-1 text-sm text-slate-500">
                اتصل البوت برقمك فورًا، تتحدث معه كما لو كان عميلًا حقيقيًا — اختبر الصوت والردود
                واستخراج الحقول قبل الانطلاق بالحملات.
              </p>
              <Button onClick={() => setSimOpen(true)} size="lg">
                <PhoneCall className="h-5 w-5" />
                اختبار البوت الآن
              </Button>
            </div>
            {simResult && (
              <div className="mt-4 rounded-lg border border-ok-500/30 bg-ok-50 p-3 text-sm text-ok-600">
                بدأت المكالمة التجريبية بنجاح ({simResult.status}) — سيظهر التفريغ في البريد الوارد المباشر.
              </div>
            )}
          </Card>

          {/* آخر استخراجات */}
          <Card title="آخر قيم مُستخرجة" hint="لحظة بلحظة من أحدث المحادثات">
            {stats.lastExtractions.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                لا توجد قيم مستخرجة بعد — أجرِ اختبار المحاكاة أولًا
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.lastExtractions.map(([key, value], i) => (
                  <span key={`${key}-${i}`} className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs ring-1 ring-slate-200">
                    <span className="text-slate-400">[{key}]</span> <span className="font-medium text-slate-700">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* آخر المكالمات */}
          <Card title="آخر المكالمات">
            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">لا توجد مكالمات بعد</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {rows.slice(0, 5).map((r) => (
                  <div key={r.callId} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800" dir="ltr">
                        {r.callerNumber ?? 'رقم مجهول'}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(r.startedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'}>
                        {r.status}
                      </Badge>
                      <span className="text-xs text-slate-500">{formatDuration(r.durationSec)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* نافذة اختبار المحاكاة */}
      <Modal open={simOpen} onClose={() => setSimOpen(false)} title="اختبار المحاكاة — رقمك الشخصي">
        <p className="text-sm text-slate-600">
          أدخل رقم هاتفك (بصيغة دولية). سيتصل بوتك به فورًا لاختبار الشخصية والردود قبل إطلاق الحملات.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="رقم الهاتف" hint="مثال: +201000000000">
            <Input dir="ltr" value={phone} placeholder="+201000000000" onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {simError && <p className="text-sm text-danger-600">{simError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSimOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={runSimulation} loading={simBusy}>
              <PhoneCall className="h-4 w-4" />
              {simBusy ? 'جارٍ الاتصال...' : 'ابدأ الاختبار'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
