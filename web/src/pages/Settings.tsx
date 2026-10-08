import { useState, type ReactNode } from 'react';
import { Database, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { applyBranding } from '../lib/brand';
import { fillTemplate } from '../lib/format';
import { useTheme, type ThemeChoice } from '../lib/theme';
import type { Branding, Settings } from '../lib/types';
import { useSession } from '../session';
import { Button, ColorPicker, Field, IconButton, Input, Segmented, Switch, Textarea } from '../ui/controls';
import { CopyButton, Panel, ProductAvatar, ProductChip } from '../ui/display';
import { useToast } from '../ui/feedback';
import { BrandMark } from '../layout/Logo';
import { PageHeader } from './PageHeader';

const ACCENTS = ['#5b5bd6', '#2563eb', '#0e7c6b', '#16a34a', '#7c3aed', '#db2777', '#e4572e', '#18181b'];
const PRODUCT_COLORS = ['#2f7ae5', '#e4572e', '#0f9488', '#7c5cdb', '#d08a0e', '#d6457a', '#3a9b4a', '#64748b'];
const PLACEHOLDERS: Array<[string, string]> = [['{cardCode}', '卡密'], ['{product}', '产品名称'], ['{edition}', '版本'], ['{maxDevices}', '设备上限'], ['{customer}', '客户']];

// Section layout: title + explanation on the left, the panel of controls on the right (stacked on phones).
function Section({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-8 first:pt-0 last:border-b-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div><h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}</div>
      <Panel className="overflow-hidden">
        <div className="grid gap-5 p-4 md:p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-4 py-2.5 md:px-5">{footer}</div>}
      </Panel>
    </section>
  );
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
      <PageHeader title="设置" description="品牌、产品、发货模板和账号。" />
      <div className="max-w-5xl">
        <BrandingSection /><ProductsSection /><TemplatesSection /><PresetsSection /><AppearanceSection /><AccountSection /><DataSection />
      </div>
    </>
  );
}

function BrandingSection() {
  const { settings } = useSession();
  const { save, saving } = useSaveSettings();
  const [brand, setBrand] = useState<Branding>(settings.branding);
  const set = <K extends keyof Branding>(key: K, value: Branding[K]) => {
    setBrand(b => ({ ...b, [key]: value }));
    if (key === 'accent') document.documentElement.style.setProperty('--accent', value as string); // live preview
  };
  const dirty = JSON.stringify(brand) !== JSON.stringify(settings.branding);
  return (
    <Section title="品牌" description="显示在侧边栏、浏览器标题和登录页。主题色会应用到按钮、选中态等所有强调元素。"
      footer={<>
        {dirty && <Button variant="ghost" onClick={() => { setBrand(settings.branding); applyBranding(settings.branding); }}>撤销</Button>}
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => save({ branding: brand })}>保存</Button>
      </>}>
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 ring-1 ring-line ring-inset">
        <BrandMark name={brand.name || '?'} className="size-10 rounded-xl text-lg" />
        <div className="min-w-0"><p className="truncate font-semibold">{brand.name || '（未填写）'}</p><p className="truncate text-xs text-muted">{brand.tagline || '—'}</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="系统名称"><Input maxLength={40} value={brand.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="副标题"><Input maxLength={80} value={brand.tagline} placeholder="可选" onChange={e => set('tagline', e.target.value)} /></Field>
      </div>
      <Field label="主题色"><ColorPicker label="主题色" value={brand.accent} swatches={ACCENTS} onChange={v => set('accent', v)} /></Field>
      <Switch checked={brand.showProducts} onChange={v => set('showProducts', v)} label="在登录页展示已接入的产品" description="关闭后，未登录的访问者看不到产品名称。" />
    </Section>
  );
}

function ProductsSection() {
  const { settings } = useSession();
  const { save, saving } = useSaveSettings();
  const [products, setProducts] = useState(settings.products);
  const dirty = JSON.stringify(products) !== JSON.stringify(settings.products);
  return (
    <Section title="产品" description={<>产品标识由服务端 <code className="font-mono text-xs">LICENSE_PRODUCTS</code> 配置，客户端会校验它；新增产品后在这里设置显示名称和颜色即可。</>}
      footer={<Button variant="primary" loading={saving} disabled={!dirty} onClick={() => save({ products })}>保存</Button>}>
      {products.map((p, i) => (
        <div key={p.id} className="grid gap-3 border-b border-line pb-5 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start">
          <div className="flex items-center gap-3">
            <ProductAvatar id={p.id} name={p.name || p.id} color={p.color} size="lg" />
            <div className="min-w-0 flex-1"><Input maxLength={40} value={p.name} aria-label={`${p.id} 显示名称`} onChange={e => setProducts(list => list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <p className="mt-1 font-mono text-xs text-muted">{p.id}</p></div>
          </div>
          <ColorPicker label={`${p.id} 颜色`} value={p.color} swatches={PRODUCT_COLORS} onChange={color => setProducts(list => list.map((x, j) => j === i ? { ...x, color } : x))} />
        </div>
      ))}
    </Section>
  );
}

function TemplatesSection() {
  const { settings, product } = useSession();
  const { save, saving } = useSaveSettings();
  const [templates, setTemplates] = useState(settings.templates);
  const sample = (id: string) => ({ cardCode: 'LIC-1A2B3C4D-5E6F7A8B-9C0D1E2F-3A4B5C6D-7E8F9A0B', product: product(id).name, edition: settings.editions[0], maxDevices: 2, customer: '张三' });
  return (
    <Section title="发货模板" description={<>点「复制发货文案」时使用，直接粘贴给客户。可用变量：<span className="mt-1.5 flex flex-wrap gap-1">{PLACEHOLDERS.map(([key, label]) => <code key={key} title={label} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{key}</code>)}</span></>}
      footer={<Button variant="primary" loading={saving} disabled={JSON.stringify(templates) === JSON.stringify(settings.templates)} onClick={() => save({ templates })}>保存模板</Button>}>
      {settings.products.map(p => (
        <div key={p.id} className="grid gap-2">
          <ProductChip product={p} className="text-[13px]" />
          <div className="grid gap-2 xl:grid-cols-2">
            <Textarea rows={7} maxLength={4000} className="font-mono text-xs md:text-xs" aria-label={`${p.id} 发货模板`} value={templates[p.id] ?? ''} onChange={e => setTemplates({ ...templates, [p.id]: e.target.value })} />
            <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2 ring-1 ring-line ring-inset"><span className="mb-1 block text-[11px] font-medium text-muted">预览</span>{fillTemplate(templates[p.id] ?? '', sample(p.id))}</div>
          </div>
        </div>
      ))}
    </Section>
  );
}

function PresetsSection() {
  const { settings, product } = useSession();
  const { save } = useSaveSettings();
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <Section title="生成预设" description="常用的产品 / 数量 / 设备上限组合，在「生成卡密」窗口一键套用。">
      {settings.presets.length === 0 ? <p className="text-[13px] text-muted">还没有预设。在「生成卡密」窗口填好参数后点「存为预设」即可。</p> : (
        <div className="-my-2 divide-y divide-line">{settings.presets.map(preset => {
          const name = names[preset.id] ?? preset.name;
          const p = product(preset.productId);
          return (
            <div key={preset.id} className="flex items-center gap-3 py-3">
              <ProductAvatar id={p.id} name={p.name} color={p.color} />
              <div className="grid min-w-0 flex-1 gap-1">
                <Input maxLength={40} value={name} aria-label="预设名称" onChange={e => setNames({ ...names, [preset.id]: e.target.value })} />
                <span className="text-xs text-muted">{p.name} · {preset.edition} · {preset.quantity} 张 · 每卡 {preset.maxDevices} 台</span>
              </div>
              {name !== preset.name && <Button size="sm" onClick={() => save({ presets: settings.presets.map(x => x.id === preset.id ? { ...x, name } : x) }, '已重命名')}>保存</Button>}
              <IconButton label="删除预设" size="sm" variant="danger-ghost" onClick={() => save({ presets: settings.presets.filter(x => x.id !== preset.id) }, '已删除预设')}><Trash2 /></IconButton>
            </div>
          );
        })}</div>
      )}
    </Section>
  );
}

function AppearanceSection() {
  const { choice, setTheme } = useTheme();
  return (
    <Section title="外观" description="只影响当前浏览器。">
      <Segmented<ThemeChoice> label="主题" value={choice} onChange={setTheme} className="w-fit" options={[
        { value: 'system', label: <><Monitor className="size-3.5" />跟随系统</> }, { value: 'light', label: <><Sun className="size-3.5" />浅色</> }, { value: 'dark', label: <><Moon className="size-3.5" />深色</> },
      ]} />
    </Section>
  );
}

function AccountSection() {
  const { signOut } = useSession();
  return (
    <Section title="账号" description="修改后所有会话都会退出，需要用新信息重新登录。">
      <AccountForm />
      <Button variant="ghost" className="w-fit md:hidden" icon={<LogOut />} onClick={async () => { try { await api('/api/logout', 'POST', {}); } catch { /* ignore */ } signOut(); }}>退出登录</Button>
    </Section>
  );
}
export function AccountForm({ forced = false }: { forced?: boolean }) {
  const { session, signOut } = useSession();
  const [form, setForm] = useState({ current: '', username: session.username, password: '', confirm: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const big = forced ? 'md:h-10 md:text-sm' : undefined;
  return (
    <form className="grid gap-4" onSubmit={async e => {
      e.preventDefault(); setError('');
      if (form.password !== form.confirm) { setError('两次输入的新密码不一致'); return; }
      const patch: Record<string, string> = { currentPassword: form.current };
      if (form.username !== session.username) patch.username = form.username;
      if (form.password) patch.newPassword = form.password;
      if (!patch.username && !patch.newPassword) { setError('没有需要保存的修改'); return; }
      setBusy(true);
      try { await api('/api/account', 'PATCH', patch); signOut('账号已更新，请用新信息登录。'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <div className={forced ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2'}>
        <Field label="当前密码"><Input className={big} type="password" autoComplete="current-password" required maxLength={256} value={form.current} onChange={set('current')} /></Field>
        <Field label="用户名"><Input className={big} autoComplete="username" required maxLength={80} value={form.username} onChange={set('username')} /></Field>
        <Field label="新密码"><Input className={big} type="password" autoComplete="new-password" maxLength={256} required={forced} placeholder={forced ? '' : '留空则不修改'} value={form.password} onChange={set('password')} /></Field>
        <Field label="确认新密码"><Input className={big} type="password" autoComplete="new-password" maxLength={256} required={forced} value={form.confirm} onChange={set('confirm')} /></Field>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
      <div><Button type="submit" variant="primary" loading={busy} className={forced ? 'w-full' : undefined} size={forced ? 'lg' : 'md'}>{forced ? '设置新密码' : '保存并重新登录'}</Button></div>
    </form>
  );
}

function DataSection() {
  const { session, settings } = useSession();
  const endpoint = `${session.origin}/api/v1/activate`;
  const row = (label: string, value: ReactNode) => <div className="grid gap-1.5 md:grid-cols-[96px_minmax(0,1fr)] md:items-center md:gap-4"><span className="text-[13px] text-muted">{label}</span><div className="min-w-0">{value}</div></div>;
  const chip = (text: string, label: string) => (
    <span className="flex min-w-0 items-center gap-1 rounded-lg bg-surface-2 py-0.5 pr-0.5 pl-2.5 font-mono text-xs ring-1 ring-line ring-inset"><span className="truncate">{text}</span><CopyButton text={text} label={label} /></span>
  );
  return (
    <Section title="数据与接入" description="客户端接入所需的信息，以及数据库备份。">
      {row('激活接口', chip(endpoint, '复制接口地址'))}
      {row('签名公钥', chip(session.publicKey, '复制公钥'))}
      {row('可用版本', <span className="text-[13px]">{settings.editions.join('、')}</span>)}
      {row('数据库', <div className="flex flex-wrap items-center gap-3"><a href="/api/backup" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium shadow-xs hover:bg-hover md:h-8"><Database className="size-4" />下载备份</a><span className="text-xs text-muted">包含全部卡密、激活与设置，请妥善保管。</span></div>)}
    </Section>
  );
}
