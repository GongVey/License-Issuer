import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-on-primary shadow-sm', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="12" r="4" /><path d="M12.5 12H21M18 12v3M21 12v2.5" />
      </svg>
    </span>
  );
}
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'size-8' : undefined} />
      <div className="leading-tight">
        <div className="font-semibold">License Issuer</div>
        {!compact && <div className="text-xs text-muted">统一授权服务</div>}
      </div>
    </div>
  );
}
