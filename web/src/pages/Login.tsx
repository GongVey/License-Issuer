import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Moon, ShieldCheck, Sun } from 'lucide-react';
import { api, setCsrf } from '../lib/api';
import { cachedBrandName, usePublicBranding } from '../lib/brand';
import { storage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import type { PublicBranding } from '../lib/types';
import { Button, Field, IconButton, Input } from '../ui/controls';
import { ProductAvatar } from '../ui/display';
import { BrandMark, Wordmark } from '../layout/Logo';

function BrandPanel({ branding }: { branding: PublicBranding | null }) {
  const name = branding?.name ?? cachedBrandName();
  const products = branding?.products ?? [];
  return (
    <aside className="brand-panel relative hidden overflow-hidden text-ink-fg lg:flex lg:flex-col">
      <div className="brand-grid pointer-events-none absolute inset-0" aria-hidden />
      {/* Oversized brand character as a faint watermark, like a seal pressed into paper. */}
      <span aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 font-display text-[460px] leading-none font-semibold text-white/[0.04] select-none">{Array.from(name.trim())[0]}</span>
      <div className="relative flex items-center gap-3 p-12">
        <BrandMark name={name} className="size-10 text-lg" />
        <Wordmark name={name} className="text-xl text-ink-fg" />
      </div>
      <div className="relative mt-auto max-w-xl p-12 pb-14">
        <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-ink-muted uppercase"><span className="size-1.5 rounded-full bg-primary" />License Console</p>
        <h2 className="font-display text-[44px] leading-[1.1] font-semibold text-balance">{branding?.tagline || '软件授权与卡密管理'}</h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-fg/65">在线激活，离线使用。统一管理卡密、设备额度与激活记录。</p>
        {products.length > 0 && (
          <div className="mt-12 border-t border-white/10 pt-6">
            <p className="mb-4 text-xs text-ink-muted">已接入 {products.length} 个产品</p>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {products.map(p => (
                <span key={p.id} className="inline-flex items-center gap-2.5 text-sm font-medium text-ink-fg/90">
                  <ProductAvatar id={p.id} name={p.name} color={p.color} className="size-7 rounded-lg" />{p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="relative px-12 pb-9 text-xs text-ink-muted">© {new Date().getFullYear()} {name}</p>
    </aside>
  );
}

export function AuthLayout({ branding, children }: { branding: PublicBranding | null; children: ReactNode }) {
  const { dark, toggle } = useTheme();
  const name = branding?.name ?? cachedBrandName();
  useEffect(() => { if (branding) document.title = `登录 · ${branding.name}`; }, [branding]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel branding={branding} />
      <main className="relative flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-8 md:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible"><BrandMark name={name} /><Wordmark name={name} className="text-lg" /></div>
          <IconButton label={dark ? '切换到浅色' : '切换到深色'} variant="secondary" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
        </div>
        <div className="mx-auto my-auto w-full max-w-[380px] py-10">{children}</div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" />仅限管理员访问</p>
      </main>
    </div>
  );
}

export function LoginPage({ message, onSignedIn }: { message?: string; onSignedIn: () => Promise<void> }) {
  const branding = usePublicBranding();
  const [username, setUsername] = useState(storage.get('username'));
  const [password, setPassword] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const name = branding?.name ?? cachedBrandName();
  return (
    <AuthLayout branding={branding}>
      <h1 className="font-display text-[32px] leading-tight font-semibold">欢迎回来</h1>
      <p className="mt-2 mb-8 text-sm text-muted">登录 {name} 管理后台。</p>
      {branding && branding.products.length > 0 && (
        <div className="-mt-4 mb-7 flex flex-wrap gap-1.5 lg:hidden">
          {branding.products.map(p => (
            <span key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-fg-2 ring-1 ring-line ring-inset">
              <ProductAvatar id={p.id} name={p.name} color={p.color} className="size-6 rounded-full" />{p.name}
            </span>
          ))}
        </div>
      )}
      <form className="grid gap-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          const result = await api<{ csrf: string }>('/api/login', 'POST', { username, password });
          storage.set('username', username); setCsrf(result.csrf); setPassword('');
          await onSignedIn();
        } catch (err) { setError((err as Error).message); setPassword(''); passwordRef.current?.focus(); } finally { setBusy(false); }
      }}>
        <Field label="用户名"><Input className="md:h-10 md:text-sm" autoComplete="username" required maxLength={80} autoFocus={!username} value={username} onChange={e => setUsername(e.target.value)} /></Field>
        <Field label="密码"><Input className="md:h-10 md:text-sm" ref={passwordRef} type="password" autoComplete="current-password" required maxLength={256} autoFocus={Boolean(username)} value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-2 w-full">登录<ArrowRight /></Button>
      </form>
    </AuthLayout>
  );
}
