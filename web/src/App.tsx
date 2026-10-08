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
import { LogoMark } from './layout/Logo';

const PAGES: Record<string, { title: string; Page: () => React.JSX.Element }> = {
  '/overview': { title: '概览', Page: OverviewPage },
  '/cards': { title: '卡密', Page: CardsPage },
  '/batches': { title: '批次', Page: BatchesPage },
  '/logs': { title: '日志', Page: LogsPage },
  '/settings': { title: '设置', Page: SettingsPage },
};

export function App() {
  const { status, load, signOut } = useSessionLoader();
  if (status.kind === 'loading') return <div className="grid min-h-dvh place-items-center"><LogoMark className="animate-pulse" /></div>;
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
  useEffect(() => { document.title = `${page?.title ?? '概览'} · License Issuer`; window.scrollTo(0, 0); }, [page]);
  if (!page) return null;
  return <AppShell><page.Page key={path} /></AppShell>;
}

function ForcePassword() {
  const { session, signOut } = useSession();
  useEffect(() => { document.title = '设置新密码 · License Issuer'; }, []);
  return (
    <AuthLayout subtitle={`当前账号：${session.username}`}>
      <h1 className="text-xl font-semibold">请先设置新密码</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted">你正在使用初始密码。设置新密码后需要重新登录。</p>
      <AccountForm forced />
      <Button variant="ghost" className="mt-3 w-full" onClick={async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); }}>退出登录</Button>
    </AuthLayout>
  );
}
