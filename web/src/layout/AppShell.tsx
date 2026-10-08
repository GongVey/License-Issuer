import { useEffect, type ReactNode } from 'react';
import { Activity, CreditCard, Layers, LayoutDashboard, LogOut, Moon, Plus, Search, Settings, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { href, useRoute } from '../lib/router';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { IconButton } from '../ui/controls';
import { useTheme } from '../lib/theme';
import { Logo } from './Logo';

export const NAV = [
  { path: '/overview', label: '概览', icon: LayoutDashboard },
  { path: '/cards', label: '卡密', icon: CreditCard },
  { path: '/batches', label: '批次', icon: Layers },
  { path: '/logs', label: '日志', icon: Activity },
  { path: '/settings', label: '设置', icon: Settings },
];
// Phone tab bar: four destinations around a central "generate" action; batches live under the cards tab.
const TABS = [NAV[0], NAV[1], null, NAV[3], NAV[4]];

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const { session, signOut } = useSession();
  const { openLookup, openGenerate } = useOverlays();
  const { dark, toggle } = useTheme();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const active = (p: string) => path === p || (p === '/cards' && path === '/batches');
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
    <div className="min-h-dvh md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-surface px-3 py-4 md:flex">
        <Logo className="px-2 pb-5" />
        <nav aria-label="主导航" className="grid gap-0.5">
          {NAV.map(({ path: p, label, icon: Icon }) => (
            <a key={p} href={`#${p}`} aria-current={path === p ? 'page' : undefined}
              className={cn('flex h-9 items-center gap-3 rounded-[10px] px-3 font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg',
                path === p && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary')}>
              <Icon className="size-[18px]" />{label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1 pt-3">
          <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-semibold uppercase text-fg-2">{session.username.slice(0, 1)}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{session.username}</span>
          <IconButton label="退出登录" size="sm" onClick={logout}><LogOut className="size-4" /></IconButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar: search everywhere; on phones it also carries the brand */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-2 px-4 md:h-16 md:gap-3 md:px-8">
            <Logo compact className="md:hidden" />
            <button type="button" onClick={() => openLookup()}
              className="ml-auto flex h-10 min-w-0 items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3 text-muted shadow-sm transition-colors hover:border-primary/50 max-md:size-10 max-md:justify-center max-md:px-0 md:ml-0 md:w-full md:max-w-md">
              <Search className="size-4 shrink-0" />
              <span className="hidden flex-1 truncate text-left md:block">查找卡密、机器码、客户、订单号…</span>
              <kbd className="hidden rounded-md border border-line-strong px-1.5 font-mono text-[11px] md:block">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <span className="hidden flex-1 md:block" />
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} onClick={toggle} variant="secondary" className="max-md:size-10">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</IconButton>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-8 md:pt-7 md:pb-12">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="主导航" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-md md:hidden">
        <div className="grid h-16 grid-cols-5">
          {TABS.map((tab, i) => tab ? (
            <a key={tab.path} href={href(tab.path)} aria-current={active(tab.path) ? 'page' : undefined}
              className={cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted', active(tab.path) && 'text-primary')}>
              <tab.icon className="size-[22px]" strokeWidth={active(tab.path) ? 2.2 : 1.8} />{tab.label}
            </a>
          ) : (
            <div key={i} className="grid place-items-center">
              <button type="button" aria-label="生成卡密" onClick={() => openGenerate()}
                className="-mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-lg ring-4 ring-bg active:scale-95 transition-transform">
                <Plus className="size-6" strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
