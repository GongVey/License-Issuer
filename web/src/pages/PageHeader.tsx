import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, tabs, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 grid gap-4 md:mb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 text-[13px] text-muted">{eyebrow}</div>}
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[26px]">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {tabs}
    </div>
  );
}
