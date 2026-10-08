import { useEffect, useState, useSyncExternalStore } from 'react';

export function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return debounced;
}
export function useMediaQuery(query: string) {
  return useSyncExternalStore(fn => { const m = matchMedia(query); m.addEventListener('change', fn); return () => m.removeEventListener('change', fn); },
    () => matchMedia(query).matches);
}
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
// Re-render periodically so relative times ("3 分钟前") stay fresh.
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
