import { ArrowDown, ArrowUp, BookOpen, Cpu, Database, FileText, KeyRound, Plus, Save, Trash2, Upload } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, uploadFile } from '@/lib/api';
import { DarkBadge, DarkCard, DarkField, DarkInput, DarkNotice, DarkSelect, DarkTextarea } from './darkUi';
import type { Agent, DynamicField, DynamicFieldType, KnowledgeDocument } from '@/lib/types';

type Tab = 'prompt' | 'rag' | 'fields' | 'keys';

interface TenantAiKeys {
  openaiKeyConfigured: boolean;
  openaiModel: string | null;
}

const FIELD_TYPES: Array<{ value: DynamicFieldType; label: string }> = [
  { value: 'TEXT', label: 'نص' },
  { value: 'NUMBER', label: 'رقم' },
  { value: 'DATE', label: 'تاريخ' },
  { value: 'BOOLEAN', label: 'نعم/لا' },
  { value: 'SELECT', label: 'اختيار' },
  { value: 'CURRENCY', label: 'عملة' },
];

function toKey(label: string): string {
  const latin = label
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
  const map: Record<string, string> = {
    الميزانية: 'budget',
    'موعد الحجز': 'appointment_date',
    'نتيجة التفاوض': 'negotiation_result',
    'اسم العميل': 'customer_name',
    'رقم الهاتف': 'phone',
    المدينة: 'city',
    المنتج: 'product',
    الكمية: 'quantity',
    'حالة المتابعة': 'followup_status',
  };
  return map[latin] ?? (latin.replace(/[\u0600-\u06FF]/g, '').replace(/^_+|_+$/g, '') || `field_${Date.now()}`);
}

/**
 * AI Studio — شاشة مخفية عن العميل تفتحها الإدارة المركزية من ملف أي Tenant:
 *  - نظام الأوامر (System Prompt) لضبط شخصية البوت.
 *  - أداة RAG Uploader لقاعدة المعرفة.
 *  - واجهة Dynamic Fields للاستخراج (Data Extraction).
 */
export function AIStudio() {
  const { tenantId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('prompt');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [fieldsDraft, setFieldsDraft] = useState<DynamicField[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [keysStatus, setKeysStatus] = useState<TenantAiKeys>({ openaiKeyConfigured: false, openaiModel: null });
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState('');
  const [openaiModelDraft, setOpenaiModelDraft] = useState('');
  const [keysSaving, setKeysSaving] = useState(false);

  useEffect(() => {
    api<TenantAiKeys>(`/admin/tenants/${tenantId}/ai-keys`)
      .then((k) => {
        setKeysStatus(k);
        setOpenaiModelDraft(k.openaiModel ?? '');
      })
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<Agent>(`/admin/tenants/${tenantId}/agent`)
      .then((a) => {
        setAgent(a);
        setPromptDraft(a.systemPrompt ?? '');
        setFieldsDraft(a.dynamicFields ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل ملف الوكيل'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function savePrompt() {
    if (!agent) return;
    setSaving(true);
    setNotice(null);
    try {
      const updated = await api<Agent>(`/admin/tenants/${tenantId}/agents/${agent.id}/prompt`, {
        method: 'PUT',
        json: { systemPrompt: promptDraft },
      });
      setAgent({ ...agent, systemPrompt: updated.systemPrompt, promptVersion: updated.promptVersion });
      setNotice({ kind: 'ok', text: `حُفظ نظام الأوامر — الإصدار ${updated.promptVersion} (مخفي عن العميل).` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  async function saveFields() {
    setSaving(true);
    setNotice(null);
    try {
      const fresh = await api<DynamicField[]>(`/admin/tenants/${tenantId}/fields`, {
        method: 'PUT',
        json: { fields: fieldsDraft },
      });
      setFieldsDraft(fresh);
      setNotice({ kind: 'ok', text: 'حُفظت حقول الاستخراج بنجاح.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    try {
      const doc = await uploadFile<KnowledgeDocument>(`/admin/tenants/${tenantId}/documents`, file);
      setAgent((prev) => (prev ? { ...prev, documents: [doc, ...(prev.documents ?? [])] } : prev));
      setNotice({ kind: 'ok', text: `رُفع "${doc.name}" وسيُعالَج لاستخراج النصوص (RAG).` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل رفع الملف' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    try {
      await api(`/admin/tenants/${tenantId}/documents/${docId}`, { method: 'DELETE' });
      setAgent((prev) => (prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) } : prev));
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل الحذف' });
    }
  }

  async function saveKeys() {
    setKeysSaving(true);
    setNotice(null);
    try {
      const fresh = await api<TenantAiKeys>(`/admin/tenants/${tenantId}/ai-keys`, {
        method: 'PUT',
        json: { openaiApiKey: openaiKeyDraft, openaiModel: openaiModelDraft },
      });
      setKeysStatus(fresh);
      setOpenaiKeyDraft('');
      setOpenaiModelDraft(fresh.openaiModel ?? '');
      setNotice({
        kind: 'ok',
        text: fresh.openaiKeyConfigured
          ? 'حُفظ مفتاح OpenAI الخاص بالعميل (مشفر عند التخزين AES-256-GCM).'
          : 'أُزيل مفتاح العميل — سيُستخدم مفتاح المنصة الافتراضي.',
      });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل حفظ المفاتيح' });
    } finally {
      setKeysSaving(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof KeyRound }> = [
    { id: 'prompt', label: 'نظام الأوامر (System Prompt)', icon: KeyRound },
    { id: 'rag', label: 'قاعدة المعرفة (RAG)', icon: BookOpen },
    { id: 'fields', label: 'استخراج البيانات', icon: Database },
    { id: 'keys', label: 'المفاتيح والنماذج', icon: Cpu },
  ];

  if (loading) {
    return <div className="space-y-3"><div className="h-8 w-56 animate-pulse rounded bg-slate-800/60" /><div className="h-64 animate-pulse rounded-xl bg-slate-800/60" /></div>;
  }
  if (error || !agent) {
    return (
      <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-3 text-sm text-danger-400">
        {error ?? 'الوكيل غير موجود'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">AI Studio — {agent.name}</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            شاشة مخفية عن العميل · تحكم كامل بشخصية البوت وقاعدة معرفته واستخراج البيانات
          </p>
        </div>
        <DarkBadge tone="violet">الإصدار {agent.promptVersion}</DarkBadge>
      </header>

      {/* شريط التبويبات */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-slate-500 hover:text-slate-200'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {notice && <DarkNotice kind={notice.kind}>{notice.text}</DarkNotice>}

      {/* ——— 1) نظام الأوامر ——— */}
      {tab === 'prompt' && (
        <DarkCard
          title="System Prompt — شخصية البوت"
          hint="يُدمج في الـ Backend عند كل مكالمة ولا يظهر للعميل نهائيًا"
          actions={
            <button
              onClick={savePrompt}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          }
        >
          <DarkField label="نص نظام الأوامر" hint="حدّد هنا الشخصية، اللغة، أسئلة الافتتاح، وسيناريو الإغلاق (تعليمات Markdown مسموحة)">
            <DarkTextarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={14}
              placeholder={'أنت وكيل مبيعات ذكي يتحدث العربية...\n\n— الافتتاح: تحية ودية ثم التعرف على الاحتياج\n— الهدف: استخراج الميزانية وموعد المتابعة\n— الإغلاق: تأكيد الموعد وشكر العميل'}
            />
          </DarkField>
          <p className="mt-2 text-xs text-slate-500">
            أي تعديل هنا يرفع رقم الإصدار تلقائيًا ويُسجَّل في Audit Log للمنصة.
          </p>
        </DarkCard>
      )}

      {/* ——— 2) قاعدة المعرفة RAG ——— */}
      {tab === 'rag' && (
        <DarkCard
          title="RAG Uploader — Knowledge Base"
          hint="PDF / Excel / TXT / CSV — تُحوَّل إلى Embeddings في pgvector"
          actions={
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Upload className="h-4 w-4" />
              رفع ملف
            </button>
          }
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.txt,.csv" className="hidden" onChange={onUpload} />
          {(agent.documents ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-600 p-6 text-center text-sm text-slate-500">
              لا توجد مستندات بعد — ارفع كتالوج منتجاتك أو الأسعار ليستخدمها البوت في الرد
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {(agent.documents ?? []).map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-200">
                    <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate">{doc.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-500" dir="ltr">
                      {doc.fileType} · {(doc.fileSize / 1024).toFixed(0)}KB
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <DarkBadge tone={doc.status === 'READY' ? 'green' : doc.status === 'FAILED' ? 'red' : 'amber'}>
                      {doc.status === 'READY' ? `${doc.chunkCount ?? 0} شريحة` : doc.status === 'FAILED' ? 'فشل' : 'قيد المعالجة'}
                    </DarkBadge>
                    <button onClick={() => deleteDoc(doc.id)} className="rounded p-1 text-danger-400 hover:bg-danger-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DarkCard>
      )}

      {/* ——— 3) حقول الاستخراج ——— */}
      {tab === 'fields' && (
        <DarkCard
          title="Dynamic Fields — Data Extraction"
          hint="البيانات التي يستخرجها البوت في نهاية كل محادثة (تظهر في تقارير العميل ديناميكيًا)"
          actions={
            <button
              onClick={saveFields}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جارٍ الحفظ...' : 'حفظ الحقول'}
            </button>
          }
        >
          <FieldsEditor fields={fieldsDraft} onChange={setFieldsDraft} />
        </DarkCard>
      )}

      {/* ——— 4) المفاتيح والنماذج ——— */}
      {tab === 'keys' && (
        <DarkCard
          title="مفاتيح الذكاء الاصطناعي الخاصة بالعميل"
          hint="تُخزَّن مشفّرة (AES-256-GCM) في قاعدة البيانات — تُرجَع للواجهة كحالة فقط ولا تُكشف أبدًا"
          actions={
            <button
              onClick={saveKeys}
              disabled={keysSaving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {keysSaving ? 'جارٍ الحفظ...' : 'حفظ المفاتيح'}
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-4">
            <DarkField
              label="OpenAI API Key"
              hint={
                keysStatus.openaiKeyConfigured
                  ? 'مفتاح مخصص مُفعّل حاليًا — اترك الحقل فارغًا للإبقاء عليه، أو اكتب مفتاحًا جديدًا، أو أدخل مسافة فارغة للإزالة.'
                  : 'غير مُفعّل حاليًا — سيُستخدم مفتاح المنصة الافتراضي. اكتب مفتاحًا خاصًا بالعميل لتفعيله.'
              }
            >
              <DarkInput
                type="password"
                dir="ltr"
                value={openaiKeyDraft}
                placeholder={
                  keysStatus.openaiKeyConfigured
                    ? '•••••••••••••••• (مُفعّل)'
                    : 'sk-... (مفتاح المنصة مستخدم حاليًا)'
                }
                onChange={(e) => setOpenaiKeyDraft(e.target.value)}
              />
            </DarkField>
            <DarkField label="نموذج LLM المخصص" hint="فارغ = نموذج المنصة الافتراضي (gpt-4o-mini)">
              <DarkInput
                dir="ltr"
                value={openaiModelDraft}
                placeholder="gpt-4o-mini"
                onChange={(e) => setOpenaiModelDraft(e.target.value)}
              />
            </DarkField>
            <p className="text-xs text-slate-500">
              المفتاح يُشفَّر بمفتاح رئيسي مستقل (SECRET_KEY) في .env — تدوير JWT_SECRET لا يكسر الأسرار المخزنة.
            </p>
          </div>
        </DarkCard>
      )}
    </div>
  );
}

/** محرر حقول الاستخراج (نسخة داكنة مخصصة لـ AI Studio) */
function FieldsEditor({
  fields,
  onChange,
}: {
  fields: DynamicField[];
  onChange: (f: DynamicField[]) => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<DynamicFieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');

  function add() {
    if (!label.trim()) return;
    const key = toKey(label);
    if (fields.some((f) => f.key === key)) {
      window.alert(`المفتاح "${key}" مستخدم مسبقًا`);
      return;
    }
    onChange([
      ...fields,
      {
        id: `local-${Date.now()}`,
        label: label.trim(),
        key,
        type,
        description: description.trim() || undefined,
        required,
        position: fields.length,
        enabled: true,
      },
    ]);
    setLabel('');
    setType('TEXT');
    setRequired(false);
    setDescription('');
  }

  function remove(id: string) {
    onChange(fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, position: i })));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((f, i) => ({ ...f, position: i })));
  }

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="rounded-lg bg-slate-900/60 p-3 text-xs text-slate-500">
          لا توجد حقول — أضف ما يريده العميل، مثال: الميزانية، موعد الحجز، نتيجة التفاوض.
        </p>
      )}
      {fields.map((field) => (
        <div
          key={field.id}
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
            field.enabled ? 'border-slate-700' : 'border-dashed border-slate-700 opacity-60'
          }`}
        >
          <div>
            <p className="text-sm font-medium text-slate-100">
              {field.label}
              {field.required && <span className="mr-1 text-danger-400">*</span>}
            </p>
            <p className="text-xs text-slate-500" dir="ltr">
              [{field.key}] · {FIELD_TYPES.find((t) => t.value === field.type)?.label}
            </p>
            {field.description && <p className="mt-0.5 text-xs text-slate-500">{field.description}</p>}
          </div>
          <div className="flex items-center gap-1">
            <button className="rounded p-1 text-slate-400 hover:bg-slate-800" onClick={() => move(field.id, -1)}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-800" onClick={() => move(field.id, 1)}>
              <ArrowDown className="h-4 w-4" />
            </button>
            <button className="rounded p-1 text-danger-400 hover:bg-danger-500/10" onClick={() => remove(field.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {/* إضافة حقل */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-brand-500/40 bg-brand-500/5 p-3 sm:grid-cols-4">
        <DarkField label="التسمية">
          <DarkInput value={label} placeholder="مثال: الميزانية" onChange={(e) => setLabel(e.target.value)} />
        </DarkField>
        <DarkField label="النوع">
          <DarkSelect value={type} onChange={(e) => setType(e.target.value as DynamicFieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </DarkSelect>
        </DarkField>
        <DarkField label="وصف للبوت">
          <DarkInput value={description} placeholder="الحد الأقصى الذي يقبله العميل" onChange={(e) => setDescription(e.target.value)} />
        </DarkField>
        <div className="flex items-end justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            إجباري
          </label>
          <button onClick={add} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700">
            <Plus className="h-3.5 w-3.5" />
            إضافة
          </button>
        </div>
      </div>
    </div>
  );
}
