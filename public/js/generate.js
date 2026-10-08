import { h, icon, replace } from './dom.js';
import { api } from './api.js';
import { busy, copy, copyButton, download, modal, stepper, toast } from './ui.js';
import { state, changed, storage } from './state.js';
import { dateTime, deliveryText, product, productChip } from './format.js';
import { openCard } from './card-drawer.js';

const CHANNELS = ['闲鱼', '淘宝', '微信', '小红书', '直售', '赠送', '测试'];

export function openGenerate(prefill = {}) {
  const { settings } = state;
  const last = (() => { try { return JSON.parse(storage.get('generate:last', '{}')); } catch { return {}; } })();
  const values = { productId: settings.products[0]?.id, edition: settings.editions[0], maxDevices: 2, quantity: 1, ...last, ...prefill };
  if (!settings.products.some(p => p.id === values.productId)) values.productId = settings.products[0]?.id;
  if (!settings.editions.includes(values.edition)) values.edition = settings.editions[0];

  const productButtons = settings.products.map(p => h('button', { type: 'button', 'aria-pressed': String(p.id === values.productId), dataset: { id: p.id },
    onclick: () => { values.productId = p.id; for (const b of productButtons) b.setAttribute('aria-pressed', String(b.dataset.id === p.id)); } }, productChip(p.id)));
  const edition = h('select', { class: 'select' }, settings.editions.map(e => h('option', { value: e, selected: e === values.edition }, e)));
  const quantity = h('input', { class: 'input', type: 'number', min: 1, max: 100, value: values.quantity, inputmode: 'numeric', 'aria-label': '生成数量' });
  const maxDevices = h('input', { class: 'input', type: 'number', min: 1, max: 100, value: values.maxDevices, inputmode: 'numeric', 'aria-label': '每卡设备上限' });
  const customer = h('input', { class: 'input', maxlength: 120, placeholder: '客户昵称（可选）', value: prefill.customer || '' });
  const channel = h('input', { class: 'input', maxlength: 60, placeholder: '例如 闲鱼', list: 'generate-channels', value: prefill.channel ?? last.channel ?? '' });
  const orderNo = h('input', { class: 'input', maxlength: 120, placeholder: '订单号（可选）' });
  const note = h('textarea', { class: 'textarea', rows: 2, maxlength: 2000, placeholder: '批次备注（可选）' });
  const error = h('p', { class: 'form-error', hidden: true });

  const applyPreset = preset => {
    values.productId = preset.productId;
    for (const b of productButtons) b.setAttribute('aria-pressed', String(b.dataset.id === preset.productId));
    edition.value = preset.edition; quantity.value = preset.quantity; maxDevices.value = preset.maxDevices;
  };
  const presets = settings.presets.length ? h('div', { class: 'field' }, h('span', null, '快捷预设'),
    h('div', { class: 'presets' }, settings.presets.map(preset => h('button', { class: 'preset', type: 'button', onclick: () => applyPreset(preset),
      title: `${product(preset.productId).name} · ${preset.edition} · ${preset.quantity} 张 · 每卡 ${preset.maxDevices} 台` }, icon('star'), preset.name)))) : null;

  const savePreset = h('button', { class: 'btn btn-ghost', type: 'button', title: '把当前参数保存为快捷预设' }, icon('star'), '存为预设');
  savePreset.addEventListener('click', () => busy(savePreset, async () => {
    const name = `${product(values.productId).name} ×${quantity.value}`;
    const next = [...settings.presets, { name, productId: values.productId, edition: edition.value, maxDevices: Number(maxDevices.value), quantity: Number(quantity.value) }];
    state.settings = await api('/api/settings', 'PUT', { presets: next });
    toast(`已保存预设「${name}」，可在设置中重命名`);
  }));
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', form: 'generate-form' }, icon('plus'), '生成');
  const form = h('form', { id: 'generate-form', class: 'form-grid' },
    presets,
    h('div', { class: 'field' }, h('span', null, '产品'), h('div', { class: 'segmented', role: 'group', 'aria-label': '产品' }, productButtons)),
    h('div', { class: 'form-row' },
      h('label', { class: 'field' }, h('span', null, '生成数量'), stepper(quantity, 1, 100)),
      h('label', { class: 'field' }, h('span', null, '每卡设备上限'), stepper(maxDevices, 1, 100))),
    settings.editions.length > 1 ? h('label', { class: 'field' }, h('span', null, '授权版本'), edition) : null,
    h('div', { class: 'form-row' }, h('label', { class: 'field' }, h('span', null, '客户'), customer), h('label', { class: 'field' }, h('span', null, '渠道'), channel)),
    h('datalist', { id: 'generate-channels' }, CHANNELS.map(value => h('option', { value }))),
    h('label', { class: 'field' }, h('span', null, '订单号'), orderNo),
    h('label', { class: 'field' }, h('span', null, '备注'), note),
    error);

  const m = modal({ title: '生成卡密', description: '卡密加密保存，之后也能在详情里再次查看。', body: form, footer: [h('div', { class: 'left' }, savePreset), submit] });
  form.addEventListener('submit', event => {
    event.preventDefault(); error.hidden = true;
    const input = { productId: values.productId, edition: edition.value, quantity: Number(quantity.value), maxDevices: Number(maxDevices.value),
      customer: customer.value, channel: channel.value, orderNo: orderNo.value, note: note.value };
    busy(submit, async () => {
      try {
        const result = await api('/api/cards/batch', 'POST', input);
        storage.set('generate:last', JSON.stringify({ productId: input.productId, edition: input.edition, maxDevices: input.maxDevices, quantity: input.quantity, channel: input.channel }));
        changed('cards');
        showResult(m, result, input);
      } catch (e) { error.textContent = e.message; error.hidden = false; }
    });
  });
  setTimeout(() => quantity.focus(), 0);
}

function showResult(m, result, input) {
  const cards = result.items;
  const codes = cards.map(card => card.cardCode);
  const p = product(input.productId);
  const stamp = dateTime(Date.now()).replace(/[-: ]/g, '');
  const csv = () => '﻿' + [['卡密', '产品', '版本', '设备上限', '客户', '渠道', '订单号', '备注'].join(','),
    ...cards.map(card => [card.cardCode, p.name, card.edition, card.maxDevices, card.customer, card.channel, card.orderNo, card.note]
      .map(v => { const t = String(v ?? '').replace(/^([=+\-@])/, "'$1"); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; }).join(','))].join('\r\n');
  m.setBody(
    h('div', { class: 'result-summary' }, icon('check'), h('div', null, h('strong', null, `已生成 ${cards.length} 张 ${p.name} 卡密`),
      h('span', { class: 'small' }, `${input.edition} · 每卡 ${input.maxDevices} 台${input.customer ? ` · ${input.customer}` : ''}`))),
    h('div', { class: 'codes' }, cards.map((card, i) => h('div', { class: 'code-line' }, h('span', { class: 'n' }, i + 1), h('code', null, card.cardCode),
      copyButton(card.cardCode, '复制卡密', '卡密已复制'),
      h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: '复制发货文案', 'aria-label': '复制发货文案', onclick: () => copy(deliveryText(card, card.cardCode), '发货文案已复制') }, icon('message')),
      h('button', { class: 'btn btn-ghost btn-sm btn-icon', type: 'button', title: '打开详情', 'aria-label': '打开详情', onclick: () => { m.close(); openCard(card.cardId); } }, icon('external'))))));
  const copyAll = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => copy(codes.join('\n'), `已复制 ${codes.length} 张卡密`) }, icon('copy'), cards.length > 1 ? '复制全部' : '复制卡密');
  m.setFooter(
    h('div', { class: 'left' },
      h('button', { class: 'btn', type: 'button', onclick: () => copy(cards.map(card => deliveryText(card, card.cardCode)).join('\n\n————————\n\n'), '发货文案已复制') }, icon('message'), '复制发货文案'),
      h('button', { class: 'btn', type: 'button', onclick: () => download(`${input.productId}-${stamp}.txt`, codes.join('\n') + '\n') }, icon('download'), 'TXT'),
      h('button', { class: 'btn', type: 'button', onclick: () => download(`${input.productId}-${stamp}.csv`, csv(), 'text/csv;charset=utf-8') }, icon('download'), 'CSV')),
    h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); openGenerate({ productId: input.productId }); } }, '继续生成'),
    copyAll);
  replace(m.dialog.querySelector('.modal-head h2'), '生成完成');
  m.dialog.querySelector('.modal-head p')?.remove();
  copyAll.focus();
}
