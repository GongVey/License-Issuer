import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, setUnauthorizedHandler } from './lib/api';
import { applyBranding } from './lib/brand';
import type { Product, Session, Settings } from './lib/types';

interface SessionValue {
  session: Session; settings: Settings;
  product: (id: string) => Product;
  setSettings: (settings: Settings) => void;
  signOut: (message?: string) => void;
}
const SessionContext = createContext<SessionValue | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

type Status = { kind: 'loading' } | { kind: 'signed-out'; message?: string } | { kind: 'signed-in'; session: Session };
export function useSessionLoader() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const queryClient = useQueryClient();
  const load = useCallback(async () => {
    try {
      const session = await api<Session>('/api/session');
      setCsrf(session.csrf);
      setStatus({ kind: 'signed-in', session });
    } catch (error) {
      setStatus({ kind: 'signed-out', message: (error as { status?: number }).status === 401 ? undefined : (error as Error).message });
    }
  }, []);
  const signOut = useCallback((message?: string) => {
    setCsrf(''); queryClient.clear();
    for (const dialog of document.querySelectorAll('dialog[open]')) (dialog as HTMLDialogElement).close();
    setStatus({ kind: 'signed-out', message });
  }, [queryClient]);
  useEffect(() => { load(); }, [load]);
  const signedIn = status.kind === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    setUnauthorizedHandler(() => signOut('登录已过期，请重新登录。'));
    return () => setUnauthorizedHandler(null);
  }, [signedIn, signOut]);
  return { status, load, signOut, setStatus };
}

export function SessionProvider({ session, signOut, children }: { session: Session; signOut: (message?: string) => void; children: ReactNode }) {
  const [settings, setSettings] = useState(session.settings);
  useEffect(() => { applyBranding(settings.branding); }, [settings.branding]);
  const value = useMemo<SessionValue>(() => ({
    session, settings, setSettings, signOut,
    product: id => settings.products.find(p => p.id === id) || { id, name: id || '—', color: '#64748b' },
  }), [session, settings, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
