import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, Loader2, Minus, Plus } from 'lucide-react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'soft';
type Size = 'sm' | 'md' | 'lg';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.14)]',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover shadow-xs',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-95 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.14)]',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
  soft: 'bg-primary-soft text-primary-strong hover:brightness-[.97]',
};
// Touch-friendly heights on phones, denser on desktop pointers.
const SIZES: Record<Size, string> = {
  sm: 'h-9 md:h-7 px-2.5 text-[13px] gap-1.5 rounded-lg [&_svg]:size-3.5',
  md: 'h-11 md:h-8 px-3 text-[13px] gap-1.5 rounded-lg [&_svg]:size-4',
  lg: 'h-12 md:h-10 px-4 text-sm gap-2 rounded-[10px] [&_svg]:size-4',
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} {...rest}
      className={cn('relative inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,filter] disabled:opacity-50', VARIANTS[variant], SIZES[size], className)}>
      {loading && <Loader2 className="absolute animate-spin" aria-hidden />}
      <span className={cn('inline-flex items-center gap-[inherit]', loading && 'invisible')}>{icon}{children}</span>
    </button>
  );
});
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton({ label, size = 'md', className, children, variant = 'ghost', ...rest }, ref) {
  const box = size === 'sm' ? 'size-9 md:size-7 px-0' : size === 'lg' ? 'size-12 md:size-10 px-0' : 'size-11 md:size-8 px-0';
  return <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={cn(box, className)} {...rest}>{children}</Button>;
});

const field = 'w-full rounded-lg border border-line-strong bg-surface text-fg placeholder:text-muted shadow-xs transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--line-strong)_70%,var(--fg))] focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/20 disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-11 md:h-8 px-3 text-base md:text-[13px]', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, 'px-3 py-2 text-base md:text-[13px] leading-relaxed resize-y', className)} {...rest} />;
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(field, 'h-11 md:h-8 appearance-none pl-3 pr-8 text-base md:text-[13px]')} {...rest}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1.5', className)}>
      <span className="text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Checkbox({ className, ...rest }: React.ComponentProps<'input'>) {
  return <input type="checkbox" className={cn('size-[18px] md:size-4 cursor-pointer rounded', className)} {...rest} />;
}
export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 text-left">
      <span className="min-w-0"><span className="block text-[13px] font-medium">{label}</span>{description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}</span>
      <span className={cn('relative inline-flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors md:h-5 md:w-9', checked ? 'bg-primary' : 'bg-surface-3')}>
        <span className={cn('size-5 rounded-full bg-white shadow-sm transition-transform md:size-4', checked && 'translate-x-4')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, label }: {
  value: T; onChange: (value: T) => void; options: Array<{ value: T; label: ReactNode; count?: number }>; className?: string; label: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-2 p-0.5 ring-1 ring-line ring-inset scrollbar-none', className)}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
          className={cn('inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-fg md:h-7 md:px-2.5',
            option.value === value && 'bg-surface text-fg shadow-sm ring-1 ring-line')}>
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
  const step = 'grid w-11 place-items-center text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 md:w-8';
  return (
    <div className="flex h-11 overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xs focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20 md:h-8">
      <button type="button" tabIndex={-1} aria-label="减少" className={step} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus className="size-3.5" /></button>
      <input id={id} aria-label={label} inputMode="numeric" type="number" min={min} max={max} value={value}
        onChange={e => onChange(e.target.value === '' ? min : clamp(Number(e.target.value)))}
        className="tabular w-full min-w-0 border-x border-line bg-transparent text-center text-base font-medium focus:outline-none md:text-[13px]" />
      <button type="button" tabIndex={-1} aria-label="增加" className={step} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus className="size-3.5" /></button>
    </div>
  );
}

// Swatches for quick picks plus a native picker for any brand color — no fixed color list to maintain per product.
export function ColorPicker({ value, onChange, swatches, label }: { value: string; onChange: (hex: string) => void; swatches: string[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {swatches.map(color => (
        <button key={color} type="button" aria-label={color} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)}
          className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-105 aria-pressed:ring-2 aria-pressed:ring-[var(--swatch)] md:size-6"
          style={{ background: color, '--swatch': color } as React.CSSProperties}>
          {value.toLowerCase() === color && <Check className="size-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
      <label className="relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line-strong py-0.5 pr-2.5 pl-0.5 text-xs text-fg-2 hover:bg-hover md:h-6">
        <span className="size-7 rounded-full md:size-5" style={{ background: value }} />
        <span className="font-mono uppercase">{value}</span>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={`${label}：自定义颜色`} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}
