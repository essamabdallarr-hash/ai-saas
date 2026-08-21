import { CheckCircle2, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { HumanTakeoverButton } from './HumanTakeoverButton';
import { TranscriptFeed } from './TranscriptFeed';
import { WhatsAppThread } from './WhatsAppThread';
import { api } from '@/lib/api';
import { LiveSocket } from '@/lib/ws';
import type { Call, Conversation, TranscriptEvent, WhatsappConnectionStatus, WhatsappMessage } from '@/lib/types';
import { formatDuration } from '@/lib/format';

interface LiveState {
  conversations: Conversation[];
  eventsByCall: Record<string, TranscriptEvent[]>;
  messagesByConversation: Record<string, WhatsappMessage[]>;
  extractedByCall: Record<string, Record<string, string>>;
  typingByConversation: Record<string, boolean>;
}

/**
 * Omnichannel Live Inbox — شاشة WebSocket:
 *  - يمين: قائمة المحادثات النشطة (Voice + WhatsApp).
 *  - يسار: Live Transcript للمكالمات أو شات الواتساب.
 *  - زر Human Takeover أحمر بارز لإيقاف الـ AI فورًا.
 */
export function OmnichannelLiveInbox() {
  const { t } = useI18n();
  const [state, setState] = useState<LiveState>({
    conversations: [],
    eventsByCall: {},
    messagesByConversation: {},
    extractedByCall: {},
    typingByConversation: {},
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WhatsappConnectionStatus>('DISCONNECTED');
  const socketRef = useRef<LiveSocket | null>(null);

  useEffect(() => {
    api<Conversation[]>('/conversations?status=OPEN')
      .then((list) => {
        setState((s) => ({ ...s, conversations: list }));
        if (list.length > 0) setSelectedId((id) => id ?? list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    api<{ status: WhatsappConnectionStatus }[]>('/whatsapp/connections')
      .then((conns) => {
        const active = conns.find((c) => c.status === 'CONNECTED');
        if (active) setConnectionStatus('CONNECTED');
        else if (conns.some((c) => c.status === 'QR_PENDING')) setConnectionStatus('QR_PENDING');
      })
      .catch(() => {});

    const socket = new LiveSocket('/ws/inbox');
    socket.onEvent((ev) => {
      switch (ev.type) {
        case 'conversation.open':
          setState((s) =>
            s.conversations.some((c) => c.id === ev.conversation.id)
              ? s
              : { ...s, conversations: [ev.conversation, ...s.conversations] },
          );
          break;
        case 'conversation.close':
          setState((s) => ({
            ...s,
            conversations: s.conversations.filter((c) => c.id !== ev.conversationId),
          }));
          break;
        case 'call.status':
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === ev.callId || c.call?.id === ev.callId
                ? { ...c, status: 'OPEN', call: { ...(c.call as Call), status: ev.status } }
                : c,
            ),
          }));
          break;
        case 'transcript.partial':
        case 'transcript.final':
          setState((s) => ({
            ...s,
            eventsByCall: {
              ...s.eventsByCall,
              [ev.event.callId]: [...(s.eventsByCall[ev.event.callId] ?? []), ev.event],
            },
          }));
          break;
        case 'ai.summary':
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.call?.id === ev.callId ? { ...c, call: { ...c.call, aiSummary: ev.summary } } : c,
            ),
          }));
          break;
        case 'extraction.updated':
          setState((s) => ({
            ...s,
            extractedByCall: { ...s.extractedByCall, [ev.callId]: ev.extractedData },
          }));
          break;
        case 'message.new':
          setState((s) => ({
            ...s,
            messagesByConversation: {
              ...s.messagesByConversation,
              [ev.message.conversationId]: [
                ...(s.messagesByConversation[ev.message.conversationId] ?? []),
                ev.message,
              ],
            },
            typingByConversation: { ...s.typingByConversation, [ev.message.conversationId]: false },
          }));
          break;
        case 'takeover.start':
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === ev.callId || c.call?.id === ev.callId
                ? {
                    ...c,
                    status: 'HUMAN_TAKEOVER',
                    call: { ...(c.call as Call), takenOverByName: ev.takenByName, takeoverAt: new Date().toISOString() },
                  }
                : c,
            ),
          }));
          break;
        case 'takeover.end':
          break;
      }
    });
    socket.connect();
    socketRef.current = socket;
    return () => socket.close();
  }, []);

  const selected = useMemo(
    () => state.conversations.find((c) => c.id === selectedId) ?? null,
    [state.conversations, selectedId],
  );

  function requestTakeover() {
    if (!selected) return;
    socketRef.current?.send({ type: 'takeover.request', conversationId: selected.id });
  }

  function sendWhatsApp(text: string) {
    if (!selected) return;
    socketRef.current?.send({ type: 'message.send', conversationId: selected.id, text });
  }

  async function closeSelected() {
    if (!selected || closing) return;
    setClosing(true);
    try {
      await api<{ ok: boolean }>(`/conversations/${selected.id}/close`, { method: 'POST' });
      setState((s) => ({
        ...s,
        conversations: s.conversations.filter((c) => c.id !== selected.id),
      }));
    } catch {
    } finally {
      setClosing(false);
    }
  }

  const activeCount = state.conversations.filter((c) => c.status !== 'CLOSED').length;

  return (
    <div>
      <Card
        title={`${t.inbox.liveInboxOmnichannel} — ${activeCount} ${t.inbox.activeConversations}`}
        hint={t.inbox.liveUpdateHint}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={connectionStatus === 'CONNECTED' ? 'green' : connectionStatus === 'QR_PENDING' ? 'amber' : 'gray'}>
              <MessageCircle className="h-3 w-3" />
              {connectionStatus === 'CONNECTED' ? t.inbox.whatsappConnected : connectionStatus === 'QR_PENDING' ? t.inbox.qrPending : t.inbox.whatsappDisconnected}
            </Badge>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              {t.inbox.refresh}
            </Button>
          </div>
        }
      >
        {loading ? (
          <Spinner label={t.inbox.loadingConversations} />
        ) : (
          <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
            <div className="divide-y divide-[#E5E7EB] overflow-y-auto border-l border-[#E5E7EB] lg:max-h-[70vh] lg:pl-2 scrollbar-thin">
              {state.conversations.length === 0 && (
                <p className="p-4 text-sm text-[#98A2B3]">{t.inbox.noActiveConversations}</p>
              )}
              {state.conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-3 text-right transition-colors ${
                    selectedId === c.id ? 'bg-brand-50' : 'hover:bg-[#F9FCFB]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {c.channel === 'VOICE' ? (
                      <Phone className="h-4 w-4 shrink-0 text-brand-500" />
                    ) : (
                      <MessageCircle className="h-4 w-4 shrink-0 text-ok-500" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#111111]" dir="ltr">
                        {c.contactNumber || t.inbox.unknownNumber}
                      </span>
                      <span className="block text-xs text-[#98A2B3]">
                        {c.channel === 'VOICE'
                          ? `${t.inbox.voice} · ${formatDuration(c.call?.durationSec ?? 0)}`
                          : `${t.inbox.whatsapp} · ${state.messagesByConversation[c.id]?.length ?? 0} ${t.inbox.message}`}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.status === 'HUMAN_TAKEOVER'
                        ? 'bg-amber-500'
                        : c.status === 'CLOSED'
                          ? 'bg-slate-300'
                          : 'bg-emerald-500'
                    }`}
                  />
                </button>
              ))}
            </div>

            {selected ? (
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#111111]" dir="ltr">
                      {selected.contactNumber}
                    </p>
                    <p className="text-xs text-[#98A2B3]">
                      {selected.channel === 'VOICE' ? t.inbox.voiceCall : t.inbox.whatsappChat}
                      {selected.status === 'HUMAN_TAKEOVER' && (
                        <span className="text-amber-600"> · {t.inbox.humanTakeover}: {selected.call?.takenOverByName}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={selected.status === 'CLOSED' || closing}
                      onClick={closeSelected}
                      title={t.inbox.closeConversationHint}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {closing ? t.inbox.closing : t.inbox.closeConversation}
                    </Button>
                    <HumanTakeoverButton
                      active={selected.status === 'HUMAN_TAKEOVER'}
                      enabled={selected.status !== 'CLOSED'}
                      onTakeover={requestTakeover}
                    />
                  </div>
                </div>

                {selected.channel === 'VOICE' ? (
                  <div className="rounded-xl border border-[#E5E7EB]">
                    <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-medium text-[#667085]">
                      {t.inbox.liveTranscript}
                    </div>
                    <TranscriptFeed events={selected.call ? state.eventsByCall[selected.call.id] ?? [] : []} />
                    <ExtractedPanel data={selected.call ? state.extractedByCall[selected.call.id] : undefined} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#E5E7EB]">
                    <WhatsAppThread
                      messages={state.messagesByConversation[selected.id] ?? []}
                      connectionStatus={connectionStatus}
                      typing={state.typingByConversation[selected.id]}
                      onSend={sendWhatsApp}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="flex items-center justify-center text-sm text-[#98A2B3]">
                {t.inbox.selectConversationHint}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExtractedPanel({ data }: { data?: Record<string, string> }) {
  const { t } = useI18n();
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="border-t border-[#E5E7EB] bg-[#FAFAFA] p-3">
      <p className="mb-2 text-xs font-medium text-[#667085]">{t.inbox.extractedFields}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, value]) => (
          <span key={key} className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-[#E5E7EB]">
            <span className="text-[#98A2B3]">[{key}]</span> <span className="font-medium text-[#667085]">{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
