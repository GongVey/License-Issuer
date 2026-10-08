// Applied before first paint: cached theme choice and brand accent, so neither flashes. Storage may be unavailable.
try {
  const root = document.documentElement;
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  const accent = localStorage.getItem('accent');
  if (/^#[0-9a-f]{6}$/i.test(accent || '')) root.style.setProperty('--accent', accent);
} catch {}
