import { cn } from '../lib/cn';
import { href, useRoute } from '../lib/router';

// On phones, batches share the "卡密" tab; these tabs switch between the two views.
export function SectionTabs() {
  const { path } = useRoute();
  return (
    <nav aria-label="卡密视图" className="flex gap-1 rounded-xl bg-surface-2 p-1 md:hidden">
      {[['/cards', '卡密'], ['/batches', '批次']].map(([p, label]) => (
        <a key={p} href={href(p)} aria-current={path === p ? 'page' : undefined}
          className={cn('flex h-9 flex-1 items-center justify-center rounded-lg text-[13px] font-medium text-fg-2', path === p && 'bg-surface text-fg shadow-md')}>{label}</a>
      ))}
    </nav>
  );
}
