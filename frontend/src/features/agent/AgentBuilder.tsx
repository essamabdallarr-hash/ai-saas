import { BookOpen, Database, FileText, KeyRound, Save, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button, Card, Field, Input, PageHeader, Spinner, Textarea, Toggle, Badge } from '@/components/ui';
import { DynamicFieldsManager } from './DynamicFieldsManager';
import { VoicePicker } from './VoicePicker';
import type { Agent, DynamicField } from '@/lib/types';

type Tab = 'general' | 'knowledge' | 'fields';

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
  const { t } = useI18n();
  const [agent, setAgent] = useState<Agent>(DRAFT_AGENT);
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    api<Agent>('/agents/current')
      .then((data) => setAgent(data))
      .catch(() => setNotice({ kind: 'error', text: t.agentBuilder.loadError }))
      .finally(() => setLoading(false));
  }, []);

  function patch(p: Partial<Agent>) {
    setAgent((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await api<Agent>(`/agents/${agent.id}`, { method: 'PUT', json: agent });
      setNotice({ kind: 'ok', text: t.agentBuilder.saveSuccess });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : t.agentBuilder.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings }> = [
    { id: 'general', label: t.agentBuilder.tabs.general, icon: Settings },
    { id: 'knowledge', label: t.agentBuilder.tabs.knowledge, icon: BookOpen },
    { id: 'fields', label: t.agentBuilder.tabs.fields, icon: Database },
  ];

  if (loading) return <Spinner label={t.agentBuilder.loading} />;

  return (
    <div>
      <PageHeader
        title={t.agentBuilder.title}
        subtitle={t.agentBuilder.subtitle}
        actions={
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            {t.agentBuilder.save}
          </Button>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-[#E5E7EB]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-[#667085] hover:text-[#111111]'
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

      {tab === 'general' && (
        <div className="space-y-5">
          <Card title={t.agentBuilder.identity}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t.agentBuilder.botName}>
                <Input value={agent.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label={t.agentBuilder.language}>
                <select
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  value={agent.language}
                  onChange={(e) => patch({ language: e.target.value })}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label={t.agentBuilder.objective} hint={t.agentBuilder.objectiveHint}>
                  <Textarea
                    value={agent.objective}
                    onChange={(e) => patch({ objective: e.target.value })}
                    placeholder={t.agentBuilder.objectivePlaceholder}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card title={t.agentBuilder.voiceAndModels}>
            <VoicePicker voiceId={agent.voiceId} onChange={(voiceId) => patch({ voiceId })} />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="STT" hint={t.agentBuilder.sttHint}>
                <Input value={agent.sttProvider} readOnly />
              </Field>
              <Field label="LLM">
                <Input value={agent.llmModel} readOnly />
              </Field>
              <Field label={t.agentBuilder.handoffNumber}>
                <Input
                  value={agent.fallbackPhoneNumber ?? ''}
                  placeholder={t.agentBuilder.handoffNumberPlaceholder}
                  dir="ltr"
                  onChange={(e) => patch({ fallbackPhoneNumber: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card title={t.agentBuilder.interactionBehavior}>
            <div className="space-y-4">
              <Toggle
                checked={agent.sileroVadEnabled}
                onChange={(v) => patch({ sileroVadEnabled: v })}
                label="Silero VAD"
                hint={t.agentBuilder.sileroHint}
              />
              <Toggle
                checked={agent.bargeInEnabled}
                onChange={(v) => patch({ bargeInEnabled: v })}
                label={t.agentBuilder.bargeIn}
                hint={t.agentBuilder.bargeInHint}
              />
              <Toggle
                checked={agent.smartTtsCacheEnabled}
                onChange={(v) => patch({ smartTtsCacheEnabled: v })}
                label="Smart TTS Caching"
                hint={t.agentBuilder.ttsCacheHint}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'knowledge' && (
        <div className="space-y-5">
          <Card title={t.agentBuilder.companyDocs} hint={t.agentBuilder.companyDocsHint}>
            {agent.documents.length === 0 ? (
              <p className="rounded-lg bg-[#FAFAFA] p-4 text-sm text-[#667085]">
                {t.agentBuilder.noDocs}
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E7EB]">
                {agent.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2 text-sm text-[#111111]">
                      <FileText className="h-4 w-4 text-[#98A2B3]" />
                      {doc.name}
                    </span>
                    <Badge tone={doc.status === 'READY' ? 'green' : doc.status === 'FAILED' ? 'red' : 'amber'}>
                      {doc.status === 'READY' ? t.agentBuilder.statusReady : doc.status === 'FAILED' ? t.agentBuilder.statusFailed : t.agentBuilder.statusProcessing}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'fields' && (
        <div className="space-y-4">
          <DynamicFieldsManager
            fields={agent.dynamicFields}
            onChange={(fields: DynamicField[]) => patch({ dynamicFields: fields })}
          />
          <p className="flex items-start gap-2 rounded-lg border border-warn-500/30 bg-warn-50 p-3 text-xs text-warn-600">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            {t.agentBuilder.systemPromptNote}
          </p>
        </div>
      )}
    </div>
  );
}
