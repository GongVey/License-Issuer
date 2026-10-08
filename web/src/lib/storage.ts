// Browser storage may be unavailable (private mode, blocked site data); every access degrades to the fallback.
export const storage = {
  get(key: string, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key: string, value: string | null) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ } },
};
