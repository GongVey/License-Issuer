import { lazy, Suspense, useEffect } from 'react';
import { api } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { AppShell } from './layout/AppShell';
import { OverlayProvider } from './overlays';
import { BatchesPage } from './pages/Batches';
import { CardsPage } from './pages/Cards';
import { AuthLayout, LoginPage } from './pages/Login';
import { LogsPage } from './pages/Logs';
import { AccountForm, SettingsPage } from './pages/Settings';
import { SessionProvider, useSession, useSessionLoader } from './session';
import { Button } from './ui/controls';
import { BrandMark } from './layout/Logo';
import { Skeleton } from './ui/display';
import { ErrorBoundary, lazyPage } from './ui/ErrorBoundary';
import { cachedBrandName } from './lib/brand';

// The overview carries the chart library, so it loads on demand and the other pages stay light.
const loadOverview = lazyPage(() => import('./pages/Overview'));
const OverviewPage = lazy(() => loadOverview().then(m => ({ default: m.OverviewPage })));

const PAGES: Record<string, { title: string; Page: React.ComponentType }> = {
  '/overview': { title: '概览', Page: OverviewPage },
  '/cards': { title: '卡密', Page: CardsPage },
  '/batches': { title: '批次', Page: BatchesPage },
  '/logs': { title: '日志', Page: LogsPage },
  '/settings': { title: '设置', Page: SettingsPage },
};

export function App() {
  const { status, load, signOut } = useSessionLoader();
  if (status.kind === 'loading') return <div className="grid min-h-dvh place-items-center"><BrandMark name={cachedBrandName()} className="animate-pulse" /></div>;
  if (status.kind === 'signed-out') return <LoginPage message={status.message} onSignedIn={load} />;
  return (
    <SessionProvider key={status.session.csrf} session={status.session} signOut={signOut}>
      {status.session.mustChangePassword ? <ForcePassword /> : <OverlayProvider><Routes /></OverlayProvider>}
    </SessionProvider>
  );
}

function Routes() {
  const { path } = useRoute();
  const page = PAGES[path];
  useEffect(() => { if (!page) navigate('/overview', {}, { replace: true }); }, [page]);
  // Warm the overview chunk once signed in, so opening it later shows content immediately.
  useEffect(() => { const id = setTimeout(() => { loadOverview().catch(() => {}); }, 1500); return () => clearTimeout(id); }, []);
  const { settings } = useSession();
  useEffect(() => { document.title = `${page?.title ?? '概览'} · ${settings.branding.name}`; window.scrollTo(0, 0); }, [page, settings.branding.name]);
  if (!page) return null;
  return (
    <AppShell>
      <ErrorBoundary resetKey={path}><Suspense fallback={<PageSkeleton />}><page.Page key={path} /></Suspense></ErrorBoundary>
    </AppShell>
  );
}

// Shown while a lazily loaded page arrives: the overview's layout in outline, so the screen is never empty.
function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在加载">
      <Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-8 w-64" /><Skeleton className="mt-3 mb-7 h-4 w-80 max-w-full" />
      <Skeleton className="h-[390px] rounded-xl" />
      <div className="mt-4 grid gap-4 lg:grid-cols-5"><Skeleton className="h-64 rounded-xl lg:col-span-2" /><Skeleton className="h-64 rounded-xl lg:col-span-3" /></div>
    </div>
  );
}

function ForcePassword() {
  const { session, settings, signOut } = useSession();
  useEffect(() => { document.title = `设置新密码 · ${settings.branding.name}`; }, [settings.branding.name]);
  const branding = { ...settings.branding, products: settings.branding.showProducts ? settings.products : [] };
  return (
    <AuthLayout branding={branding} title="设置新密码" subtitle={<>账号 {session.username} 正在使用初始密码，设置后需要重新登录</>}>
      <AccountForm forced />
      <Button variant="ghost" className="mt-3 w-full" onClick={async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); }}>退出登录</Button>
    </AuthLayout>
  );
}
