import { h, icon, replace } from '../dom.js';
import { api } from '../api.js';
import { busy, copyButton, toast } from '../ui.js';
import { state, storage, changed } from '../state.js';
import { fillTemplate, product, productChip } from '../format.js';

const COLORS = ['teal', 'indigo', 'amber', 'rose', 'violet', 'sky', 'lime', 'slate'];
const PLACEHOLDERS = [['{cardCode}', '卡密'], ['{product}', '产品名称'], ['{edition}', '版本'], ['{maxDevices}', '设备上限'], ['{customer}', '客户']];

const panel = (title, description, ...children) => h('section', { class: 'panel' },
  h('div', { class: 'panel-head' }, h('div', null, h('h2', null, title), description ? h('p', null, description) : null)), h('div', { class: 'panel-body' }, children));

export async function settings(root) {
  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '设置'))),
    h('div', { class: 'settings' }, productsPanel(), templatesPanel(), presetsPanel(), appearancePanel(), accountPanel(), dataPanel()));
}
async function save(patch, message = '已保存') {
  state.settings = await api('/api/settings', 'PUT', patch);
  toast(message); changed('settings');
}

function productsPanel() {
  const rows = state.settings.products.map(p => {
    let color = p.color;
    const name = h('input', { class: 'input', maxlength: 40, value: p.name, 'aria-label': `${p.id} 显示名称` });
    const swatches = COLORS.map(c => h('button', { class: 'swatch', type: 'button', dataset: { color: c }, 'aria-label': c, 'aria-pressed': String(c === color),
      onclick: () => { color = c; swatches.forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color === c))); } }));
    return { id: p.id, value: () => ({ id: p.id, name: name.value, color }),
      el: h('div', { class: 'setting-row' }, h('div', null, h('code', null, p.id)), h('div', { class: 'form-grid' }, name, h('div', { class: 'row' }, swatches))) };
  });
  const button = h('button', { class: 'btn btn-primary', type: 'button' }, '保存');
  button.addEventListener('click', () => busy(button, () => save({ products: rows.map(r => r.value()) })));
  return panel('产品', '产品标识由服务端 LICENSE_PRODUCTS 配置，客户端会校验；这里只修改后台显示的名称和颜色。', rows.map(r => r.el), h('div', null, button));
}

function templatesPanel() {
  const sample = id => ({ cardCode: 'LIC-1A2B3C4D-5E6F7A8B-9C0D1E2F-3A4B5C6D-7E8F9A0B', product: product(id).name, edition: state.settings.editions[0], maxDevices: 2, customer: '张三' });
  const editors = state.settings.products.map(p => {
    const area = h('textarea', { class: 'textarea mono', rows: 6, maxlength: 4000, value: state.settings.templates[p.id], 'aria-label': `${p.id} 发货模板` });
    const preview = h('div', { class: 'template-preview' }, fillTemplate(area.value, sample(p.id)));
    area.addEventListener('input', () => { preview.textContent = fillTemplate(area.value, sample(p.id)); });
    return { id: p.id, area, el: h('div', { class: 'template-grid' }, productChip(p.id), area, h('span', { class: 'muted small' }, '预览'), preview) };
  });
  const button = h('button', { class: 'btn btn-primary', type: 'button' }, '保存模板');
  button.addEventListener('click', () => busy(button, () => save({ templates: Object.fromEntries(editors.map(e => [e.id, e.area.value])) })));
  return panel('发货模板', '在卡密详情或生成结果中点「复制发货文案」时使用，直接粘贴给客户。',
    h('div', { class: 'row muted small' }, '可用变量：', PLACEHOLDERS.map(([key, label]) => h('span', { class: 'code-chip', title: label }, key))),
    editors.map(e => e.el), h('div', null, button));
}

function presetsPanel() {
  const list = h('div');
  const render = () => replace(list, state.settings.presets.length ? state.settings.presets.map(preset => {
    const name = h('input', { class: 'input', maxlength: 40, value: preset.name, 'aria-label': '预设名称' });
    const rename = h('button', { class: 'btn btn-sm', type: 'button' }, '重命名');
    rename.addEventListener('click', () => busy(rename, async () => {
      await save({ presets: state.settings.presets.map(p => p.id === preset.id ? { ...p, name: name.value } : p) }, '已重命名'); render();
    }));
    const remove = h('button', { class: 'btn btn-sm btn-danger-ghost btn-icon', type: 'button', 'aria-label': '删除预设' }, icon('trash'));
    remove.addEventListener('click', () => busy(remove, async () => { await save({ presets: state.settings.presets.filter(p => p.id !== preset.id) }, '已删除预设'); render(); }));
    return h('div', { class: 'list-row' }, h('div', { class: 'spacer form-grid' }, name,
      h('span', { class: 'muted small' }, `${product(preset.productId).name} · ${preset.edition} · ${preset.quantity} 张 · 每卡 ${preset.maxDevices} 台`)), rename, remove);
  }) : h('p', { class: 'muted small' }, '还没有预设。在「生成卡密」窗口填好参数后点「存为预设」即可。'));
  render();
  return panel('生成预设', '常用的产品 / 数量 / 设备上限组合，在生成窗口一键套用。', list);
}

function appearancePanel() {
  const currentTheme = storage.get('theme', 'system');
  const options = [['system', '跟随系统', 'monitor'], ['light', '浅色', 'sun'], ['dark', '深色', 'moon']];
  const buttons = options.map(([value, label, iconName]) => h('button', { type: 'button', 'aria-pressed': String(value === currentTheme), dataset: { value },
    onclick: () => {
      storage.set('theme', value === 'system' ? null : value);
      if (value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = value;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    } }, icon(iconName), label));
  return panel('外观', null, h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '主题'), h('div', null, h('div', { class: 'segmented' }, buttons))));
}

function accountPanel() {
  return panel('账号', '修改后所有会话都会退出，需要用新信息重新登录。', accountForm());
}
export function accountForm({ forced = false } = {}) {
  const current = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, maxlength: 256 });
  const username = h('input', { class: 'input', autocomplete: 'username', required: true, maxlength: 80, value: state.session.username });
  const password = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 256, required: forced, placeholder: forced ? '' : '留空则不修改' });
  const confirmPassword = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 256, required: forced });
  const error = h('p', { class: 'form-error', hidden: true });
  const submit = h('button', { class: `btn btn-primary ${forced ? 'btn-block' : ''}`, type: 'submit' }, forced ? '设置新密码' : '保存并重新登录');
  const form = h('form', { class: 'form-grid' },
    h('label', { class: 'field' }, h('span', null, '当前密码'), current),
    h('label', { class: 'field' }, h('span', null, '用户名'), username),
    h('div', { class: 'form-row' }, h('label', { class: 'field' }, h('span', null, '新密码'), password), h('label', { class: 'field' }, h('span', null, '确认新密码'), confirmPassword)),
    error, h('div', null, submit));
  form.addEventListener('submit', event => {
    event.preventDefault(); error.hidden = true;
    busy(submit, async () => {
      try {
        if (password.value !== confirmPassword.value) throw new Error('两次输入的新密码不一致');
        const patch = { currentPassword: current.value };
        if (username.value !== state.session.username) patch.username = username.value;
        if (password.value) patch.newPassword = password.value;
        if (!patch.username && !patch.newPassword) throw new Error('没有需要保存的修改');
        await api('/api/account', 'PATCH', patch);
        toast('账号已更新，请重新登录');
        changed('signed-out');
      } catch (e) { error.textContent = e.message; error.hidden = false; }
    });
  });
  return form;
}

function dataPanel() {
  const endpoint = `${state.session.origin}/api/v1/activate`;
  return panel('数据与接入', null,
    h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '数据库备份'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '/api/backup' }, icon('database'), '下载备份'), h('span', { class: 'muted small' }, '包含全部卡密、激活与设置；请妥善保管。'))),
    h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '激活接口'),
      h('span', { class: 'code-chip' }, endpoint, copyButton(endpoint, '复制接口地址'))),
    h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '签名公钥'),
      h('span', { class: 'code-chip' }, state.session.publicKey, copyButton(state.session.publicKey, '复制公钥'))),
    h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '可用版本'), h('span', null, state.settings.editions.join('、'))),
    h('div', { class: 'setting-row' }, h('span', { class: 'label' }, '旧版许可证'), h('a', { href: '#/legacy' }, '查看 PA1 许可证（只读）')));
}
