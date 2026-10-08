import { useEffect } from 'react';
import { api } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { AppShell } from './layout/AppShell';
import { OverlayProvider } from './overlays';
import { BatchesPage } from './pages/Batches';
import { CardsPage } from './pages/Cards';
import { AuthLayout, LoginPage } from './pages/Login';
import { LogsPage } from './pages/Logs';
import { OverviewPage } from './pages/Overview';
import { AccountForm, SettingsPage } from './pages/Settings';
import { SessionProvider, useSession, useSessionLoader } from './session';
import { Button } from './ui/controls';
import { BrandMark } from './layout/Logo';
import { cachedBrandName } from './lib/brand';

const PAGES: Record<string, { title: string; Page: () => React.JSX.Element }> = {
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
  const { settings } = useSession();
  useEffect(() => { document.title = `${page?.title ?? '概览'} · ${settings.branding.name}`; window.scrollTo(0, 0); }, [page, settings.branding.name]);
  if (!page) return null;
  return <AppShell><page.Page key={path} /></AppShell>;
}

function ForcePassword() {
  const { session, settings, signOut } = useSession();
  useEffect(() => { document.title = `设置新密码 · ${settings.branding.name}`; }, [settings.branding.name]);
  const branding = { ...settings.branding, products: settings.branding.showProducts ? settings.products : [] };
  return (
    <AuthLayout branding={branding}>
      <h1 className="text-2xl font-semibold tracking-tight">设置新密码</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted">账号 {session.username} 正在使用初始密码，设置新密码后需要重新登录。</p>
      <AccountForm forced />
      <Button variant="ghost" className="mt-3 w-full" onClick={async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); }}>退出登录</Button>
    </AuthLayout>
  );
}
