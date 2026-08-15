import { MessageCircle, QrCode, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Input, PageHeader, Spinner, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import type { WhatsappConnection, WhatsappConnectionStatus, WhatsappEngine } from '@/lib/types';

function statusBadge(status: WhatsappConnectionStatus) {
  const map: Record<WhatsappConnectionStatus, { tone: 'green' | 'red' | 'amber' | 'gray'; label: string }> = {
    CONNECTED: { tone: 'green', label: 'متصل' },
    QR_PENDING: { tone: 'amber', label: 'بانتظار مسح QR' },
    DISCONNECTED: { tone: 'gray', label: 'غير متصل' },
    BROKEN: { tone: 'red', label: 'انقطع الاتصال' },
    BANNED: { tone: 'red', label: 'محظور' },
  };
  return map[status];
}

/**
 * ربط الواتساب — واجهة بسيطة:
 *  - باقة FREE_QR → يعرض QR Code للمسح.
 *  - باقة OFFICIAL_META → حقول Token (Phone Number ID / WABA / Access Token).
 */
export function WhatsAppSetup() {
  const [connections, setConnections] = useState<WhatsappConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const [engine, setEngine] = useState<WhatsappEngine>('FREE_QR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // حقول Meta الرسمي
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');

  // إعدادات متقدمة
  const [typingDelayMs, setTypingDelayMs] = useState(4000);
  const [spintaxEnabled, setSpintaxEnabled] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function load() {
    api<WhatsappConnection[]>('/whatsapp/connections')
      .then(setConnections)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الاتصالات'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // عند وجود اتصال حر → نستعلم عن حالته حتى يظهر QR
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const free = connections.find((c) => c.engine === 'FREE_QR');
    if (free && free.status !== 'CONNECTED' && free.status !== 'BANNED' && free.status !== 'BROKEN') {
      pollRef.current = setInterval(async () => {
        try {
          const fresh = await api<WhatsappConnection>(`/whatsapp/connections/${free.id}/status`);
          setConnections((cs) => cs.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)));
        } catch {
          /* أعد المحاولة */
        }
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connections]);

  async function createFreeQr() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const conn = await api<WhatsappConnection>('/whatsapp/connections', {
        method: 'POST',
        json: { engine: 'FREE_QR', typingDelayMs, spintaxEnabled },
      });
      setConnections((cs) => [conn, ...cs]);
      setNotice({ kind: 'ok', text: 'تم إنشاء اتصال QR — المسح الرمز من تطبيق واتساب (الأجهزة المرتبطة).' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الاتصال');
    } finally {
      setBusy(false);
    }
  }

  async function createMeta() {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (!metaPhoneNumberId.trim() || !metaWabaId.trim() || !metaAccessToken.trim()) {
      setError('أكمل جميع حقول Meta Token');
      setBusy(false);
      return;
    }
    try {
      const conn = await api<WhatsappConnection>('/whatsapp/connections', {
        method: 'POST',
        json: {
          engine: 'OFFICIAL_META',
          typingDelayMs,
          spintaxEnabled,
          metaPhoneNumberId: metaPhoneNumberId.trim(),
          metaWabaId: metaWabaId.trim(),
          metaAccessToken: metaAccessToken.trim(),
        },
      });
      setConnections((cs) => [conn, ...cs]);
      setMetaPhoneNumberId('');
      setMetaWabaId('');
      setMetaAccessToken('');
      setNotice({ kind: 'ok', text: 'رُبط المحرك الرسمي (Meta Cloud API) بنجاح.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الربط');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(conn: WhatsappConnection) {
    try {
      await api(`/whatsapp/connections/${conn.id}/disconnect`, { method: 'POST' });
      load();
    } catch {
      /* تجاهل */
    }
  }

  async function saveSettings(conn: WhatsappConnection) {
    try {
      await api(`/whatsapp/connections/${conn.id}`, {
        method: 'PUT',
        json: { typingDelayMs, spintaxEnabled },
      });
      setNotice({ kind: 'ok', text: 'حُفظت إعدادات مكافحة الحظر (Anti-Ban).' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل الحفظ' });
    }
  }

  if (loading) return <Spinner label="جارٍ تحميل الاتصالات..." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="إعدادات الواتساب"
        subtitle="اربط محركك: QR Code (باقة FREE_QR) أو Meta Cloud API (باقة OFFICIAL_META)"
        actions={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      {error && <div className="rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</div>}
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.kind === 'ok' ? 'border-ok-500/30 bg-ok-50 text-ok-600' : 'border-danger-500/30 bg-danger-50 text-danger-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      {connections.length === 0 ? (
        /* ——— لا يوجد اتصال بعد — اختيار المحرك ——— */
        <Card title="ربط جديد" hint="اختر باقة الاتصال المناسبة لعملك">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => setEngine('FREE_QR')}
              className={`rounded-xl border-2 p-4 text-right transition-colors ${
                engine === 'FREE_QR' ? 'border-ok-500 bg-ok-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <QrCode className="h-6 w-6 text-ok-600" />
              <p className="mt-2 text-sm font-semibold text-slate-800">المحرك الحر — QR Code</p>
              <p className="mt-1 text-xs text-slate-500">
                مسح QR من جهازك مباشرة. ردود تلقائية على الرسائل الواردة فقط مع Anti-Ban (تأخير كتابة 3–5 ثوانٍ + Spintax).
              </p>
            </button>
            <button
              onClick={() => setEngine('OFFICIAL_META')}
              className={`rounded-xl border-2 p-4 text-right transition-colors ${
                engine === 'OFFICIAL_META' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <MessageCircle className="h-6 w-6 text-brand-600" />
              <p className="mt-2 text-sm font-semibold text-slate-800">Meta Cloud API الرسمي</p>
              <p className="mt-1 text-xs text-slate-500">
                للشركات والحملات الجماعية. يتطلب Phone Number ID و WABA ID و Access Token من Meta Business.
              </p>
            </button>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            {engine === 'FREE_QR' ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">أنشئ اتصال QR وستظهر الرموز للمسح فورًا.</p>
                <Button onClick={createFreeQr} loading={busy} variant="success">
                  <QrCode className="h-4 w-4" />
                  إنشاء اتصال QR
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Phone Number ID">
                    <Input dir="ltr" value={metaPhoneNumberId} placeholder="102312345678901" onChange={(e) => setMetaPhoneNumberId(e.target.value)} />
                  </Field>
                  <Field label="WABA ID">
                    <Input dir="ltr" value={metaWabaId} placeholder="108765432109876" onChange={(e) => setMetaWabaId(e.target.value)} />
                  </Field>
                  <Field label="Access Token">
                    <Input dir="ltr" type="password" value={metaAccessToken} placeholder="EAA..." onChange={(e) => setMetaAccessToken(e.target.value)} />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button onClick={createMeta} loading={busy}>
                    <MessageCircle className="h-4 w-4" />
                    ربط Meta API
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        /* ——— الاتصالات الحالية ——— */
        <div className="space-y-4">
          {connections.map((conn) => {
            const st = statusBadge(conn.status);
            return (
              <Card
                key={conn.id}
                title={conn.engine === 'FREE_QR' ? 'المحرك الحر (QR)' : conn.engine === 'OFFICIAL_META' ? 'Meta Cloud API الرسمي' : 'Hybrid'}
                actions={<Badge tone={st.tone}>{st.label}</Badge>}
              >
                {conn.engine === 'FREE_QR' && conn.status === 'QR_PENDING' && conn.qrCode && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <img src={conn.qrCode} alt="QR" className="h-56 w-56 rounded-xl border border-slate-200 bg-white p-2" />
                    <p className="text-sm text-slate-600">
                      امسح الرمز من واتساب ← الإعدادات ← الأجهزة المرتبطة. يبقى صالحًا {conn.qrExpiresAt ? '5 دقائق' : 'لوقت قصير'}.
                    </p>
                  </div>
                )}

                {conn.error && <div className="mb-3 rounded-lg bg-danger-50 p-2 text-xs text-danger-600">{conn.error}</div>}

                {conn.engine === 'FREE_QR' && conn.status === 'BROKEN' && (
                  <p className="mb-3 rounded-lg bg-warn-50 p-2 text-xs text-warn-600">
                    تعذّر تشغيل المتصفح — تأكد من تثبيت Chromium على الخادم ثم أعد المحاولة.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <Field label="تأخير الكتابة (مللي ثانية)" hint="مكافحة الحظر — بين 3000 و 5000">
                    <Input
                      type="number"
                      min={3000}
                      max={5000}
                      value={typingDelayMs}
                      onChange={(e) => setTypingDelayMs(Number(e.target.value))}
                    />
                  </Field>
                  <div className="flex items-end pb-1">
                    <Toggle
                      checked={spintaxEnabled}
                      onChange={setSpintaxEnabled}
                      label="Spintax (تنويع النص)"
                      hint="تقليل تشابه الردود المتكررة"
                    />
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    <Button variant="secondary" onClick={() => saveSettings(conn)}>
                      حفظ الإعدادات
                    </Button>
                    <Button variant="danger" onClick={() => disconnect(conn)}>
                      <Unplug className="h-4 w-4" />
                      قطع الاتصال
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
