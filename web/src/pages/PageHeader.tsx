import type { ReactNode } from 'react';

// Editorial page header: small-caps eyebrow with a seal-red dot, a display-serif title, then a fading hairline.
export function PageHeader({ title, description, actions, tabs, eyebrow, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode; eyebrow?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="mb-7 md:mb-10">
      {eyebrow && <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase"><span className="size-1.5 rounded-full bg-primary" aria-hidden />{eyebrow}</p>}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-[1.1] font-semibold md:text-[40px]">{title}{meta && <span className="ml-3 align-middle font-sans text-sm font-normal tracking-normal text-muted">{meta}</span>}</h1>
          {description && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-6">{tabs}</div>}
    </header>
  );
}
