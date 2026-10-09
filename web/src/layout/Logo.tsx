import { cn } from '../lib/cn';

// Brand mark (知白守黑): the brand's first character reversed out of an ink tile, with one accent "seal" dot in the corner.
// `inverted` is for dark grounds (white tile, ink character); `stamp` presses the seal dot in with a short animation. Renaming the brand or changing its color needs no artwork.
export function BrandMark({ name, className, inverted, stamp }: { name: string; className?: string; inverted?: boolean; stamp?: boolean }) {
  return (
    <span aria-hidden className={cn('relative grid size-8 shrink-0 place-items-center rounded-[9px] font-display text-[15px] font-bold',
      inverted ? 'bg-ink-fg text-ink' : 'bg-fg text-bg', className)}>
      <span className="relative leading-none">{Array.from(name.trim())[0]?.toUpperCase() || '·'}</span>
      <span className={cn('absolute right-[14%] bottom-[14%] size-[18%] min-h-1 min-w-1 rounded-[1.5px] bg-[color-mix(in_oklab,var(--accent)_80%,white)]', stamp && 'anim-stamp')} />
    </span>
  );
}

// Wordmark: a trailing Latin part (e.g. "Studio") is set lighter, so "知白Studio" reads as a logotype.
export function Wordmark({ name, className }: { name: string; className?: string }) {
  const match = /^(.*?[^\x00-\x7F])\s*([A-Za-z][\w .&-]*)$/.exec(name.trim());
  return (
    <span className={cn('font-display font-semibold tracking-tight', className)}>
      {match ? <>{match[1]}<span className="ml-0.5 font-medium opacity-50">{match[2]}</span></> : name}
    </span>
  );
}
