import { CheckCheck, Clock, Send } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Badge, EmptyState } from '@/components/ui';
import type { WhatsappConnectionStatus, WhatsappMessage } from '@/lib/types';

function StatusBadge({ status }: { status: WhatsappConnectionStatus }) {
  const map = {
    CONNECTED: { tone: 'green' as const, label: 'متصل' },
    QR_PENDING: { tone: 'amber' as const, label: 'بانتظار مسح QR' },
    DISCONNECTED: { tone: 'gray' as const, label: 'غير متصل' },
    BROKEN: { tone: 'red' as const, label: 'انقطع الاتصال' },
    BANNED: { tone: 'red' as const, label: 'محظور' },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function WhatsAppThread({
  messages,
  connectionStatus,
  typing = false,
  onSend,
}: {
  messages: WhatsappMessage[];
  connectionStatus: WhatsappConnectionStatus;
  typing?: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typing]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <StatusBadge status={connectionStatus} />
        <span className="text-[11px] text-slate-400">المحرك الحر: ردود فقط + تأخير كتابة 3–5 ثوانٍ (Anti-Ban)</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 && (
          <EmptyState text="لا توجد رسائل بعد في هذه المحادثة" />
        )}
        {messages.map((m) => {
          const inbound = m.direction === 'INBOUND';
          return (
            <div key={m.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  inbound ? 'rounded-tr-sm bg-slate-100 text-slate-800' : 'rounded-tl-sm bg-ok-500 text-white'
                }`}
              >
                {m.body}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70" dir="ltr">
                  <Clock className="h-3 w-3" />
                  {new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  {!inbound && m.status === 'DELIVERED' && <CheckCheck className="h-3 w-3" />}
                </span>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-full bg-slate-100 px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-100 p-3">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ok-500 focus:outline-none"
          placeholder="اكتب ردًا على العميل..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-ok-500 text-white hover:bg-ok-600 disabled:opacity-40"
          disabled={!draft.trim()}
        >
          <Send className="h-4 w-4 -scale-x-100" />
        </button>
      </form>
    </div>
  );
}
