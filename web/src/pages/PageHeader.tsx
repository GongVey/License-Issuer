import type { ReactNode } from 'react';

// Page header: optional eyebrow, a semibold title with an inline meta count, optional description, actions and tabs.
export function PageHeader({ title, description, actions, tabs, eyebrow, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode; eyebrow?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="mb-6 md:mb-7">
      {eyebrow && <p className="mb-1.5 text-xs font-medium text-muted">{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-tight font-semibold md:text-[26px]">{title}{meta && <span className="ml-2.5 align-middle font-sans text-sm font-normal tracking-normal text-muted">{meta}</span>}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-5">{tabs}</div>}
    </header>
  );
}
