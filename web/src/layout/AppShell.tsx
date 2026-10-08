import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CreditCard, Layers, LayoutDashboard, LogOut, Moon, Plus, Search, Settings, Sun } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { href, useRoute } from '../lib/router';
import { useTheme } from '../lib/theme';
import type { Dashboard } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { IconButton } from '../ui/controls';
import { ProductAvatar } from '../ui/display';
import { BrandMark } from './Logo';

export const NAV = [
  { path: '/overview', label: '概览', icon: LayoutDashboard },
  { path: '/cards', label: '卡密', icon: CreditCard },
  { path: '/batches', label: '批次', icon: Layers },
  { path: '/logs', label: '日志', icon: Activity },
];
// Phone tab bar: four destinations around a central "generate" action; batches live under the cards tab.
const TABS = [NAV[0], NAV[1], null, NAV[3], { path: '/settings', label: '设置', icon: Settings }];

function NavItem({ to, active, icon, children, trailing }: { to: string; active: boolean; icon: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <a href={to} aria-current={active ? 'page' : undefined}
      className={cn('group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] font-medium text-fg-2 transition-colors hover:bg-surface-3/60 hover:text-fg',
        active && 'bg-surface text-fg shadow-xs ring-1 ring-line hover:bg-surface')}>
      <span className={cn('grid size-4 place-items-center text-muted group-hover:text-fg-2 [&>svg]:size-4', active && 'text-primary group-hover:text-primary')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </a>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { path, params } = useRoute();
  const { session, settings, signOut } = useSession();
  const { openLookup, openGenerate } = useOverlays();
  const { dark, toggle } = useTheme();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const brand = settings.branding;
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset() })}`), refetchInterval: 60000 });
  const stock = new Map(dashboard.data?.products.map(p => [p.productId, p.unused]));
  const tabActive = (p: string) => path === p || (p === '/cards' && path === '/batches');
  const logout = async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openLookup(); return; }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.key === 'n') { event.preventDefault(); openGenerate(); }
      if (event.key === '/') { event.preventDefault(); const search = document.getElementById('page-search'); if (search) search.focus(); else openLookup(); }
    };
    // Pasting a card code or machine code outside an input jumps straight to lookup.
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(target.tagName) || document.querySelector('dialog[open]')) return;
      const text = event.clipboardData?.getData('text')?.trim() || '';
      if (/^LIC-/i.test(text) || /^sha256:/i.test(text)) { event.preventDefault(); openLookup(text); }
    };
    addEventListener('keydown', onKey); addEventListener('paste', onPaste);
    return () => { removeEventListener('keydown', onKey); removeEventListener('paste', onPaste); };
  }, [openLookup, openGenerate]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-2/60 md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <BrandMark name={brand.name} />
          <div className="min-w-0 leading-tight"><p className="truncate text-[13px] font-semibold">{brand.name}</p>{brand.tagline && <p className="truncate text-xs text-muted">{brand.tagline}</p>}</div>
        </div>
        <div className="flex gap-1.5 px-3 pb-3">
          <button type="button" onClick={() => openLookup()}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-muted shadow-xs transition-colors hover:border-line-strong hover:text-fg-2">
            <Search className="size-3.5 shrink-0" /><span className="flex-1 truncate text-left">搜索</span>
            <kbd className="rounded border border-line px-1 font-sans text-[10.5px] text-muted">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <IconButton label="生成卡密（N）" variant="primary" size="sm" className="md:size-8" onClick={() => openGenerate()}><Plus /></IconButton>
        </div>
        <nav aria-label="主导航" className="grid gap-0.5 px-3">
          {NAV.map(({ path: p, label, icon: Icon }) => <NavItem key={p} to={`#${p}`} active={path === p && !(p === '/cards' && params.get('productId'))} icon={<Icon />}>{label}</NavItem>)}
        </nav>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted">产品</p>
          <div className="grid gap-0.5">
            {settings.products.map(p => (
              <NavItem key={p.id} to={href('/cards', { productId: p.id })} active={path === '/cards' && params.get('productId') === p.id}
                icon={<ProductAvatar id={p.id} name={p.name} color={p.color} size="sm" className="size-4 rounded-[4px] text-[9px]" />}
                trailing={stock.has(p.id) && <span className="tabular text-xs text-muted" title="可售库存">{stock.get(p.id)}</span>}>
                {p.name}
              </NavItem>
            ))}
          </div>
        </div>
        <div className="grid gap-0.5 border-t border-line px-3 py-3">
          <NavItem to="#/settings" active={path === '/settings'} icon={<Settings />}>设置</NavItem>
          <div className="mt-1 flex items-center gap-2 px-1">
            <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-xs font-semibold uppercase text-fg-2">{session.username.slice(0, 1)}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{session.username}</span>
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} size="sm" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
            <IconButton label="退出登录" size="sm" onClick={logout}><LogOut /></IconButton>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center gap-2.5 px-4">
            <BrandMark name={brand.name} className="size-8" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{brand.name}</span>
            <IconButton label="搜索" variant="secondary" className="size-10" onClick={() => openLookup()}><Search /></IconButton>
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} variant="secondary" className="size-10" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-10 md:pt-9 md:pb-14">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="主导航" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
        <div className="grid h-16 grid-cols-5">
          {TABS.map((tab, i) => tab ? (
            <a key={tab.path} href={href(tab.path)} aria-current={tabActive(tab.path) ? 'page' : undefined}
              className={cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted', tabActive(tab.path) && 'text-primary')}>
              <tab.icon className="size-[22px]" strokeWidth={tabActive(tab.path) ? 2.2 : 1.8} />{tab.label}
            </a>
          ) : (
            <div key={i} className="grid place-items-center">
              <button type="button" aria-label="生成卡密" onClick={() => openGenerate()}
                className="-mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-lg ring-4 ring-bg transition-transform active:scale-95">
                <Plus className="size-6" strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
