import { Loader2, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
} from 'react';

// ————————————————— Button —————————————————
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-[13px]',
    lg: 'h-12 px-6 text-[15px]',
  };
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
    secondary: 'bg-white text-[#344054] border border-[#D0D5DD] hover:bg-[#F9FAFB]',
    danger: 'bg-danger-500 text-white hover:bg-danger-600',
    success: 'bg-ok-500 text-white hover:bg-ok-600',
    ghost: 'text-[#667085] hover:bg-[#F2F4F7]',
  };
  return (
    <button
      {...props}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ————————————————— Card —————————————————
export function Card({
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
    <div className={`rounded-[10px] border border-[#E5E7EB] bg-white ${className}`}>
      {(title || hint || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold text-[#111111]">{title}</h3>
            {hint && <p className="mt-0.5 text-[12px] text-[#667085]">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ————————————————— Badge —————————————————
export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray';

const toneMap: Record<BadgeTone, string> = {
  green: 'bg-[#ECFDF3] text-[#12B76A]',
  red: 'bg-[#FEF3F2] text-[#D92D20]',
  amber: 'bg-[#FFFAEB] text-[#B54708]',
  blue: 'bg-brand-100 text-brand-700',
  gray: 'bg-[#F2F4F7] text-[#667085]',
};

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-[5px] text-[12px] font-medium ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

// ————————————————— Toggle —————————————————
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
          checked ? 'bg-brand-500' : 'bg-[#D0D5DD]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'right-0.5' : 'right-[22px]'
          }`}
        />
      </button>
      <span>
        <span className="block text-[13px] font-medium text-[#111111]">{label}</span>
        {hint && <span className="block text-[12px] text-[#667085]">{hint}</span>}
      </span>
    </label>
  );
}

// ————————————————— Inputs —————————————————
const fieldClass =
  'w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-[13px] text-[#111111] placeholder:text-[#98A2B3] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/12';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#475467]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-[#667085]">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} min-h-24`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass} />;
}

// ————————————————— Modal —————————————————
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white border border-[#E5E7EB] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-[#111111]">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-[#667085] hover:bg-[#F2F4F7]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ————————————————— Spinner —————————————————
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[#667085]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-[13px]">{label}</span>}
    </div>
  );
}

// ————————————————— PageHeader —————————————————
export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold text-[#111111]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[#667085]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ————————————————— EmptyState —————————————————
export function EmptyState({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon}
      <p className="text-[13px] text-[#98A2B3]">{text}</p>
    </div>
  );
}
