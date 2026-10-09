import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { api, setCsrf } from '../lib/api';
import { cachedBrandName, usePublicBranding } from '../lib/brand';
import { cn } from '../lib/cn';
import { storage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import type { PublicBranding } from '../lib/types';
import { Button, Field, IconButton, Input } from '../ui/controls';
import { ProductAvatar } from '../ui/display';
import { BrandMark, Wordmark } from '../layout/Logo';

// Entrance order for the staggered fade-up (see .anim-rise).
const step = (i: number) => ({ '--i': i }) as CSSProperties;

// 守黑: the ink brand canvas, kept to type and light. Two soft accent lights drift slowly behind a small brand mark
// (top) and one large statement (bottom); nothing else competes with them.
function BrandPanel({ name, tagline }: { name: string; tagline: string }) {
  return (
    <aside className="relative isolate hidden overflow-hidden bg-ink text-ink-fg lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="ink-light ink-light-a" />
        <div className="ink-light ink-light-b" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(0_0_0/0.35))]" />
      </div>
      <div className="anim-rise flex items-center gap-3 px-14 pt-12" style={step(0)}>
        <BrandMark inverted name={name} />
        <Wordmark name={name} className="text-[17px]" />
      </div>
      <div className="mt-auto px-14 pb-16">
        <span aria-hidden className="anim-rise mb-7 block h-px w-12 bg-[color-mix(in_oklab,var(--accent)_70%,white)]" style={step(1)} />
        <h2 className="anim-rise max-w-lg font-display text-[44px] leading-[1.15] font-semibold text-balance xl:text-[52px]" style={step(2)}>{tagline || '软件授权与卡密管理'}</h2>
        <p className="anim-rise mt-5 text-[15px] text-ink-fg/55" style={step(3)}>在线激活，离线使用。</p>
      </div>
    </aside>
  );
}

// Phones and tablets: the brand panel condensed into one ink card above the form.
function CompactBrand({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div className="anim-rise relative isolate mb-9 overflow-hidden rounded-2xl bg-ink px-5 py-6 text-ink-fg lg:hidden" style={step(0)}>
      <div aria-hidden className="ink-light ink-light-a -z-10" />
      <div className="flex items-center gap-3"><BrandMark inverted name={name} /><Wordmark name={name} className="text-[17px]" /></div>
      <p className="mt-6 text-xl font-semibold">{tagline || '软件授权与卡密管理'}</p>
    </div>
  );
}

// 知白: the white half holds only the form. On phones the brand panel collapses into a small header.
export function AuthLayout({ branding, title, subtitle, leaving, children }: {
  branding: PublicBranding | null; title: ReactNode; subtitle?: ReactNode; leaving?: boolean; children: ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const name = branding?.name ?? cachedBrandName();
  const products = branding?.products ?? [];
  useEffect(() => { if (branding) document.title = `登录 · ${branding.name}`; }, [branding]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.25fr)_minmax(440px,1fr)]">
      <BrandPanel name={name} tagline={branding?.tagline ?? ''} />
      <main className="relative flex flex-col bg-surface px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+20px)] md:px-10">
        <div className="flex items-center justify-end">
          <IconButton label={dark ? '切换到浅色' : '切换到深色'} onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
        </div>
        <div className={cn('mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-8 lg:py-12', leaving && 'anim-leave')}>
          <CompactBrand name={name} tagline={branding?.tagline ?? ''} />
          <p className="anim-rise mb-3 flex items-center gap-2 text-xs font-medium text-primary" style={step(1)}><span className="size-1.5 rounded-[2px] bg-primary" />管理后台</p>
          <h1 className="anim-rise font-display text-[28px] leading-tight font-semibold" style={step(2)}>{title}</h1>
          {subtitle && <p className="anim-rise mt-2 text-sm text-muted" style={step(3)}>{subtitle}</p>}
          <div className="anim-rise mt-8" style={step(4)}>{children}</div>
          {products.length > 0 && (
            <div className="anim-rise mt-8 flex items-center gap-2.5 text-xs text-muted lg:hidden" style={step(6)}>
              <span className="flex -space-x-1">{products.slice(0, 5).map(p => <span key={p.id} title={p.name}><ProductAvatar id={p.id} name={p.name} color={p.color} size="sm" className="rounded-full ring-2 ring-surface" /></span>)}</span>
              <span className="truncate">{products.map(p => p.name).join(' · ')}</span>
            </div>
          )}
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" />仅限管理员访问 · Ed25519 签名授权</p>
      </main>
    </div>
  );
}

// Input with a leading icon that takes the accent color while focused; `trailing` sits inside the right edge.
function IconInput({ icon, trailing, ...rest }: React.ComponentProps<typeof Input> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary [&>svg]:size-4">{icon}</span>
      <Input {...rest} className={cn('pl-9 md:h-10 md:text-sm', trailing ? 'pr-11' : '')} />
      {trailing && <span className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</span>}
    </div>
  );
}

export function LoginPage({ message, onSignedIn }: { message?: string; onSignedIn: () => Promise<void> }) {
  const branding = usePublicBranding();
  const [username, setUsername] = useState(storage.get('username'));
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState(message || '');
  const [shake, setShake] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const passwordRef = useRef<HTMLInputElement>(null);
  const name = branding?.name ?? cachedBrandName();
  return (
    <AuthLayout branding={branding} leaving={phase === 'done'} title="欢迎回来" subtitle={<>登录 {name}，继续管理授权与卡密</>}>
      <form key={shake} className={cn('grid gap-4', shake > 0 && 'anim-shake')} onSubmit={async e => {
        e.preventDefault(); setPhase('busy'); setError('');
        try {
          const result = await api<{ csrf: string }>('/api/login', 'POST', { username, password });
          storage.set('username', username); setCsrf(result.csrf); setPassword('');
          setPhase('done');
          await new Promise(resolve => setTimeout(resolve, 380)); // let the success state and exit animation play
          await onSignedIn();
        } catch (err) {
          setError((err as Error).message); setPassword(''); setPhase('idle'); setShake(n => n + 1);
          requestAnimationFrame(() => passwordRef.current?.focus());
        }
      }}>
        <Field label="用户名"><IconInput icon={<UserRound />} autoComplete="username" required maxLength={80} autoFocus={!username} value={username} onChange={e => setUsername(e.target.value)} /></Field>
        <Field label="密码" hint={capsLock ? <span className="text-warn">大写锁定已开启</span> : undefined}>
          <IconInput icon={<LockKeyhole />} ref={passwordRef} type={reveal ? 'text' : 'password'} autoComplete="current-password" required maxLength={256}
            autoFocus={Boolean(username)} value={password} onChange={e => setPassword(e.target.value)}
            onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)}
            trailing={<IconButton label={reveal ? '隐藏密码' : '显示密码'} size="sm" onClick={() => setReveal(v => !v)}>{reveal ? <EyeOff /> : <Eye />}</IconButton>} />
        </Field>
        {error && <p role="alert" className="anim-pop rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={phase === 'busy'} disabled={phase === 'done'}
          className="group/btn relative mt-1 w-full overflow-hidden md:h-10 disabled:opacity-100">
          {/* A light sheen sweeps across the button on hover. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/25 to-transparent group-hover/btn:animate-[sheen_.9s_ease-out]" />
          {phase === 'done' ? <><Check className="anim-pop" />登录成功</> : <>登录<ArrowRight className="transition-transform group-hover/btn:translate-x-0.5" /></>}
        </Button>
      </form>
    </AuthLayout>
  );
}
