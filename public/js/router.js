// Hash router: #/view?param=value. `silent` updates the URL (for filters) without re-rendering.
let silentHash = null;
const listeners = new Set();
export const onRoute = fn => listeners.add(fn);
export function current() {
  const [path, search = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/overview', params: new URLSearchParams(search) };
}
export function navigate(path, params = {}, { replace = false, silent = false } = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const hash = `#${path}${search ? `?${search}` : ''}`;
  if (hash === location.hash) { if (!silent) for (const fn of listeners) fn(current()); return; }
  if (silent && !replace) silentHash = hash;
  if (replace) { history.replaceState(null, '', hash); if (!silent) for (const fn of listeners) fn(current()); }
  else location.hash = hash;
}
addEventListener('hashchange', () => {
  if (location.hash === silentHash) { silentHash = null; return; }
  silentHash = null;
  for (const fn of listeners) fn(current());
});
