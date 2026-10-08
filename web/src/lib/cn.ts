import { twMerge } from 'tailwind-merge';

// Later classes win over earlier conflicting ones (e.g. a caller's `md:h-9` replaces a component's `md:h-8`),
// so component defaults can always be overridden from outside regardless of stylesheet order.
export const cn = (...parts: Array<string | false | null | undefined>) => twMerge(parts.filter(Boolean).join(' '));
