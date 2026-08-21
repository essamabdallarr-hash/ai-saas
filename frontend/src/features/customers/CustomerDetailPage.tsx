import { ArrowLeft, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { formatDate, formatDuration } from '@/lib/format';

interface CustomerDetail {
  id: string;
  customerCode: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  outcome?: { id: string; label: string } | null;
  customData?: Record<string, unknown> | null;
  createdAt: string;
}

interface VoiceRecord {
  id: string;
  conversationId: string;
  status: string;
  startedAt: string;
  durationSec: number;
  audioUrl: string | null;
  transcript: string | null;
  aiSummary: string | null;
  extractedData: Record<string, string>;
}

interface ChatMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
}

interface CustomerConversations {
  voice: VoiceRecord[];
  chat: ChatMessage[];
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [conversations, setConversations] = useState<CustomerConversations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api<CustomerDetail>(`/customers/${id}`),
      api<CustomerConversations>(`/customers/${id}/conversations`),
    ])
      .then(([c, conv]) => { setCustomer(c); setConversations(conv); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label={t.loading} />;
  if (!customer) return <EmptyState text={t.customers.noCustomers} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={customer.name}
        subtitle={customer.phone ?? customer.email ?? '—'}
        actions={
          <Button variant="secondary" onClick={() => navigate('/workspace/customers')}>
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <p className="text-[12px] text-[#667085]">{t.customers.customerCode}</p>
            <p className="mt-1 text-[15px] font-semibold text-[#111111]">{customer.customerCode}</p>
          </div>
          <div>
            <p className="text-[12px] text-[#667085]">{t.customers.columnPhone}</p>
            <p className="mt-1 text-[15px] font-semibold text-[#111111]" dir="ltr">{customer.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-[12px] text-[#667085]">{t.customers.columnStatus}</p>
            <p className="mt-1">
              <Badge tone={customer.status === 'DONE' ? 'green' : customer.status === 'DID_NOT_ANSWER' ? 'red' : 'amber'}>
                {customer.status === 'DONE' ? t.customers.done : customer.status === 'DID_NOT_ANSWER' ? t.customers.didNotAnswer : t.customers.pending}
              </Badge>
            </p>
          </div>
          <div>
            <p className="text-[12px] text-[#667085]">{t.customers.columnOutcome}</p>
            <p className="mt-1 text-[15px] font-semibold text-[#111111]">{customer.outcome?.label ?? '—'}</p>
          </div>
          <div>
            <p className="text-[12px] text-[#667085]">{t.customers.columnDate}</p>
            <p className="mt-1 text-[15px] font-semibold text-[#111111]">{formatDate(customer.createdAt)}</p>
          </div>
        </div>
        {customer.customData && Object.keys(customer.customData).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(customer.customData).map(([k, v]) => (
              <span key={k} className="rounded-lg bg-[#FAFAFA] px-2.5 py-1 text-xs ring-1 ring-[#E5E7EB]">
                <span className="text-[#98A2B3]">[{k}]</span>{' '}
                <span className="font-medium text-[#111111]">{String(v)}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t.customerDetail.voiceTab}
        hint={`${conversations?.voice.length ?? 0}`}
      >
        {!conversations || conversations.voice.length === 0 ? (
          <EmptyState text={t.customerDetail.noVoiceData} />
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {conversations.voice.map((v) => (
              <div key={v.id} className="rounded-lg border border-[#E5E7EB] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge tone={v.status === 'COMPLETED' ? 'green' : v.status === 'FAILED' ? 'red' : 'amber'}>
                      {v.status}
                    </Badge>
                    <span className="text-[13px] text-[#667085]">{formatDate(v.startedAt)}</span>
                    <span className="text-[12px] text-[#98A2B3]">{formatDuration(v.durationSec)}</span>
                  </div>
                  {v.audioUrl && (
                    <a href={v.audioUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">
                        <Play className="h-3 w-3" />
                        {t.customerDetail.playRecording}
                      </Button>
                    </a>
                  )}
                </div>
                {v.transcript && (
                  <p className="mt-2 text-[12px] text-[#475467] whitespace-pre-wrap">{v.transcript}</p>
                )}
                {v.aiSummary && (
                  <p className="mt-2 text-[13px] text-[#667085]">{v.aiSummary}</p>
                )}
                {v.extractedData && Object.keys(v.extractedData).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(v.extractedData).map(([k, val]) => (
                      <span key={k} className="rounded bg-[#F2F4F7] px-2 py-0.5 text-[11px]">
                        <span className="text-[#98A2B3]">{k}:</span>{' '}
                        <span className="text-[#111111]">{val}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t.customerDetail.chatTab}
        hint={`${conversations?.chat.length ?? 0}`}
      >
        {!conversations || conversations.chat.length === 0 ? (
          <EmptyState text={t.customerDetail.noChatData} />
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {conversations.chat.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === 'OUTBOUND' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] rounded-xl px-4 py-2.5 text-[13px] ${
                    m.direction === 'OUTBOUND'
                      ? 'bg-brand-50 text-[#111111]'
                      : 'bg-[#F2F4F7] text-[#111111]'
                  }`}
                >
                  <p>{m.body}</p>
                  <p className="mt-1 text-[10px] text-[#98A2B3]">{formatDate(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
