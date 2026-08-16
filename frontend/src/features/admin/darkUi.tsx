import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/** بطاقة — بوابة الإدارة المركزية (Light Mode) */
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
    <section className={`rounded-[10px] border border-[#E5E7EB] bg-white ${className}`}>
      {(title || hint || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold text-[#111111]">{title}</h3>
            {hint && <p className="mt-0.5 text-[12px] text-[#667085]">{hint}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
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
    indigo: 'bg-brand-100 text-brand-600',
    green: 'bg-ok-50 text-ok-600',
    amber: 'bg-warn-50 text-warn-600',
    red: 'bg-danger-50 text-danger-500',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#667085]">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2.5 text-[24px] font-bold text-[#111111]" dir="ltr">
        {value}
      </p>
    </div>
  );
}

const darkField =
  'w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-[13px] text-[#111111] placeholder:text-[#98A2B3] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12';

export function DarkInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={darkField} />;
}

export function DarkTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${darkField} min-h-32 text-[13px] leading-relaxed`} />;
}

export function DarkSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={darkField}>
      {props.children}
    </select>
  );
}

export function DarkField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#475467]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-[#667085]">{hint}</span>}
    </label>
  );
}

/** شارة حالة فاتحة */
export function DarkBadge({
  tone = 'gray',
  children,
}: {
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'violet';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    green: 'bg-[#ECFDF3] text-[#12B76A]',
    red: 'bg-[#FEF3F2] text-[#D92D20]',
    amber: 'bg-[#FFFAEB] text-[#B54708]',
    blue: 'bg-brand-100 text-brand-700',
    violet: 'bg-violet-50 text-violet-600',
    gray: 'bg-[#F2F4F7] text-[#667085]',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-[5px] text-[12px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** إشعار (خطأ/نجاح) */
export function DarkNotice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-[13px] ${
        kind === 'ok'
          ? 'border-ok-200 bg-ok-50 text-ok-600'
          : 'border-danger-200 bg-danger-50 text-danger-500'
      }`}
    >
      {children}
    </div>
  );
}
