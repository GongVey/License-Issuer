import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Loader2, Minus, Plus } from 'lucide-react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'soft';
type Size = 'sm' | 'md' | 'lg';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover shadow-sm',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-95 shadow-sm',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
  soft: 'bg-primary-soft text-primary hover:brightness-[.97]',
};
// Touch-friendly heights on phones, denser on desktop pointers.
const SIZES: Record<Size, string> = {
  sm: 'h-9 md:h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 md:h-9 px-3.5 gap-2 rounded-[10px]',
  lg: 'h-12 md:h-11 px-5 text-[15px] gap-2 rounded-xl',
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} {...rest}
      className={cn('relative inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-colors disabled:opacity-50', VARIANTS[variant], SIZES[size], className)}>
      {loading && <Loader2 className="absolute size-4 animate-spin" aria-hidden />}
      <span className={cn('inline-flex items-center gap-[inherit]', loading && 'invisible')}>{icon}{children}</span>
    </button>
  );
});
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton({ label, size = 'md', className, children, variant = 'ghost', ...rest }, ref) {
  const box = size === 'sm' ? 'size-9 md:size-8 px-0' : size === 'lg' ? 'size-12 px-0' : 'size-11 md:size-9 px-0';
  return <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={cn(box, className)} {...rest}>{children}</Button>;
});

const field = 'w-full rounded-[10px] border border-line-strong bg-surface text-fg placeholder:text-muted shadow-sm transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-11 md:h-9 px-3 text-base md:text-sm', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, 'px-3 py-2 text-base md:text-sm leading-relaxed resize-y', className)} {...rest} />;
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(field, 'h-11 md:h-9 appearance-none pl-3 pr-9 text-base md:text-sm')} {...rest}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1.5', className)}>
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Checkbox({ className, ...rest }: React.ComponentProps<'input'>) {
  return <input type="checkbox" className={cn('size-[18px] md:size-4 cursor-pointer rounded', className)} {...rest} />;
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', label }: {
  value: T; onChange: (value: T) => void; options: Array<{ value: T; label: ReactNode; count?: number }>; className?: string; size?: 'sm' | 'md'; label: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 scrollbar-none', className)}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 font-medium text-fg-2 transition-colors hover:text-fg',
            size === 'sm' ? 'h-8 md:h-7 text-[13px]' : 'h-9 md:h-8', option.value === value && 'bg-surface text-fg shadow-md')}>
          {option.label}
          {option.count !== undefined && <span className="tabular text-xs text-muted">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (value: number) => void; min: number; max: number; label: string }) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className="flex h-11 md:h-9 overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <button type="button" tabIndex={-1} aria-label="减少" className="grid w-11 md:w-9 place-items-center text-fg-2 hover:bg-hover disabled:opacity-40" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus className="size-4" /></button>
      <input id={id} aria-label={label} inputMode="numeric" type="number" min={min} max={max} value={value}
        onChange={e => onChange(e.target.value === '' ? min : clamp(Number(e.target.value)))}
        className="tabular w-full min-w-0 border-x border-line bg-transparent text-center text-base md:text-sm focus:outline-none" />
      <button type="button" tabIndex={-1} aria-label="增加" className="grid w-11 md:w-9 place-items-center text-fg-2 hover:bg-hover disabled:opacity-40" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus className="size-4" /></button>
    </div>
  );
}
