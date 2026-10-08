// Applied before first paint to avoid a light/dark flash. Storage may be unavailable; the system theme is the fallback.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {}
