import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, tabs }: { title: string; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="mb-5 grid gap-3 md:mb-6">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight md:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {tabs}
    </div>
  );
}
