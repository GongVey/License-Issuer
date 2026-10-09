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

// Accent shades for the network art, derived from the brand color so a new accent re-themes it.
const netColors = {
  '--net-hi': 'color-mix(in oklab, var(--accent) 55%, white)',
  '--net-lo': 'color-mix(in oklab, var(--accent) 55%, black)',
  '--net-glow': 'color-mix(in oklab, var(--accent) 80%, white)',
  '--net-pulse': 'color-mix(in oklab, var(--accent) 30%, white)',
} as CSSProperties;

// The license hub: a glowing round node with a key, and a ring that ripples outward.
function Hub({ id }: { id: string }) {
  return (
    <g>
      <circle className="net-ripple" r="48" fill="none" stroke="var(--net-glow)" strokeWidth="1.5" />
      <circle r="46" fill={`url(#${id}-hub)`} stroke="white" strokeOpacity=".22" />
      <circle r="38" fill="none" stroke="white" strokeOpacity=".16" />
      <ellipse cx="0" cy="-24" rx="26" ry="12" fill="white" opacity=".1" />
      {/* lucide "key-round", centred and scaled */}
      <g transform="translate(-21 -21) scale(1.75)" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
        <circle cx="16.5" cy="7.5" r=".5" fill="white" />
      </g>
    </g>
  );
}
function HubDefs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-glow`}><stop offset="0" style={{ stopColor: 'var(--net-glow)', stopOpacity: 0.4 }} /><stop offset="1" style={{ stopColor: 'var(--net-glow)', stopOpacity: 0 }} /></radialGradient>
      <radialGradient id={`${id}-hub`} cx="35%" cy="30%" r="80%"><stop offset="0" style={{ stopColor: 'var(--net-hi)' }} /><stop offset=".55" style={{ stopColor: 'var(--accent)' }} /><stop offset="1" style={{ stopColor: 'var(--net-lo)' }} /></radialGradient>
    </defs>
  );
}

// Devices on two orbits around the hub. Labels are illustrative, like a system diagram.
const DEVICES = [
  { angle: -150, r: 118, name: 'MacBook Pro', state: '已激活' }, { angle: -30, r: 118, name: 'Win-PC-03', state: '已激活' },
  { angle: 90, r: 118, name: 'iMac', state: '重复激活' }, { angle: -100, r: 200, name: 'Surface', state: '已激活' },
  { angle: 20, r: 200, name: 'ThinkPad', state: '已激活' }, { angle: 150, r: 200, name: 'Mac mini', state: '待激活' },
];

// 守黑: an ink canvas with one illustration. A license hub sits on a faint grid; activations travel along curved
// links to the devices around it, each device's status light answering as a pulse arrives.
function NetworkArt() {
  return (
    <svg viewBox="-265 -250 530 470" className="h-full w-full" aria-hidden>
      <HubDefs id="net" />
      <circle r="160" fill="url(#net-glow)" />
      <g className="net-spin"><circle r="118" fill="none" stroke="white" strokeOpacity=".12" strokeDasharray="2 7" /></g>
      <g className="net-spin net-spin-rev"><circle r="200" fill="none" stroke="white" strokeOpacity=".09" strokeDasharray="2 9" /></g>
      <circle r="262" fill="none" stroke="white" strokeOpacity=".05" />
      {DEVICES.map((d, i) => {
        const t = (d.angle * Math.PI) / 180, x = Math.cos(t) * d.r, y = Math.sin(t) * d.r;
        const path = `M0,0 Q${Math.cos(t) * d.r * 0.42},${Math.sin(t) * d.r * 0.42 - 20} ${x},${y}`;
        const delay = { animationDelay: `${i * 0.53}s` };
        return (
          <g key={d.name}>
            <path d={path} fill="none" stroke="var(--net-glow)" strokeOpacity=".22" />
            <path d={path} fill="none" stroke="var(--net-pulse)" strokeWidth="2.2" strokeLinecap="round" className="net-pulse" style={delay} />
            <g transform={`translate(${x} ${y})`}>
              <rect x="-54" y="-17" width="108" height="34" rx="9" fill="#0d1312" stroke="white" strokeOpacity=".14" />
              <rect x="-44" y="-7" width="16" height="11" rx="2" fill="none" stroke="white" strokeOpacity=".6" strokeWidth="1.3" />
              <line x1="-40" x2="-32" y1="7" y2="7" stroke="white" strokeOpacity=".6" strokeWidth="1.3" />
              <text x="-22" y="-1" fontSize="10" fontWeight="600" fill="currentColor">{d.name}</text>
              <text x="-22" y="10" fontSize="8.5" fill="currentColor" opacity=".5">{d.state}</text>
              <circle cx="44" cy="0" r="3.2" fill={d.state === '待激活' ? '#8a8f8e' : 'var(--net-glow)'} className="net-blink" style={{ animationDelay: `${i * 0.53 + 0.8}s` }} />
            </g>
          </g>
        );
      })}
      <Hub id="net" />
    </svg>
  );
}

function BrandPanel({ name, tagline }: { name: string; tagline: string }) {
  return (
    <aside className="relative isolate hidden overflow-hidden bg-ink text-ink-fg lg:flex lg:flex-col" style={netColors}>
      <div aria-hidden className="net-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="anim-rise flex items-center gap-3 px-14 pt-12" style={step(0)}>
        <BrandMark inverted name={name} />
        <Wordmark name={name} className="text-[17px]" />
      </div>
      <div className="anim-rise min-h-0 flex-1 px-10 py-6" style={step(1)}><NetworkArt /></div>
      <div className="anim-rise px-14 pb-14" style={step(2)}>
        <h2 className="font-display text-[30px] leading-tight font-semibold xl:text-[34px]">一张卡密，多台设备</h2>
        <p className="mt-2 text-sm text-ink-fg/50">{tagline || '软件授权与卡密管理'} · 签名授权 · 离线校验 · 实时激活记录</p>
      </div>
    </aside>
  );
}

// Phones and tablets: the brand panel condensed into one ink card above the form, with the hub on the right.
function CompactBrand({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div className="anim-rise relative isolate mb-9 flex items-center gap-4 overflow-hidden rounded-2xl bg-ink px-5 py-5 text-ink-fg lg:hidden" style={{ ...step(0), ...netColors }}>
      <div aria-hidden className="net-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5"><BrandMark inverted name={name} className="size-7 text-[13px]" /><Wordmark name={name} className="truncate text-base" /></div>
        <p className="mt-4 text-lg font-semibold">一张卡密，多台设备</p>
        <p className="mt-0.5 truncate text-xs text-ink-fg/50">{tagline || '软件授权与卡密管理'}</p>
      </div>
      <svg viewBox="-80 -80 160 160" className="size-24 shrink-0" aria-hidden><HubDefs id="hub-sm" /><circle r="78" fill="url(#hub-sm-glow)" /><Hub id="hub-sm" /></svg>
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
