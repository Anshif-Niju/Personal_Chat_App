import { ReactNode, useEffect } from 'react';
import clsx from 'clsx';
import { Users, X, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useUi } from '../store/ui';

const COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const SIZES = { xs: 'h-6 w-6 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-28 w-28 text-3xl' };

export function Avatar({
  name,
  url,
  size = 'md',
  online,
  group,
  className,
}: {
  name: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  online?: boolean | null;
  group?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <div className={clsx('relative shrink-0', className)}>
      {url ? (
        <img src={url} alt="" className={clsx('rounded-full object-cover', SIZES[size])} loading="lazy" />
      ) : (
        <div className={clsx('flex items-center justify-center rounded-full font-semibold text-white', SIZES[size], colorFor(name))}>
          {group ? <Users className="h-1/2 w-1/2" /> : initials || '?'}
        </div>
      )}
      {online && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900',
            size === 'lg' || size === 'xl' ? 'h-4 w-4' : 'h-3 w-3',
          )}
        />
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'flex max-h-[92vh] w-full animate-pop flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="icon-btn -mr-2 h-9 w-9" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'h-5 w-5')} />;
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? AlertCircle : t.kind === 'success' ? CheckCircle2 : Info;
        return (
          <button
            key={t.id}
            onClick={() => {
              t.onClick?.();
              dismiss(t.id);
            }}
            className="pointer-events-auto flex w-full max-w-sm animate-fade items-start gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          >
            <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', t.kind === 'error' ? 'text-red-500' : t.kind === 'success' ? 'text-emerald-500' : 'text-brand-500')} />
            <div className="min-w-0">
              {t.title && <div className="text-sm font-semibold">{t.title}</div>}
              <div className="text-sm text-slate-600 dark:text-slate-300">{t.message}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}
