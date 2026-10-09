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

// Quiet, centered sign-in: a faint grid and two slowly drifting accent glows behind one card.
export function AuthLayout({ branding, title, subtitle, leaving, children }: {
  branding: PublicBranding | null; title: ReactNode; subtitle?: ReactNode; leaving?: boolean; children: ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const name = branding?.name ?? cachedBrandName();
  const products = branding?.products ?? [];
  useEffect(() => { if (branding) document.title = `登录 · ${branding.name}`; }, [branding]);
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 pt-[env(safe-area-inset-top)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="auth-grid absolute inset-0" />
        <div className="auth-glow anim-drift-a top-[-22%] left-[12%] size-[56vmax] [--glow:color-mix(in_oklab,var(--accent)_15%,transparent)]" />
        <div className="auth-glow anim-drift-b right-[2%] bottom-[-28%] size-[50vmax] [--glow:color-mix(in_oklab,var(--accent)_11%,transparent)]" />
      </div>

      <div className="flex justify-end pt-4 md:px-4">
        <IconButton label={dark ? '切换到浅色' : '切换到深色'} onClick={toggle}>{dark ? <Sun /> : <Moon />}</IconButton>
      </div>

      <main className={cn('mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10', leaving && 'anim-leave')}>
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="anim-rise" style={step(0)}><BrandMark stamp name={name} className="size-12 rounded-[13px] text-xl" /></span>
          <h1 className="anim-rise mt-5 font-display text-2xl font-semibold" style={step(1)}>{title}</h1>
          {subtitle && <p className="anim-rise mt-1.5 text-sm text-muted" style={step(2)}>{subtitle}</p>}
        </div>
        <div className="anim-rise rounded-2xl border border-line bg-surface/85 p-5 shadow-lg backdrop-blur-xl md:p-6" style={step(3)}>{children}</div>
        {products.length > 0 && (
          <div className="anim-rise mt-6 flex items-center justify-center gap-2.5 text-xs text-muted" style={step(6)}>
            <span className="flex -space-x-1">{products.slice(0, 5).map(p => <span key={p.id} title={p.name}><ProductAvatar id={p.id} name={p.name} color={p.color} size="sm" className="rounded-full ring-2 ring-bg" /></span>)}</span>
            <span className="truncate">{products.map(p => p.name).join(' · ')}</span>
          </div>
        )}
      </main>

      <footer className="anim-rise flex items-center justify-center gap-1.5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-xs text-muted" style={step(7)}>
        <ShieldCheck className="size-3.5" /><Wordmark name={name} className="font-medium" /> · 仅限管理员访问
      </footer>
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
    <AuthLayout branding={branding} leaving={phase === 'done'} title="登录管理后台" subtitle={<>欢迎回来，继续管理 {name} 的授权</>}>
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
