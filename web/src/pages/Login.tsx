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

// Decorative license keys for the ticker rows: random, partly masked, regenerated per visit.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const group = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const fakeKey = () => `LIC-${group()}-••••-••••-${group()}`;

function Ticker({ speed, reverse, highlight }: { speed: number; reverse?: boolean; highlight?: number }) {
  const [keys] = useState(() => Array.from({ length: 8 }, fakeKey));
  // The row is rendered twice and shifted by half its width, so the loop is seamless.
  const row = (copy: number) => keys.map((key, i) => (
    <span key={`${copy}-${i}`} className={cn('shrink-0 px-5', i === highlight ? 'text-[color-mix(in_oklab,var(--accent)_55%,white)]' : 'text-white/[0.16]')}>
      {key}{i === highlight && <span className="ml-2 rounded-sm bg-[color-mix(in_oklab,var(--accent)_30%,transparent)] px-1.5 py-0.5 font-sans text-[10px] tracking-normal">已激活</span>}
    </span>
  ));
  return (
    <div className="ticker-mask overflow-hidden">
      <div className="anim-marquee flex w-max font-mono text-[13px] tracking-[0.12em]" style={{ '--speed': `${speed}s`, '--dir': reverse ? 'reverse' : 'normal' } as CSSProperties}>
        {row(0)}{row(1)}
      </div>
    </div>
  );
}

// A key being "issued" letter by letter under the brand line, then a pause, then the next one.
function Typewriter() {
  const [key, setKey] = useState(() => fakeKey().replaceAll('••••', group()));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const done = shown >= key.length;
    const id = setTimeout(() => {
      if (!done) setShown(n => n + 1);
      else { setKey(fakeKey().replaceAll('••••', group())); setShown(0); }
    }, done ? 2400 : shown === 0 ? 900 : 55);
    return () => clearTimeout(id);
  }, [shown, key]);
  return (
    <p className="flex items-center gap-3 font-mono text-[13px] tracking-[0.08em] whitespace-nowrap text-ink-fg/70" aria-hidden>
      <span className="rounded border border-white/15 px-1.5 py-0.5 font-sans text-[11px] tracking-normal text-ink-muted">签发</span>
      <span>{key.slice(0, shown)}<span className="anim-caret ml-px inline-block h-[1.1em] w-[7px] translate-y-[3px] bg-[color-mix(in_oklab,var(--accent)_65%,white)]" /></span>
    </p>
  );
}

// 守黑: the ink brand canvas. A jade seal carved with the brand's first character stamps in and ripples out;
// the tagline runs vertically beside it; masked license keys drift past below.
function BrandPanel({ name, tagline, products }: { name: string; tagline: string; products: PublicBranding['products'] }) {
  const glyph = Array.from(name.trim())[0]?.toUpperCase() || '·';
  return (
    <aside className="relative hidden overflow-hidden bg-ink text-ink-fg lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_42%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]" />
      <div className="anim-rise relative flex items-center justify-between px-12 pt-10 xl:px-16" style={step(0)}>
        <span className="flex items-center gap-3"><BrandMark inverted name={name} /><Wordmark name={name} className="text-[17px]" /></span>
        <span className="text-xs tracking-[0.2em] text-ink-muted uppercase">License Console</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-10 px-12 xl:px-16">
        <div className="flex items-start gap-8">
          <div className="relative">
            <span aria-hidden className="anim-ripple absolute inset-0 rounded-[26px] border-2 border-[color-mix(in_oklab,var(--accent)_70%,white)]" />
            <div className="anim-seal relative grid size-40 place-items-center rounded-[26px] bg-[linear-gradient(145deg,color-mix(in_oklab,var(--accent)_88%,white),var(--accent)_55%,color-mix(in_oklab,var(--accent)_75%,black))] xl:size-48">
              <span aria-hidden className="absolute inset-3 rounded-[16px] border border-white/35" />
              <span className="font-display text-[80px] leading-none font-bold text-white xl:text-[96px]">{glyph}</span>
            </div>
          </div>
          {tagline && <p className={cn('vertical-text anim-rise leading-none font-semibold text-ink-fg/90', Array.from(tagline).length > 8 ? 'text-lg tracking-[0.3em]' : 'text-[22px] tracking-[0.4em]')} style={step(2)}>{tagline}</p>}
        </div>
        <div className="anim-rise grid max-w-md gap-3" style={step(3)}>
          <p className="font-display text-[40px] leading-tight font-semibold xl:text-[46px]"><Wordmark name={name} /></p>
          <p className="text-[15px] leading-relaxed text-ink-fg/60">在线激活，离线使用。签发卡密、绑定设备、追踪每一次激活。</p>
          <div className="mt-2"><Typewriter /></div>
        </div>
      </div>

      <div className="anim-rise relative grid gap-3 pb-6" style={step(5)}>
        <Ticker speed={70} />
        <Ticker speed={90} reverse highlight={3} />
        <Ticker speed={80} />
      </div>
      <div className="relative flex items-center justify-between border-t border-white/[0.08] px-12 py-5 text-xs text-ink-muted xl:px-16">
        <span>© {new Date().getFullYear()} {name}</span>
        {products.length > 0 && <span className="truncate pl-6">已接入 {products.map(p => p.name).join(' · ')}</span>}
      </div>
    </aside>
  );
}

// Phones and tablets: the brand panel condensed into one ink card above the form.
function CompactBrand({ name, tagline }: { name: string; tagline: string }) {
  const glyph = Array.from(name.trim())[0]?.toUpperCase() || '·';
  return (
    <div className="anim-rise relative mb-9 overflow-hidden rounded-2xl bg-ink text-ink-fg lg:hidden" style={step(0)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_15%_30%,color-mix(in_oklab,var(--accent)_30%,transparent),transparent_70%)]" />
      <div className="relative flex items-center gap-4 p-5">
        <div className="anim-seal relative grid size-14 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(145deg,color-mix(in_oklab,var(--accent)_88%,white),var(--accent)_55%,color-mix(in_oklab,var(--accent)_75%,black))]">
          <span aria-hidden className="absolute inset-1.5 rounded-[9px] border border-white/35" />
          <span className="font-display text-[28px] leading-none font-bold text-white">{glyph}</span>
        </div>
        <div className="min-w-0">
          <Wordmark name={name} className="block truncate text-xl" />
          {tagline && <p className="mt-0.5 truncate text-xs tracking-[0.2em] text-ink-muted">{tagline}</p>}
        </div>
      </div>
      <div className="relative pb-4"><Ticker speed={50} highlight={2} /></div>
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
      <BrandPanel name={name} tagline={branding?.tagline ?? ''} products={products} />
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
