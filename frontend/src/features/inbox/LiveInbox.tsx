import { MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Spinner } from '@/components/ui';
import { HumanTakeoverButton } from './HumanTakeoverButton';
import { TranscriptFeed } from './TranscriptFeed';
import { WhatsAppThread } from './WhatsAppThread';
import { api } from '@/lib/api';
import { LiveSocket } from '@/lib/ws';
import type { Call, Conversation, TranscriptEvent, WhatsappMessage } from '@/lib/types';
import { formatDuration } from '@/lib/format';

interface LiveState {
  conversations: Conversation[];
  eventsByCall: Record<string, TranscriptEvent[]>;
  messagesByConversation: Record<string, WhatsappMessage[]>;
  extractedByCall: Record<string, Record<string, string>>;
  typingByConversation: Record<string, boolean>;
}

export function LiveInbox() {
  const [state, setState] = useState<LiveState>({
    conversations: [],
    eventsByCall: {},
    messagesByConversation: {},
    extractedByCall: {},
    typingByConversation: {},
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<LiveSocket | null>(null);

  // تحميل أولي + WebSocket
  useEffect(() => {
    // Step 3: GET /conversations → المحادثات المفتوحة النشطة
    api<Conversation[]>('/conversations')
      .then((list) => {
        setState((s) => ({ ...s, conversations: list }));
        if (list.length > 0) setSelectedId((id) => id ?? list[0].id);
      })
      .catch(() => {
        /* سيظهر عبر WebSocket عند توفر Step 3 */
      })
      .finally(() => setLoading(false));

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
                ? { ...c, status: 'HUMAN_TAKEOVER', call: { ...(c.call as Call), takenOverByName: ev.takenByName, takeoverAt: new Date().toISOString() } }
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

  const activeCount = state.conversations.filter((c) => c.status !== 'CLOSED').length;

  return (
    <div>
      <Card
        title={`البريد الوارد المباشر (${activeCount} محادثة نشطة)`}
        actions={
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      >
        {loading ? (
          <Spinner label="جارٍ تحميل المحادثات..." />
        ) : (
          <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            {/* قائمة المحادثات */}
            <div className="divide-y divide-slate-100 overflow-y-auto border-l border-slate-100 lg:max-h-[70vh] lg:pl-2 scrollbar-thin">
              {state.conversations.length === 0 && (
                <p className="p-4 text-sm text-slate-400">لا توجد محادثات نشطة الآن</p>
              )}
              {state.conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-3 text-right transition-colors ${
                    selectedId === c.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {c.channel === 'VOICE' ? (
                      <Phone className="h-4 w-4 shrink-0 text-brand-500" />
                    ) : (
                      <MessageCircle className="h-4 w-4 shrink-0 text-ok-500" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800" dir="ltr">
                        {c.contactNumber || 'رقم مجهول'}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {c.channel === 'VOICE'
                          ? formatDuration(c.call?.durationSec ?? 0)
                          : `الواتساب · ${c.messages?.length ?? 0} رسالة`}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.status === 'HUMAN_TAKEOVER' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* تفاصيل المحادثة */}
            {selected ? (
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800" dir="ltr">
                      {selected.contactNumber}
                    </p>
                    <p className="text-xs text-slate-400">
                      {selected.channel === 'VOICE' ? 'مكالمة صوتية' : 'محادثة واتساب'}
                    </p>
                  </div>
                  <HumanTakeoverButton
                    active={selected.status === 'HUMAN_TAKEOVER'}
                    enabled
                    onTakeover={requestTakeover}
                  />
                </div>

                {selected.channel === 'VOICE' ? (
                  <div className="rounded-xl border border-slate-200">
                    <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
                      التفريغ اللحظي (Live Transcript)
                    </div>
                    <TranscriptFeed
                      events={selected.call ? state.eventsByCall[selected.call.id] ?? [] : []}
                    />
                    {/* الحقول المستخرجة لحظيًا */}
                    <ExtractedPanel
                      data={
                        selected.call ? state.extractedByCall[selected.call.id] : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200">
                    <WhatsAppThread
                      messages={state.messagesByConversation[selected.id] ?? []}
                      connectionStatus="CONNECTED"
                      typing={state.typingByConversation[selected.id]}
                      onSend={sendWhatsApp}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="flex items-center justify-center text-sm text-slate-400">
                اختر محادثة من القائمة
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExtractedPanel({ data }: { data?: Record<string, string> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="border-t border-slate-100 bg-slate-50/50 p-3">
      <p className="mb-2 text-xs font-medium text-slate-500">الحقول المستخرجة لحظيًا</p>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, value]) => (
          <span key={key} className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-200">
            <span className="text-slate-400">[{key}]</span> <span className="font-medium text-slate-700">{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
