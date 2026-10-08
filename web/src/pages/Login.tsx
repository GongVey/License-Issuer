import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Moon, ShieldCheck, Sun } from 'lucide-react';
import { api, setCsrf } from '../lib/api';
import { cachedBrandName, usePublicBranding } from '../lib/brand';
import { storage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import type { PublicBranding } from '../lib/types';
import { Button, Field, IconButton, Input } from '../ui/controls';
import { ProductAvatar } from '../ui/display';
import { BrandMark } from '../layout/Logo';

function BrandPanel({ branding }: { branding: PublicBranding | null }) {
  const name = branding?.name ?? cachedBrandName();
  const products = branding?.products ?? [];
  return (
    <aside className="brand-panel relative hidden overflow-hidden text-white lg:flex lg:flex-col">
      <div className="brand-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex items-center gap-3 p-10">
        <BrandMark name={name} inverted className="size-9" />
        <span className="text-[15px] font-semibold tracking-tight">{name}</span>
      </div>
      <div className="relative mt-auto max-w-lg p-10 pb-12">
        <h2 className="text-[34px] leading-[1.15] font-semibold tracking-tight text-balance">{branding?.tagline || '软件授权与卡密管理'}</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/70">在线激活、离线使用。统一管理卡密、设备额度与激活记录。</p>
        {products.length > 0 && (
          <div className="mt-10">
            <p className="mb-3 text-xs font-medium tracking-wide text-white/55">已接入 {products.length} 个产品</p>
            <div className="flex flex-wrap gap-2">
              {products.map(p => (
                <span key={p.id} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 py-1 pr-3.5 pl-1.5 text-[13px] font-medium ring-1 ring-white/15 backdrop-blur-sm ring-inset">
                  <ProductAvatar id={p.id} name={p.name} color={p.color} className="size-6 rounded-full" />{p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="relative px-10 pb-8 text-xs text-white/45">© {new Date().getFullYear()} {name}</p>
    </aside>
  );
}

export function AuthLayout({ branding, children }: { branding: PublicBranding | null; children: ReactNode }) {
  const { dark, toggle } = useTheme();
  const name = branding?.name ?? cachedBrandName();
  useEffect(() => { if (branding) document.title = `登录 · ${branding.name}`; }, [branding]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <BrandPanel branding={branding} />
      <main className="relative flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-8 md:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible"><BrandMark name={name} /><span className="font-semibold">{name}</span></div>
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
      <h1 className="text-2xl font-semibold tracking-tight">登录 {name}</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted">使用管理员账号继续。</p>
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
