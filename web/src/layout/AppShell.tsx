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
import { BrandMark, Wordmark } from './Logo';

export const NAV = [
  { path: '/overview', label: '概览', icon: LayoutDashboard },
  { path: '/cards', label: '卡密', icon: CreditCard },
  { path: '/batches', label: '批次', icon: Layers },
  { path: '/logs', label: '日志', icon: Activity },
];
// Phone tab bar: four destinations around a central "generate" action; batches live under the cards tab.
const TABS = [NAV[0], NAV[1], null, NAV[3], { path: '/settings', label: '设置', icon: Settings }];

// Sidebar item: the active entry is lifted and marked with an accent bar on its left edge.
function InkItem({ to, active, icon, children, trailing }: { to: string; active: boolean; icon: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <a href={to} aria-current={active ? 'page' : undefined}
      className={cn('group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-ink-fg/70 transition-colors hover:bg-ink-2 hover:text-ink-fg',
        active && 'bg-[color-mix(in_oklab,var(--accent)_22%,var(--ink-2))] text-ink-fg')}>
      {active && <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-[color-mix(in_oklab,var(--accent)_70%,white)]" aria-hidden />}
      <span className={cn('grid size-4 place-items-center text-ink-muted group-hover:text-ink-fg/80 [&>svg]:size-4', active && 'text-ink-fg')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </a>
  );
}
const Label = ({ children }: { children: ReactNode }) => <p className="px-3 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{children}</p>;

export function AppShell({ children }: { children: ReactNode }) {
  const { path, params } = useRoute();
  const { session, settings, signOut } = useSession();
  const { openLookup, openGenerate } = useOverlays();
  const { dark, toggle } = useTheme();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const brand = settings.branding;
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset() })}`), refetchInterval: 60000 });
  const stock = new Map(dashboard.data?.products.map(p => [p.productId, p.unused]));
  const productFilter = path === '/cards' ? params.get('productId') : null;
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
    <div className="min-h-dvh md:grid md:grid-cols-[256px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink text-ink-fg md:flex">
        <a href="#/overview" className="flex items-center gap-3 px-5 pt-6 pb-6">
          <BrandMark name={brand.name} className="size-9 text-base" />
          <div className="min-w-0 leading-tight">
            <Wordmark name={brand.name} className="block truncate text-[17px] text-ink-fg" />
            {brand.tagline && <p className="mt-0.5 truncate text-[11.5px] text-ink-muted">{brand.tagline}</p>}
          </div>
        </a>
        <div className="px-3 pb-5">
          <button type="button" onClick={() => openLookup()}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-ink-line bg-ink-2/60 px-3 text-[13px] text-ink-muted transition-colors hover:border-ink-fg/20 hover:text-ink-fg/80">
            <Search className="size-4 shrink-0" /><span className="flex-1 text-left">搜索卡密、机器码…</span>
            <kbd className="font-sans text-[11px] text-ink-muted/80">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </div>
        <nav aria-label="主导航" className="px-3">
          <Label>工作台</Label>
          <div className="grid gap-0.5">
            {NAV.map(({ path: p, label, icon: Icon }) => <InkItem key={p} to={`#${p}`} active={path === p && !productFilter} icon={<Icon />}>{label}</InkItem>)}
          </div>
        </nav>
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto px-3">
          <Label>产品 · {settings.products.length}</Label>
          <div className="grid gap-0.5">
            {settings.products.map(p => (
              <InkItem key={p.id} to={href('/cards', { productId: p.id })} active={productFilter === p.id}
                icon={<span className="size-2.5 rounded-full ring-[3px] ring-white/10" style={{ background: p.color }} />}
                trailing={stock.has(p.id) && <span className="tabular rounded bg-ink-2 px-1.5 text-[11px] text-ink-muted group-hover:text-ink-fg/80" title="可售库存">{stock.get(p.id)}</span>}>
                {p.name}
              </InkItem>
            ))}
          </div>
        </div>
        <div className="grid gap-1 px-3 pt-3 pb-4">
          <button type="button" onClick={() => openGenerate()}
            className="mb-2 flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] transition-colors hover:bg-primary-hover">
            <Plus className="size-4" />生成卡密<kbd className="ml-1 rounded bg-black/15 px-1.5 font-sans text-[11px] font-medium">N</kbd>
          </button>
          <InkItem to="#/settings" active={path === '/settings'} icon={<Settings />}>设置</InkItem>
          <div className="mt-2 flex items-center gap-2.5 border-t border-ink-line px-1 pt-3">
            <span className="grid size-8 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_35%,var(--ink-2))] text-sm font-semibold uppercase text-ink-fg ring-1 ring-white/10">{session.username.slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{session.username}</span><span className="block text-[11px] text-ink-muted">管理员</span></span>
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} size="sm" className="text-ink-muted hover:bg-ink-2 hover:text-ink-fg" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
            <IconButton label="退出登录" size="sm" className="text-ink-muted hover:bg-ink-2 hover:text-ink-fg" onClick={logout}><LogOut /></IconButton>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center gap-2.5 px-4">
            <BrandMark name={brand.name} />
            <Wordmark name={brand.name} className="min-w-0 flex-1 truncate text-[17px]" />
            <IconButton label="搜索" variant="secondary" className="size-10" onClick={() => openLookup()}><Search /></IconButton>
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} variant="secondary" className="size-10" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-[calc(100px+env(safe-area-inset-bottom))] md:px-12 md:pt-12 md:pb-16">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="主导航" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-md md:hidden">
        <div className="grid h-16 grid-cols-5">
          {TABS.map((tab, i) => tab ? (
            <a key={tab.path} href={href(tab.path)} aria-current={tabActive(tab.path) ? 'page' : undefined}
              className={cn('relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted', tabActive(tab.path) && 'text-fg')}>
              {tabActive(tab.path) && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-primary" aria-hidden />}
              <tab.icon className="size-[22px]" strokeWidth={tabActive(tab.path) ? 2.1 : 1.7} />{tab.label}
            </a>
          ) : (
            <div key={i} className="grid place-items-center">
              <button type="button" aria-label="生成卡密" onClick={() => openGenerate()}
                className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg ring-[5px] ring-bg transition-transform active:scale-95">
                <Plus className="size-6" strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
