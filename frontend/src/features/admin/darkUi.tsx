import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/** بطاقة داكنة — بوابة الإدارة المركزية (Dark Mode) */
export function DarkCard({
  title,
  hint,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-700/60 bg-slate-800/60 shadow-card ${className}`}>
      {(title || hint || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** بطاقة إحصائية في لوحة القيادة */
export function StatCard({
  label,
  value,
  icon,
  tone = 'indigo',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'indigo' | 'green' | 'amber' | 'red' | 'sky' | 'violet';
}) {
  const tones: Record<string, string> = {
    indigo: 'bg-brand-500/10 text-brand-400 ring-brand-500/20',
    green: 'bg-ok-500/10 text-ok-500 ring-ok-500/20',
    amber: 'bg-warn-500/10 text-warn-500 ring-warn-500/20',
    red: 'bg-danger-500/10 text-danger-500 ring-danger-500/20',
    sky: 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
    violet: 'bg-violet-500/10 text-violet-400 ring-violet-500/20',
  };
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-white" dir="ltr">
        {value}
      </p>
    </div>
  );
}

const darkField =
  'w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

export function DarkInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={darkField} />;
}

export function DarkTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${darkField} min-h-32 font-mono text-xs leading-relaxed`} />;
}

export function DarkSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${darkField} bg-slate-900`}>
      {props.children}
    </select>
  );
}

export function DarkField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** شارة حالة داكنة */
export function DarkBadge({
  tone = 'gray',
  children,
}: {
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'violet';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    green: 'bg-ok-500/10 text-ok-400 ring-ok-500/30',
    red: 'bg-danger-500/10 text-danger-400 ring-danger-500/30',
    amber: 'bg-warn-500/10 text-warn-400 ring-warn-500/30',
    blue: 'bg-brand-500/10 text-brand-300 ring-brand-500/30',
    violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
    gray: 'bg-slate-700/50 text-slate-300 ring-slate-600',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** إشعار (خطأ/نجاح) داكن */
export function DarkNotice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        kind === 'ok'
          ? 'border-ok-500/30 bg-ok-500/10 text-ok-400'
          : 'border-danger-500/30 bg-danger-500/10 text-danger-400'
      }`}
    >
      {children}
    </div>
  );
}
