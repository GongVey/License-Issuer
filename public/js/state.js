// Shared session state and a minimal change bus so views can refresh after mutations elsewhere.
export const state = { session: null, settings: null };
const handlers = new Set();
export const onChange = fn => { handlers.add(fn); return () => handlers.delete(fn); };
export const changed = topic => { for (const fn of [...handlers]) fn(topic); };

export const storage = {
  get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {} },
};
