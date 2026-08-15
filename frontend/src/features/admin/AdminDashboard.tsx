import {
  Activity,
  Bot,
  Building2,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DarkBadge, DarkCard, StatCard } from './darkUi';
import { formatDuration, formatUsd } from '@/lib/format';
import type { AdminMetrics } from '@/lib/types';

/** لوحة قيادة الإدارة المركزية — إحصائيات المنصة الكلية */
export function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    api<AdminMetrics>('/admin/metrics')
      .then(setMetrics)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل المقاييس'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">لوحة القيادة المركزية</h1>
          <p className="mt-0.5 text-sm text-slate-400">إحصائيات المنصة الكلية (Managed Service)</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
          {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-800/60" />
          ))}
        </div>
      ) : (
        metrics && (
          <>
            {/* البطاقات الإحصائية */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="العملاء (Tenants)" value={metrics.tenants} icon={<Building2 className="h-4 w-4" />} tone="indigo" />
              <StatCard label="المستخدمون" value={metrics.users} icon={<Users className="h-4 w-4" />} tone="sky" />
              <StatCard label="الوكلاء النشطون" value={metrics.agents} icon={<Bot className="h-4 w-4" />} tone="violet" />
              <StatCard label="المكالمات النشطة الآن" value={metrics.activeCalls} icon={<PhoneCall className="h-4 w-4" />} tone="green" />
              <StatCard label="إجمالي المكالمات" value={metrics.totalCalls} icon={<Activity className="h-4 w-4" />} tone="indigo" />
              <StatCard label="دقائق الصوت" value={formatDuration(metrics.totalVoiceSeconds)} icon={<PhoneCall className="h-4 w-4" />} tone="amber" />
              <StatCard label="رسائل واتساب" value={metrics.whatsappMessages} icon={<MessageSquareText className="h-4 w-4" />} tone="green" />
              <StatCard label="التكلفة الكلية" value={formatUsd(metrics.totalCostUsd)} icon={<Wallet className="h-4 w-4" />} tone="red" />
            </div>

            {/* استهلاك شهري لكل مستأجر */}
            <DarkCard
              title="استهلاك الباقات الشهرية"
              hint="آخر 200 سجل — دقائق الصوت ورسائل الواتساب والتكلفة لكل مستأجر"
            >
              {metrics.usageByTenant.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">لا توجد بيانات استخدام بعد — تظهر بعد أول مكالمة/رسالة</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-xs text-slate-400">
                        <th className="px-3 py-2 font-medium">الشهر</th>
                        <th className="px-3 py-2 font-medium">دقائق الصوت</th>
                        <th className="px-3 py-2 font-medium">رسائل واتساب</th>
                        <th className="px-3 py-2 font-medium">TTS مولّد</th>
                        <th className="px-3 py-2 font-medium">TTS كاش</th>
                        <th className="px-3 py-2 font-medium">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {metrics.usageByTenant.map((u, i) => (
                        <tr key={`${u.month}-${i}`} className="text-slate-300 hover:bg-slate-800/40">
                          <td className="px-3 py-2.5 text-xs" dir="ltr">
                            {u.month}
                          </td>
                          <td className="px-3 py-2.5">{u.voiceMinutes} د</td>
                          <td className="px-3 py-2.5">{u.whatsappMsgs}</td>
                          <td className="px-3 py-2.5">{u.ttsGeneratedChars}</td>
                          <td className="px-3 py-2.5">
                            <DarkBadge tone="green">{u.ttsCachedChars}</DarkBadge>
                          </td>
                          <td className="px-3 py-2.5">{formatUsd(u.apiCostUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DarkCard>
          </>
        )
      )}
    </div>
  );
}
