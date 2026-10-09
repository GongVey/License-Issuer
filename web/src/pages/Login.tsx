import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Moon, MonitorSmartphone, ShieldCheck, Sun, UserRound, WifiOff } from 'lucide-react';
import { api, setCsrf } from '../lib/api';
import { cachedBrandName, usePublicBranding } from '../lib/brand';
import { storage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import type { PublicBranding } from '../lib/types';
import { Button, Field, IconButton, Input } from '../ui/controls';
import { ProductAvatar } from '../ui/display';
import { BrandMark, Wordmark } from '../layout/Logo';

const FEATURES = [
  { icon: KeyRound, title: '卡密签发', text: '按产品、版本批量生成，一键复制发货' },
  { icon: MonitorSmartphone, title: '设备额度', text: '每张卡限定设备数，随时释放换机' },
  { icon: WifiOff, title: '离线可用', text: '激活一次签名授权，之后无需联网' },
];

// Decorative license card: what the console issues, drawn with the brand accent. Purely illustrative.
function LicenseIllustration({ name }: { name: string }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[400px] select-none">
      <div className="absolute inset-x-8 -bottom-4 h-full rotate-[-4deg] rounded-2xl bg-white/[0.04] ring-1 ring-white/10" />
      <div className="glass relative rounded-2xl p-6 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-fg"><BrandMark name={name} className="size-6 rounded-md text-[11px]" />{name}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1baf7a]/15 px-2 py-0.5 text-[11px] font-medium text-[#6fdcb0]"><span className="size-1.5 rounded-full bg-current" />已激活</span>
        </div>
        <p className="mt-6 text-[11px] tracking-[0.14em] text-ink-muted uppercase">License Key</p>
        <p className="mt-1.5 font-mono text-[17px] tracking-wider text-ink-fg">LIC-7Q4M-<span className="text-ink-muted">••••-••••</span>-K2XD</p>
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-[11px] text-ink-muted">设备额度</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex gap-1">{[1, 1, 0].map((on, i) => <i key={i} className={on ? 'h-3.5 w-2 rounded-[3px] bg-[color-mix(in_oklab,var(--accent)_65%,white)]' : 'h-3.5 w-2 rounded-[3px] bg-white/15'} />)}</span>
              <span className="text-[13px] font-medium text-ink-fg">2 / 3</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-ink-muted">签名算法</p>
            <p className="mt-1.5 text-[13px] font-medium text-ink-fg">Ed25519</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandPanel({ branding }: { branding: PublicBranding | null }) {
  const name = branding?.name ?? cachedBrandName();
  const products = branding?.products ?? [];
  return (
    <aside className="brand-panel relative hidden overflow-hidden text-ink-fg lg:flex lg:flex-col">
      <div className="brand-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex items-center gap-3 px-12 pt-10">
        <BrandMark name={name} className="size-9 text-base" />
        <Wordmark name={name} className="text-lg text-ink-fg" />
      </div>
      <div className="relative my-auto grid gap-12 px-12 py-10 xl:px-16">
        <div className="max-w-lg">
          <h2 className="font-display text-[40px] leading-[1.15] font-bold text-balance">{branding?.tagline || '软件授权与卡密管理'}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-fg/65">在线激活，离线使用。统一管理卡密、设备额度与激活记录。</p>
        </div>
        <LicenseIllustration name={name} />
        <ul className="grid gap-5 xl:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 xl:block">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] ring-1 ring-white/10 xl:mb-3"><Icon className="size-[18px] text-ink-fg/85" /></span>
              <span><b className="block text-[13px] font-semibold">{title}</b><span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{text}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex items-center justify-between gap-6 border-t border-white/10 px-12 py-6 text-xs text-ink-muted">
        <span>© {new Date().getFullYear()} {name}</span>
        {products.length > 0 && (
          <span className="flex min-w-0 items-center gap-3">
            <span className="shrink-0">已接入</span>
            <span className="flex -space-x-1.5">{products.slice(0, 6).map(p => <span key={p.id} title={p.name}><ProductAvatar id={p.id} name={p.name} color={p.color} className="size-6 rounded-full ring-2 ring-ink" /></span>)}</span>
            <span className="truncate">{products.map(p => p.name).join(' · ')}</span>
          </span>
        )}
      </div>
    </aside>
  );
}

export function AuthLayout({ branding, children }: { branding: PublicBranding | null; children: ReactNode }) {
  const { dark, toggle } = useTheme();
  const name = branding?.name ?? cachedBrandName();
  useEffect(() => { if (branding) document.title = `登录 · ${branding.name}`; }, [branding]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <BrandPanel branding={branding} />
      <main className="relative flex flex-col overflow-hidden px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-8 md:px-10">
        {/* Phones and tablets get a soft accent wash in place of the brand panel. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(80%_100%_at_50%_0%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent)] lg:hidden" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible"><BrandMark name={name} /><Wordmark name={name} className="text-lg" /></div>
          <IconButton label={dark ? '切换到浅色' : '切换到深色'} variant="secondary" onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[400px] py-10">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-lg md:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">{children}</div>
        </div>
        <p className="relative flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" />仅限管理员访问 · 连接已加密</p>
      </main>
    </div>
  );
}

// Input with a leading icon; `trailing` sits inside the right edge (e.g. a show-password toggle).
function IconInput({ icon, trailing, ...rest }: React.ComponentProps<typeof Input> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted [&>svg]:size-4">{icon}</span>
      <Input {...rest} className={`pl-9 md:h-11 md:text-sm ${trailing ? 'pr-11' : ''}`} />
      {trailing && <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailing}</span>}
    </div>
  );
}

export function LoginPage({ message, onSignedIn }: { message?: string; onSignedIn: () => Promise<void> }) {
  const branding = usePublicBranding();
  const [username, setUsername] = useState(storage.get('username'));
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState(message || '');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const name = branding?.name ?? cachedBrandName();
  return (
    <AuthLayout branding={branding}>
      <span className="mb-5 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary ring-1 ring-[color-mix(in_oklab,var(--primary)_20%,transparent)]"><LockKeyhole className="size-5" /></span>
      <h1 className="font-display text-[28px] leading-tight font-bold">欢迎回来</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted">登录 {name} 管理后台</p>
      {branding && branding.products.length > 0 && (
        <div className="-mt-3 mb-6 flex flex-wrap gap-1.5 lg:hidden">
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
        <Field label="用户名"><IconInput icon={<UserRound />} autoComplete="username" required maxLength={80} autoFocus={!username} value={username} onChange={e => setUsername(e.target.value)} /></Field>
        <Field label="密码">
          <IconInput icon={<LockKeyhole />} ref={passwordRef} type={reveal ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} autoFocus={Boolean(username)} value={password} onChange={e => setPassword(e.target.value)}
            trailing={<IconButton label={reveal ? '隐藏密码' : '显示密码'} size="sm" onClick={() => setReveal(v => !v)}>{reveal ? <EyeOff /> : <Eye />}</IconButton>} />
        </Field>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-2 w-full md:h-11">登录<ArrowRight /></Button>
      </form>
    </AuthLayout>
  );
}
