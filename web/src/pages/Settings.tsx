import { useState, type ReactNode } from 'react';
import { Database, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fillTemplate } from '../lib/format';
import { useTheme, type ThemeChoice } from '../lib/theme';
import type { ProductColor, Settings } from '../lib/types';
import { useSession } from '../session';
import { Button, Field, IconButton, Input, Segmented, Textarea } from '../ui/controls';
import { CopyButton, Panel, PanelHeader, ProductChip, productDot } from '../ui/display';
import { useToast } from '../ui/feedback';
import { PageHeader } from './PageHeader';

const COLORS: ProductColor[] = ['sky', 'koi', 'teal', 'indigo', 'amber', 'rose', 'violet', 'slate'];
const PLACEHOLDERS: Array<[string, string]> = [['{cardCode}', '卡密'], ['{product}', '产品名称'], ['{edition}', '版本'], ['{maxDevices}', '设备上限'], ['{customer}', '客户']];

function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-2 md:grid-cols-[160px_minmax(0,1fr)] md:items-center md:gap-4', className)}><div className="text-[13px] font-medium text-fg-2">{label}</div><div className="min-w-0">{children}</div></div>;
}
function useSaveSettings() {
  const { setSettings } = useSession(); const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<Settings>, message = '已保存') => {
    setSaving(true);
    try { setSettings(await api<Settings>('/api/settings', 'PUT', patch)); toast(message); return true; }
    catch (e) { toast((e as Error).message, 'error'); return false; } finally { setSaving(false); }
  };
  return { save, saving };
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="设置" />
      <div className="grid max-w-3xl gap-4">
        <ProductsPanel /><TemplatesPanel /><PresetsPanel /><AppearancePanel /><AccountPanel /><DataPanel />
      </div>
    </>
  );
}

function ProductsPanel() {
  const { settings } = useSession();
  const { save, saving } = useSaveSettings();
  const [products, setProducts] = useState(settings.products);
  return (
    <Panel>
      <PanelHeader title="产品" description="产品标识由服务端 LICENSE_PRODUCTS 配置，客户端会校验；这里只改后台显示的名称和颜色。" />
      <div className="grid gap-5 p-4 md:p-5">
        {products.map((p, i) => (
          <Row key={p.id} label={<code className="font-mono text-xs">{p.id}</code>}>
            <div className="grid gap-2.5">
              <Input maxLength={40} value={p.name} aria-label={`${p.id} 显示名称`} onChange={e => setProducts(list => list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <div className="flex flex-wrap gap-2">
                {COLORS.map(color => (
                  <button key={color} type="button" aria-label={color} aria-pressed={p.color === color} onClick={() => setProducts(list => list.map((x, j) => j === i ? { ...x, color } : x))}
                    className={cn('size-8 rounded-lg ring-offset-2 ring-offset-surface md:size-7', productDot(color), p.color === color && 'ring-2 ring-fg')} />
                ))}
              </div>
            </div>
          </Row>
        ))}
        <div><Button variant="primary" loading={saving} onClick={() => save({ products })}>保存</Button></div>
      </div>
    </Panel>
  );
}

function TemplatesPanel() {
  const { settings, product } = useSession();
  const { save, saving } = useSaveSettings();
  const [templates, setTemplates] = useState(settings.templates);
  const sample = (id: string) => ({ cardCode: 'LIC-1A2B3C4D-5E6F7A8B-9C0D1E2F-3A4B5C6D-7E8F9A0B', product: product(id).name, edition: settings.editions[0], maxDevices: 2, customer: '张三' });
  return (
    <Panel>
      <PanelHeader title="发货模板" description="点「复制发货文案」时使用，直接粘贴给客户。" />
      <div className="grid gap-5 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">可用变量：{PLACEHOLDERS.map(([key, label]) => <code key={key} title={label} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-fg-2">{key}</code>)}</div>
        {settings.products.map(p => (
          <div key={p.id} className="grid gap-2">
            <ProductChip product={p} />
            <div className="grid gap-2 lg:grid-cols-2">
              <Textarea rows={7} maxLength={4000} className="font-mono text-[13px]" aria-label={`${p.id} 发货模板`} value={templates[p.id] ?? ''} onChange={e => setTemplates({ ...templates, [p.id]: e.target.value })} />
              <div className="rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] whitespace-pre-wrap text-fg-2"><span className="mb-1 block text-xs text-muted">预览</span>{fillTemplate(templates[p.id] ?? '', sample(p.id))}</div>
            </div>
          </div>
        ))}
        <div><Button variant="primary" loading={saving} onClick={() => save({ templates })}>保存模板</Button></div>
      </div>
    </Panel>
  );
}

function PresetsPanel() {
  const { settings, product } = useSession();
  const { save } = useSaveSettings();
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <Panel>
      <PanelHeader title="生成预设" description="常用的产品 / 数量 / 设备上限组合，在生成窗口一键套用。" />
      <div className="p-4 md:p-5">
        {settings.presets.length === 0 ? <p className="text-[13px] text-muted">还没有预设。在「生成卡密」窗口填好参数后点「存为预设」即可。</p> : (
          <div className="divide-y divide-line">{settings.presets.map(preset => {
            const name = names[preset.id] ?? preset.name;
            return (
              <div key={preset.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1">
                  <Input maxLength={40} value={name} aria-label="预设名称" onChange={e => setNames({ ...names, [preset.id]: e.target.value })} />
                  <span className="text-xs text-muted">{product(preset.productId).name} · {preset.edition} · {preset.quantity} 张 · 每卡 {preset.maxDevices} 台</span>
                </div>
                {name !== preset.name && <Button size="sm" onClick={() => save({ presets: settings.presets.map(p => p.id === preset.id ? { ...p, name } : p) }, '已重命名')}>保存</Button>}
                <IconButton label="删除预设" size="sm" variant="danger-ghost" onClick={() => save({ presets: settings.presets.filter(p => p.id !== preset.id) }, '已删除预设')}><Trash2 className="size-4" /></IconButton>
              </div>
            );
          })}</div>
        )}
      </div>
    </Panel>
  );
}

function AppearancePanel() {
  const { choice, setTheme } = useTheme();
  return (
    <Panel>
      <PanelHeader title="外观" />
      <div className="p-4 md:p-5">
        <Row label="主题">
          <Segmented<ThemeChoice> label="主题" value={choice} onChange={setTheme} options={[
            { value: 'system', label: <><Monitor className="size-4" />跟随系统</> }, { value: 'light', label: <><Sun className="size-4" />浅色</> }, { value: 'dark', label: <><Moon className="size-4" />深色</> },
          ]} />
        </Row>
      </div>
    </Panel>
  );
}

function AccountPanel() {
  const { signOut } = useSession();
  return (
    <Panel>
      <PanelHeader title="账号" description="修改后所有会话都会退出，需要用新信息重新登录。" />
      <div className="grid gap-4 p-4 md:p-5">
        <AccountForm />
        <Button variant="ghost" className="w-fit md:hidden" icon={<LogOut className="size-4" />} onClick={async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); }}>退出登录</Button>
      </div>
    </Panel>
  );
}
export function AccountForm({ forced = false }: { forced?: boolean }) {
  const { session, signOut } = useSession();
  const [form, setForm] = useState({ current: '', username: session.username, password: '', confirm: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  return (
    <form className="grid gap-3.5" onSubmit={async e => {
      e.preventDefault(); setError('');
      if (form.password !== form.confirm) { setError('两次输入的新密码不一致'); return; }
      const patch: Record<string, string> = { currentPassword: form.current };
      if (form.username !== session.username) patch.username = form.username;
      if (form.password) patch.newPassword = form.password;
      if (!patch.username && !patch.newPassword) { setError('没有需要保存的修改'); return; }
      setBusy(true);
      try { await api('/api/account', 'PATCH', patch); signOut('账号已更新，请用新信息登录。'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <Field label="当前密码"><Input type="password" autoComplete="current-password" required maxLength={256} value={form.current} onChange={set('current')} /></Field>
      <Field label="用户名"><Input autoComplete="username" required maxLength={80} value={form.username} onChange={set('username')} /></Field>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="新密码"><Input type="password" autoComplete="new-password" maxLength={256} required={forced} placeholder={forced ? '' : '留空则不修改'} value={form.password} onChange={set('password')} /></Field>
        <Field label="确认新密码"><Input type="password" autoComplete="new-password" maxLength={256} required={forced} value={form.confirm} onChange={set('confirm')} /></Field>
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
      <div><Button type="submit" variant="primary" loading={busy} className={forced ? 'w-full' : undefined} size={forced ? 'lg' : 'md'}>{forced ? '设置新密码' : '保存并重新登录'}</Button></div>
    </form>
  );
}

function DataPanel() {
  const { session, settings } = useSession();
  const endpoint = `${session.origin}/api/v1/activate`;
  const chip = (text: string, label: string) => (
    <span className="flex min-w-0 items-center gap-1 rounded-lg bg-surface-2 py-0.5 pr-0.5 pl-2.5 font-mono text-xs"><span className="truncate">{text}</span><CopyButton text={text} label={label} /></span>
  );
  return (
    <Panel>
      <PanelHeader title="数据与接入" />
      <div className="grid gap-4 p-4 md:p-5">
        <Row label="数据库备份"><div className="flex flex-wrap items-center gap-3"><a href="/api/backup" className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 font-medium shadow-sm hover:bg-hover md:h-9"><Database className="size-4" />下载备份</a><span className="text-xs text-muted">包含全部卡密、激活与设置，请妥善保管。</span></div></Row>
        <Row label="激活接口">{chip(endpoint, '复制接口地址')}</Row>
        <Row label="签名公钥">{chip(session.publicKey, '复制公钥')}</Row>
        <Row label="可用版本"><span>{settings.editions.join('、')}</span></Row>
      </div>
    </Panel>
  );
}
