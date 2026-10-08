import { useEffect, useState } from 'react';
import { storage } from './storage';
import type { PublicBranding } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
// Apply the brand accent and remember it so theme.js can set it before the next first paint.
export function applyBranding(branding: { name: string; accent: string }) {
  if (HEX.test(branding.accent)) { document.documentElement.style.setProperty('--accent', branding.accent); storage.set('accent', branding.accent); }
  storage.set('brand-name', branding.name);
}
export const cachedBrandName = () => storage.get('brand-name', '知白Studio');

// The sign-in page reads public branding (name, tagline, accent and, if allowed, product names).
export function usePublicBranding() {
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/branding', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then((value: PublicBranding | null) => {
      if (alive && value) { setBranding(value); applyBranding(value); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return branding;
}
