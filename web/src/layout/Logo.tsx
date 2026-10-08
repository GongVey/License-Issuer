import { cn } from '../lib/cn';

// The brand mark is the brand's first character on the accent color, so renaming the brand needs no artwork.
export function BrandMark({ name, className, inverted }: { name: string; className?: string; inverted?: boolean }) {
  return (
    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-[9px] text-[15px] font-bold',
      inverted ? 'bg-white text-[color-mix(in_oklab,var(--accent)_80%,black)]' : 'bg-primary text-on-primary',
      'shadow-[inset_0_1px_0_rgb(255_255_255/0.25),inset_0_-1px_0_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.15)]', className)}>
      {Array.from(name.trim())[0]?.toUpperCase() || '·'}
    </span>
  );
}
