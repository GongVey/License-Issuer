import { useRef, useState, type ReactNode } from 'react';
import { api, setCsrf } from '../lib/api';
import { storage } from '../lib/storage';
import { Button, Field, Input } from '../ui/controls';
import { LogoMark } from '../layout/Logo';

export function AuthLayout({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3 px-1">
          <LogoMark className="size-11 rounded-2xl" />
          <div><p className="text-lg font-semibold">License Issuer</p><p className="text-[13px] text-muted">{subtitle}</p></div>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-md md:p-8">{children}</div>
      </div>
    </main>
  );
}

export function LoginPage({ message, onSignedIn }: { message?: string; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState(storage.get('username'));
  const [password, setPassword] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  return (
    <AuthLayout subtitle="照片归档 · 一池锦鲤 统一授权">
      <h1 className="text-xl font-semibold">管理员登录</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted">管理卡密、设备额度与激活记录。</p>
      <form className="grid gap-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          const result = await api<{ csrf: string }>('/api/login', 'POST', { username, password });
          storage.set('username', username); setCsrf(result.csrf); setPassword('');
          await onSignedIn();
        } catch (err) { setError((err as Error).message); setPassword(''); passwordRef.current?.focus(); } finally { setBusy(false); }
      }}>
        <Field label="用户名"><Input autoComplete="username" required maxLength={80} autoFocus={!username} value={username} onChange={e => setUsername(e.target.value)} /></Field>
        <Field label="密码"><Input ref={passwordRef} type="password" autoComplete="current-password" required maxLength={256} autoFocus={Boolean(username)} value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">登录</Button>
      </form>
    </AuthLayout>
  );
}
