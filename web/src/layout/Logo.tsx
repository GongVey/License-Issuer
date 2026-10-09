import { cn } from '../lib/cn';

// Brand mark: the brand's first character on an accent gradient tile.
// Renaming the brand or changing its color needs no artwork.
export function BrandMark({ name, className, inverted }: { name: string; className?: string; inverted?: boolean }) {
  return (
    <span aria-hidden className={cn('relative grid size-8 shrink-0 place-items-center rounded-[9px] font-display text-[15px] font-bold',
      inverted ? 'bg-ink-fg text-ink' : 'bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_75%,white),var(--accent)_55%,color-mix(in_oklab,var(--accent)_80%,black))] text-on-primary',
      'shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_6px_-1px_color-mix(in_oklab,var(--accent)_45%,transparent)]', className)}>
      <span className="relative leading-none">{Array.from(name.trim())[0]?.toUpperCase() || '·'}</span>
    </span>
  );
}

// Wordmark: a trailing Latin part (e.g. "Studio") is set lighter, so "知白Studio" reads as a logotype.
export function Wordmark({ name, className }: { name: string; className?: string }) {
  const match = /^(.*?[^\x00-\x7F])\s*([A-Za-z][\w .&-]*)$/.exec(name.trim());
  return (
    <span className={cn('font-display font-semibold tracking-tight', className)}>
      {match ? <>{match[1]}<span className="ml-0.5 font-normal opacity-60">{match[2]}</span></> : name}
    </span>
  );
}
