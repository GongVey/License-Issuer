import { useCallback, useSyncExternalStore } from 'react';
import { storage } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const listeners = new Set<() => void>();
const media = matchMedia('(prefers-color-scheme: dark)');
media.addEventListener('change', () => listeners.forEach(fn => fn()));
const choice = (): ThemeChoice => (document.documentElement.dataset.theme as ThemeChoice) || 'system';
const isDark = () => choice() === 'dark' || (choice() === 'system' && media.matches);
const sync = () => {
  // Keep the browser chrome (mobile status bar) in step with the page.
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
};
export function setTheme(value: ThemeChoice) {
  if (value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = value;
  storage.set('theme', value === 'system' ? null : value);
  sync(); listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark);
  const current = useSyncExternalStore(subscribe, choice);
  const toggle = useCallback(() => setTheme(isDark() ? 'light' : 'dark'), []);
  return { dark, choice: current, toggle, setTheme };
}
