import { cn } from '../lib/cn';

// Seal-style mark (印章): the brand's first character inside an inner frame on the accent color.
// Renaming the brand or changing its color needs no artwork.
export function BrandMark({ name, className, inverted }: { name: string; className?: string; inverted?: boolean }) {
  return (
    <span aria-hidden className={cn('relative grid size-8 shrink-0 place-items-center rounded-[7px] font-display text-[15px] font-semibold',
      inverted ? 'bg-ink-fg text-ink' : 'bg-primary text-on-primary',
      'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.25)]', className)}>
      <span className={cn('absolute inset-[3px] rounded-[4px] border', inverted ? 'border-ink/25' : 'border-white/40')} />
      <span className="relative leading-none">{Array.from(name.trim())[0]?.toUpperCase() || '·'}</span>
    </span>
  );
}

// Wordmark: CJK part upright, a trailing Latin part (e.g. "Studio") in italic serif, so "知白Studio" reads as a logotype.
export function Wordmark({ name, className }: { name: string; className?: string }) {
  const match = /^(.*?[^\x00-\x7F])\s*([A-Za-z][\w .&-]*)$/.exec(name.trim());
  return (
    <span className={cn('font-display font-semibold tracking-tight', className)}>
      {match ? <>{match[1]}<em className="ml-0.5 font-normal italic">{match[2]}</em></> : name}
    </span>
  );
}
