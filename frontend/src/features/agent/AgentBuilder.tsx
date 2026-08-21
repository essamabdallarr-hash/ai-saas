import { BookOpen, Database, FileText, KeyRound, Save, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, PageHeader, Spinner, Textarea, Toggle, Badge } from '@/components/ui';
import { DynamicFieldsManager } from './DynamicFieldsManager';
import { VoicePicker } from './VoicePicker';
import type { Agent, DynamicField } from '@/lib/types';

type Tab = 'general' | 'knowledge' | 'fields';

// وكيل افتراضي ليُعرض قبل توفر الـ Backend (Step 3)
const DRAFT_AGENT: Agent = {
  id: 'draft',
  tenantId: '',
  name: 'الوكيل الرئيسي',
  status: 'DRAFT',
  language: 'ar',
  objective: '',
  voiceProvider: 'AZURE',
  voiceId: 'ar-EG-SalmaNeural',
  voiceRate: 1.0,
  sttProvider: 'deepgram',
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  sileroVadEnabled: true,
  bargeInEnabled: true,
  smartTtsCacheEnabled: true,
  maxTurnsBeforeHandoff: 6,
  systemPrompt: '',
  promptVersion: 1,
  dynamicFields: [],
  documents: [],
};

export function AgentBuilder() {
  const [agent, setAgent] = useState<Agent>(DRAFT_AGENT);
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    // Step 3: GET /agents/:id (عبر Super Admin أو CLIENT_ADMIN)
    api<Agent>('/agents/current')
      .then((data) => setAgent(data))
      .catch(() => setNotice({ kind: 'error', text: 'تعذر تحميل الوكيل من الخادم — يعرض وضع التجربة.' }))
      .finally(() => setLoading(false));
  }, []);

  function patch(p: Partial<Agent>) {
    setAgent((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      // Step 3: PUT /agents/:id — يُخزّن ولا يُرسل systemPrompt (يُحقن من Backend فقط)
      await api<Agent>(`/agents/${agent.id}`, { method: 'PUT', json: agent });
      setNotice({ kind: 'ok', text: 'تم حفظ الوكيل بنجاح.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'فشل الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings }> = [
    { id: 'general', label: 'الإعدادات العامة', icon: Settings },
    { id: 'knowledge', label: 'قاعدة المعرفة (RAG)', icon: BookOpen },
    { id: 'fields', label: 'استخراج البيانات', icon: Database },
  ];

  if (loading) return <Spinner label="جارٍ تحميل الوكيل..." />;

  return (
    <div>
      <PageHeader
        title="باني الوكيل"
        subtitle="أنشئ سلوك بوتك الصوتي واربطه بمعلومات شركتك"
        actions={
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            حفظ
          </Button>
        }
      />

      {/* شريط التبويبات */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            notice.kind === 'ok'
              ? 'border-ok-500/30 bg-ok-50 text-ok-600'
              : 'border-danger-500/30 bg-danger-50 text-danger-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* ——— الإعدادات العامة ——— */}
      {tab === 'general' && (
        <div className="space-y-5">
          <Card title="هوية الوكيل">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="اسم البوت">
                <Input value={agent.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="اللغة">
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  value={agent.language}
                  onChange={(e) => patch({ language: e.target.value })}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="الهدف (Objective)" hint="مثال: بيع اشتراكات الإنترنت وتجهيز مواعيد التركيب">
                  <Textarea
                    value={agent.objective}
                    onChange={(e) => patch({ objective: e.target.value })}
                    placeholder="ما الذي يجب أن يحققه البوت في كل مكالمة؟"
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="الصوت والنماذج">
            <VoicePicker voiceId={agent.voiceId} onChange={(voiceId) => patch({ voiceId })} />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="STT" hint="مع Silero VAD محليًا">
                <Input value={agent.sttProvider} readOnly />
              </Field>
              <Field label="LLM">
                <Input value={agent.llmModel} readOnly />
              </Field>
              <Field label="رقم التحويل للبشري">
                <Input
                  value={agent.fallbackPhoneNumber ?? ''}
                  placeholder="مثال: 01000000000"
                  dir="ltr"
                  onChange={(e) => patch({ fallbackPhoneNumber: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card title="سلوك التفاعل">
            <div className="space-y-4">
              <Toggle
                checked={agent.sileroVadEnabled}
                onChange={(v) => patch({ sileroVadEnabled: v })}
                label="Silero VAD (فلترة الصمت)"
                hint="عدم إرسال الصمت للـ Deepgram — يخفض التكلفة"
              />
              <Toggle
                checked={agent.bargeInEnabled}
                onChange={(v) => patch({ bargeInEnabled: v })}
                label="المقاطعة (Barge-in)"
                hint="يتوقف البوت فورًا عند حديث العميل أثناء الرد"
              />
              <Toggle
                checked={agent.smartTtsCacheEnabled}
                onChange={(v) => patch({ smartTtsCacheEnabled: v })}
                label="Smart TTS Caching"
                hint="تخزين الجمل المتكررة صوتيًا في السيرفر لتقليل توليد Azure"
              />
            </div>
          </Card>
        </div>
      )}

      {/* ——— قاعدة المعرفة (قراءة فقط — الإدارة من بوابة الإدارة المركزية) ——— */}
      {tab === 'knowledge' && (
        <div className="space-y-5">
          <Card title="مستندات الشركة" hint="رفع ملفات قاعدة المعرفة (RAG) يتم من بوابة الإدارة المركزية (AI Studio) فقط">
            {agent.documents.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                لم تُرفع مستندات بعد. يتولّى فريق الدعم من بوابة الإدارة المركزية رفع كتالوج منتجاتك
                وأسعارك ليحوّلها النظام إلى Embeddings ويستخدمها للرد على أسئلة العملاء (RAG).
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {agent.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      <FileText className="h-4 w-4 text-slate-400" />
                      {doc.name}
                    </span>
                    <Badge tone={doc.status === 'READY' ? 'green' : doc.status === 'FAILED' ? 'red' : 'amber'}>
                      {doc.status === 'READY' ? 'جاهز' : doc.status === 'FAILED' ? 'فشل' : 'قيد المعالجة'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ——— الحقول الديناميكية ——— */}
      {tab === 'fields' && (
        <div className="space-y-4">
          <DynamicFieldsManager
            fields={agent.dynamicFields}
            onChange={(fields: DynamicField[]) => patch({ dynamicFields: fields })}
          />
          <p className="flex items-start gap-2 rounded-lg border border-warn-500/30 bg-warn-50 p-3 text-xs text-warn-600">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            نظام الأوامر الأساسي (System Prompt) وسلوك البوت العام يُداران من بوابة الإدارة المركزية
            (Prompt Studio) ولا يظهران للعميل النهائي. أي سلوك خاص بعملك يُدمج هنا آليًا في الـ Backend.
          </p>
        </div>
      )}
    </div>
  );
}
