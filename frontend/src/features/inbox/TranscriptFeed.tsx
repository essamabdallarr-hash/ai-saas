import { Bot, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { EmptyState } from '@/components/ui';
import type { TranscriptEvent } from '@/lib/types';

/**
 * التفريغ النصي اللحظي للمكالمة النشطة.
 * النتائج الجزئية (isFinal=false) تُعرض بخط باهت حتى تتثبت.
 */
export function TranscriptFeed({ events }: { events: TranscriptEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<UserRound className="h-8 w-8 text-slate-300" />}
        text="لا يوجد تفريغ بعد — انتظر بدء المحادثة"
      />
    );
  }

  return (
    <div className="flex max-h-[50vh] min-h-64 flex-col gap-3 overflow-y-auto p-3 scrollbar-thin">
      {events.map((ev) => {
        const isAgent = ev.speaker === 'AGENT';
        const isSystem = ev.speaker === 'SYSTEM';
        return (
          <div key={ev.id} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
            {isSystem ? (
              <p className="max-w-[80%] rounded-lg bg-slate-100 px-3 py-1.5 text-xs italic text-slate-400">
                {ev.text}
              </p>
            ) : (
              <div
                className={`flex max-w-[80%] gap-2 rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  isAgent
                    ? 'rounded-tr-sm bg-brand-600 text-white'
                    : 'rounded-tl-sm bg-slate-100 text-slate-800'
                } ${ev.isFinal ? '' : 'opacity-60'}`}
              >
                <span className="mt-0.5 shrink-0">
                  {isAgent ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                </span>
                <span>
                  {ev.text}
                  {!ev.isFinal && <span className="mr-1 animate-pulse">▍</span>}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
