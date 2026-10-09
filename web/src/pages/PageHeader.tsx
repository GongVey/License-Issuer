import type { ReactNode } from 'react';

// Page header: small-caps eyebrow with an accent dot, a bold title, optional description, actions and tabs.
export function PageHeader({ title, description, actions, tabs, eyebrow, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode; eyebrow?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="mb-6 md:mb-8">
      {eyebrow && <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase"><span className="size-1.5 rounded-full bg-primary" aria-hidden />{eyebrow}</p>}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-bold md:text-[32px]">{title}{meta && <span className="ml-3 align-middle font-sans text-sm font-normal tracking-normal text-muted">{meta}</span>}</h1>
          {description && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-6">{tabs}</div>}
    </header>
  );
}
