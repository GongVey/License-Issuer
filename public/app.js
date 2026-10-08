import { h, icon, replace } from './js/dom.js';
import { api, setCsrf, onUnauthorized } from './js/api.js';
import { busy, fail, toast } from './js/ui.js';
import { state, onChange, storage } from './js/state.js';
import { current, navigate, onRoute } from './js/router.js';
import { openLookup } from './js/lookup.js';
import { openGenerate } from './js/generate.js';
import { overview } from './js/views/overview.js';
import { cards } from './js/views/cards.js';
import { batches } from './js/views/batches.js';
import { logs } from './js/views/logs.js';
import { legacy } from './js/views/legacy.js';
import { settings, accountForm } from './js/views/settings.js';

const root = document.getElementById('root');
const VIEWS = {
  '/overview': { title: '概览', icon: 'overview', render: overview },
  '/cards': { title: '卡密', icon: 'cards', render: cards },
  '/batches': { title: '批次', icon: 'batches', render: batches },
  '/logs': { title: '日志', icon: 'activity', render: logs },
  '/settings': { title: '设置', icon: 'settings', render: settings },
  '/legacy': { title: '旧版许可证', icon: 'archive', render: legacy, hidden: true },
};
const NAV = ['/overview', '/cards', '/batches', '/logs', '/settings'];
let content = null; let dispose = null; let renderId = 0;

function closeOverlays() { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); }
function signedOut(message) {
  state.session = null; state.settings = null; setCsrf('');
  closeOverlays(); dispose?.(); dispose = null; content = null;
  renderLogin(message);
}
onUnauthorized(() => { if (state.session) signedOut('登录已过期，请重新登录。'); });
onChange(topic => {
  if (topic === 'signed-out') signedOut();
});

function brand() {
  return h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('logo')), h('div', null, h('strong', null, 'License Issuer'), h('span', null, '统一授权服务')));
}

function renderLogin(message) {
  const username = h('input', { class: 'input', autocomplete: 'username', required: true, maxlength: 80, value: storage.get('username', '') });
  const password = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, maxlength: 256 });
  const error = h('p', { class: 'form-error', hidden: !message }, message || '');
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, '登录');
  const form = h('form', { class: 'form-grid' },
    h('label', { class: 'field' }, h('span', null, '用户名'), username),
    h('label', { class: 'field' }, h('span', null, '密码'), password), error, submit);
  form.addEventListener('submit', event => {
    event.preventDefault(); error.hidden = true;
    busy(submit, async () => {
      try {
        const value = password.value; password.value = '';
        const result = await api('/api/login', 'POST', { username: username.value, password: value });
        storage.set('username', username.value);
        setCsrf(result.csrf);
        await start();
      } catch (e) { error.textContent = e.message; error.hidden = false; password.focus(); }
    });
  });
  document.title = '登录 · License Issuer';
  replace(root, h('main', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'auth-brand' }, h('span', { class: 'logo' }, icon('logo')), h('div', null, h('strong', null, 'License Issuer'), h('span', null, '照片归档 · 壁纸 统一授权'))),
    h('h1', null, '管理员登录'), h('p', { class: 'lead' }, '管理卡密、设备额度与激活记录。'), form)));
  (username.value ? password : username).focus();
}

function renderForcedPassword() {
  document.title = '设置新密码 · License Issuer';
  replace(root, h('main', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'auth-brand' }, h('span', { class: 'logo' }, icon('logo')), h('div', null, h('strong', null, 'License Issuer'), h('span', null, `当前账号：${state.session.username}`))),
    h('h1', null, '请先设置新密码'), h('p', { class: 'lead' }, '你正在使用初始密码。设置新密码后需要重新登录。'),
    accountForm({ forced: true }),
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: logout }, '退出登录'))));
}

async function logout() {
  try { await api('/api/logout', 'POST', {}); } catch {}
  signedOut(); toast('已退出登录');
}

function renderShell() {
  const navLinks = (className) => NAV.map(path => h('a', { href: `#${path}`, dataset: { path }, class: className }, icon(VIEWS[path].icon), VIEWS[path].title));
  const sideNav = h('nav', { class: 'nav', 'aria-label': '主导航' }, navLinks());
  const mobileNav = h('nav', { class: 'mobile-nav', 'aria-label': '主导航' }, NAV.map(path => h('a', { href: `#${path}`, dataset: { path } }, VIEWS[path].title)));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const themeButton = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '切换深浅色', title: '切换深浅色' });
  const paintTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    replace(themeButton, icon(dark ? 'sun' : 'moon'));
  };
  themeButton.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    storage.set('theme', dark ? 'light' : 'dark'); paintTheme();
  });
  paintTheme();
  content = h('div', { class: 'content', id: 'content' });
  replace(root, h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' }, brand(), sideNav,
      h('div', { class: 'sidebar-foot' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/legacy', title: '旧版 PA1 许可证（只读）' }, icon('archive'), '旧版许可证'),
        h('div', { class: 'user-row' }, h('span', { class: 'avatar' }, state.session.username.slice(0, 1)),
          h('span', { class: 'truncate spacer' }, state.session.username),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', title: '退出登录', 'aria-label': '退出登录', onclick: logout }, icon('logout'))))),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        h('button', { class: 'search-trigger', type: 'button', onclick: () => openLookup() }, icon('search'), h('span', null, '查找卡密、机器码、客户…'), h('kbd', null, isMac ? '⌘K' : 'Ctrl K')),
        h('span', { class: 'spacer' }),
        themeButton,
        h('button', { class: 'btn btn-ghost btn-icon hide-desktop', type: 'button', title: '退出登录', 'aria-label': '退出登录', onclick: logout }, icon('logout')),
        mobileNav),
      h('main', null, content))));
}

async function route({ path, params }) {
  if (!state.session || state.session.mustChangePassword || !content) return;
  const view = VIEWS[path];
  if (!view) { navigate('/overview', {}, { replace: true }); return; }
  for (const link of root.querySelectorAll('[data-path]')) {
    if (link.dataset.path === path) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.title = `${view.title} · License Issuer`;
  closeOverlays();
  dispose?.(); dispose = null;
  const mine = ++renderId;
  const container = h('div');
  replace(content, h('div', { class: 'panel panel-body' }, h('div', { class: 'skeleton' })));
  try {
    const cleanup = await view.render(container, params);
    if (mine !== renderId) { cleanup?.(); return; }
    replace(content, container);
    dispose = typeof cleanup === 'function' ? cleanup : null;
  } catch (error) {
    if (mine !== renderId || !state.session) return;
    replace(content, h('div', { class: 'panel' }, h('div', { class: 'empty' }, icon('alert'), h('strong', null, '页面加载失败'), h('p', null, error.message),
      h('button', { class: 'btn', type: 'button', onclick: () => route(current()) }, icon('refresh'), '重试'))));
  }
}
onRoute(route);

async function start() {
  const session = await api('/api/session');
  setCsrf(session.csrf);
  state.session = session; state.settings = session.settings;
  if (session.mustChangePassword) { renderForcedPassword(); return; }
  renderShell();
  await route(current());
}

addEventListener('keydown', event => {
  if (!state.session || state.session.mustChangePassword) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openLookup(); return; }
  if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.key === 'n') { event.preventDefault(); openGenerate(); }
  if (event.key === '/') {
    const search = document.getElementById('cards-search');
    event.preventDefault();
    search ? search.focus() : openLookup();
  }
});
// Pasting a card code or machine code anywhere outside an input jumps straight to lookup.
addEventListener('paste', event => {
  if (!state.session || state.session.mustChangePassword || /^(INPUT|TEXTAREA)$/.test(event.target.tagName) || document.querySelector('dialog[open]')) return;
  const text = event.clipboardData?.getData('text')?.trim() || '';
  if (/^LIC-/i.test(text) || /^sha256:/i.test(text)) { event.preventDefault(); openLookup(text); }
});

start().catch(error => {
  if (error.status === 401) renderLogin();
  else { renderLogin(); fail(error); }
});
