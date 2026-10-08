import { useSyncExternalStore } from 'react';

// Hash routing (#/cards?state=unused): the server only serves "/", and filters stay shareable and survive refresh.
export interface Route { path: string; params: URLSearchParams }
let cached: Route | null = null; let cachedHash = '';
function read(): Route {
  if (cached && cachedHash === location.hash) return cached;
  const [path, search = ''] = location.hash.replace(/^#/, '').split('?');
  cachedHash = location.hash;
  cached = { path: path || '/overview', params: new URLSearchParams(search) };
  return cached;
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
addEventListener('hashchange', emit);
export const useRoute = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, read);
export function href(path: string, params: Record<string, string | number | undefined | null> = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return `#${path}${search ? `?${search}` : ''}`;
}
export function navigate(path: string, params: Record<string, string | number | undefined | null> = {}, { replace = false } = {}) {
  const hash = href(path, params);
  if (hash === location.hash) return;
  if (replace) { history.replaceState(null, '', hash); emit(); } else location.hash = hash;
}
