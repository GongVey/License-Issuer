import { h, icon, replace } from './dom.js';

export function toast(message, type = 'success') {
  const el = h('div', { class: `toast ${type}` }, icon(type === 'error' ? 'alert' : 'check'), h('span', null, message));
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
}
export const fail = error => toast(error?.message || String(error), 'error');

// Runs an async action with a busy button; errors become toasts unless handled by the caller.
export async function busy(button, fn) {
  if (button?.classList.contains('is-busy')) return undefined;
  button?.classList.add('is-busy'); if (button) button.disabled = true;
  try { return await fn(); } catch (error) { fail(error); return undefined; }
  finally { button?.classList.remove('is-busy'); if (button) button.disabled = false; }
}

export async function copy(text, label = '已复制') {
  try { await navigator.clipboard.writeText(text); toast(label); return true; }
  catch {
    // Clipboard API needs a secure context; fall back to a temporary selection.
    const area = h('textarea', { class: 'sr-only', readonly: true }); area.value = text;
    document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove();
    ok ? toast(label) : toast('复制失败，请手动复制', 'error');
    return ok;
  }
}
export function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const link = h('a', { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const copyButton = (text, label = '复制', toastText) => h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: label, 'aria-label': label,
  onclick: event => { event.stopPropagation(); copy(typeof text === 'function' ? text() : text, toastText); } }, icon('copy'));

// A modal dialog appended to <body>, removed on close. Returns { dialog, close }.
export function modal({ title, description, body, footer, className = '', onClose, dismissible = () => true }) {
  const close = () => dialog.close();
  const head = h('div', { class: 'modal-head' }, h('div', null, h('h2', null, title), description ? h('p', null, description) : null),
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '关闭', onclick: () => dismissible() && close() }, icon('x')));
  const dialog = h('dialog', { class: `modal ${className}`.trim() }, head, h('div', { class: 'modal-body' }, body), footer ? h('div', { class: 'modal-foot' }, footer) : null);
  dialog.addEventListener('cancel', event => { if (!dismissible()) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  dialog.addEventListener('click', event => { if (event.target === dialog && dismissible()) close(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close, setBody: (...children) => replace(dialog.querySelector('.modal-body'), ...children),
    setFooter: (...children) => replace(dialog.querySelector('.modal-foot'), ...children) };
}

// Confirmation dialog. Resolves true only after `action` succeeds; errors stay inside the dialog.
export function confirm({ title, message, detail, confirmText = '确认', danger = true, typeToConfirm, action }) {
  return new Promise(resolve => {
    let running = false; let done = false;
    const error = h('p', { class: 'form-error', hidden: true });
    const input = typeToConfirm ? h('input', { class: 'input', autocomplete: 'off', placeholder: `输入 ${typeToConfirm} 以确认`, 'aria-label': '确认内容' }) : null;
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', disabled: Boolean(typeToConfirm) }, confirmText);
    input?.addEventListener('input', () => { ok.disabled = input.value.trim() !== String(typeToConfirm); });
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => !running && m.close() }, '取消');
    const m = modal({
      title, className: 'narrow', dismissible: () => !running,
      body: h('div', { class: 'form-grid' },
        h('div', { class: 'confirm-body' }, h('span', { class: `confirm-icon ${danger ? '' : 'warn'}` }, icon(danger ? 'alert' : 'info')), h('div', null, h('p', null, message))),
        detail ? h('div', { class: 'callout warn' }, icon('alert'), h('span', null, detail)) : null, input, error),
      footer: [cancel, ok],
      onClose: () => resolve(done),
    });
    ok.addEventListener('click', async () => {
      running = true; error.hidden = true; ok.classList.add('is-busy'); ok.disabled = true; cancel.disabled = true;
      try { await action?.(); done = true; m.close(); }
      catch (e) { error.textContent = e.message; error.hidden = false; }
      finally { running = false; ok.classList.remove('is-busy'); ok.disabled = false; cancel.disabled = false; }
    });
    (input || cancel).focus();
  });
}

export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(iconName), h('strong', null, title), text ? h('p', null, text) : null, action);
}
export function pager({ offset, limit, total, onChange, sizes }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return h('div', { class: 'pager' },
    h('span', null, total ? `第 ${offset + 1}–${Math.min(offset + limit, total)} 条，共 ${total} 条` : '共 0 条'),
    h('div', { class: 'controls' },
      sizes ? h('select', { class: 'select', 'aria-label': '每页条数', onchange: e => onChange(0, Number(e.target.value)) },
        sizes.map(n => h('option', { value: n, selected: n === limit }, `${n} 条/页`))) : null,
      h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '上一页', disabled: offset === 0, onclick: () => onChange(Math.max(0, offset - limit), limit) }, icon('left')),
      h('span', null, `${page} / ${pages}`),
      h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': '下一页', disabled: offset + limit >= total, onclick: () => onChange(offset + limit, limit) }, icon('right'))));
}
export function stepper(input, min, max) {
  const set = delta => { input.value = String(Math.min(max, Math.max(min, (Number(input.value) || min) + delta))); input.dispatchEvent(new Event('input', { bubbles: true })); };
  return h('div', { class: 'stepper' },
    h('button', { class: 'btn', type: 'button', 'aria-label': '减少', tabindex: '-1', onclick: () => set(-1) }, icon('minus')), input,
    h('button', { class: 'btn', type: 'button', 'aria-label': '增加', tabindex: '-1', onclick: () => set(1) }, icon('plus')));
}
export const debounce = (fn, ms = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
