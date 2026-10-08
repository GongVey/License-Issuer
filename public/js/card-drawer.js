import { h, icon, replace } from './dom.js';
import { api, query } from './api.js';
import { busy, confirm, copy, copyButton, fail, toast } from './ui.js';
import { changed } from './state.js';
import { cardTitle, dateTime, deliveryText, maskCode, meter, productChip, relative, resultBadge, shortFingerprint, stateBadge, timeEl } from './format.js';

const CHANNELS = ['闲鱼', '淘宝', '微信', '小红书', '直售', '赠送', '测试'];
let current = null;

export async function openCard(cardId) {
  current?.close();
  const dialog = h('dialog', { class: 'drawer', 'aria-label': '卡密详情' });
  const instance = { close: () => dialog.close(), cardId };
  current = instance;
  dialog.addEventListener('close', () => { dialog.remove(); if (current === instance) current = null; });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.append(h('div', { class: 'drawer-head' }, h('div', { class: 'skeleton' })), h('div', { class: 'drawer-body' }, h('div', { class: 'skeleton' })));
  document.body.append(dialog);
  dialog.showModal();
  try {
    const card = await api(`/api/cards/${cardId}`);
    if (current === instance) render(dialog, card);
  } catch (error) { dialog.close(); fail(error); }
}

function render(dialog, card) {
  let revealed = null;
  const reload = async () => { const next = await api(`/api/cards/${card.cardId}`); render(dialog, next); changed('cards'); };
  const reveal = async () => (revealed ??= (await api(`/api/cards/${card.cardId}/reveal`, 'POST', {})).cardCode);

  // Card code
  const codeText = h('code', null, maskCode());
  const showButton = h('button', { class: 'btn btn-sm', type: 'button' }, icon('eye'), '显示');
  showButton.addEventListener('click', () => busy(showButton, async () => {
    if (codeText.dataset.shown) { codeText.textContent = maskCode(); delete codeText.dataset.shown; replace(showButton, icon('eye'), '显示'); return; }
    codeText.textContent = await reveal(); codeText.dataset.shown = '1'; replace(showButton, icon('eye'), '隐藏');
  }));
  const copyCode = h('button', { class: 'btn btn-sm', type: 'button' }, icon('copy'), '复制');
  copyCode.addEventListener('click', () => busy(copyCode, async () => copy(await reveal(), '卡密已复制')));
  const copyDelivery = h('button', { class: 'btn btn-sm', type: 'button' }, icon('message'), '复制发货文案');
  copyDelivery.addEventListener('click', () => busy(copyDelivery, async () => copy(deliveryText(card, await reveal()), '发货文案已复制')));
  const codeSection = h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h3', null, '卡密')),
    card.hasCode
      ? [h('div', { class: 'code-box' }, codeText, showButton), h('div', { class: 'page-actions' }, copyCode, copyDelivery)]
      : h('div', { class: 'callout' }, icon('info'), h('span', null, '这张卡创建于加密保存功能之前，无法回看卡密明文。')));

  // Editable customer info
  const inputs = {
    customer: h('input', { class: 'input', maxlength: 120, value: card.customer, placeholder: '客户昵称 / 姓名' }),
    channel: h('input', { class: 'input', maxlength: 60, value: card.channel, placeholder: '例如 闲鱼', list: 'channel-options' }),
    orderNo: h('input', { class: 'input', maxlength: 120, value: card.orderNo, placeholder: '订单号' }),
    note: h('textarea', { class: 'textarea', rows: 2, maxlength: 2000, value: card.note, placeholder: '备注' }),
  };
  const save = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', disabled: true }, '保存');
  const dirty = () => Object.entries(inputs).some(([key, el]) => el.value.trim() !== (card[key] || '').trim());
  const form = h('form', { class: 'form-grid', oninput: () => { save.disabled = !dirty(); } },
    h('datalist', { id: 'channel-options' }, CHANNELS.map(value => h('option', { value }))),
    h('div', { class: 'form-row' }, h('label', { class: 'field' }, h('span', null, '客户'), inputs.customer), h('label', { class: 'field' }, h('span', null, '渠道'), inputs.channel)),
    h('label', { class: 'field' }, h('span', null, '订单号'), inputs.orderNo),
    h('label', { class: 'field' }, h('span', null, '备注'), inputs.note),
    h('div', null, save));
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(save, async () => {
      const patch = Object.fromEntries(Object.entries(inputs).filter(([key, el]) => el.value.trim() !== (card[key] || '').trim()).map(([key, el]) => [key, el.value]));
      await api(`/api/cards/${card.cardId}`, 'PATCH', patch); toast('已保存'); await reload();
    });
  });

  // Devices
  const devices = card.devices.length ? card.devices.map((device, i) => h('div', { class: 'device' },
    h('div', { class: 'truncate' }, h('span', { class: 'code-chip', title: device.machineFingerprint }, shortFingerprint(device.machineFingerprint), copyButton(device.machineFingerprint, '复制机器码', '机器码已复制'))),
    h('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', title: '释放这台设备占用的名额', onclick: () => confirm({
      title: '释放设备名额？', confirmText: '释放名额',
      message: `释放「设备 ${i + 1}」后，这张卡可在另一台电脑上激活。`,
      detail: '离线许可证无法撤回：被释放的旧电脑仍可继续使用。仅在确认客户已更换电脑时操作。',
      action: async () => { await api(`/api/cards/${card.cardId}/devices/${device.activationId}/release`, 'POST', { confirmed: true }); toast('已释放设备名额'); await reload(); },
    }) }, icon('unlink'), '释放'),
    h('div', { class: 'meta' }, `首次激活 ${dateTime(device.issuedAt)} · 最近请求 ${relative(device.lastSeenAt || device.issuedAt)}`)))
    : h('p', { class: 'muted small' }, '尚未在任何设备上激活。');

  // Activity
  const activity = h('div', { class: 'timeline' }, h('div', { class: 'skeleton' }));
  api(`/api/activation-log${query({ cardId: card.cardId, limit: 20 })}`).then(log => replace(activity, log.items.length
    ? log.items.map(item => h('div', { class: 'item' }, resultBadge(item.result), h('span', { class: 'truncate mono muted' }, shortFingerprint(item.machineFingerprint)), timeEl(item.at)))
    : h('p', { class: 'muted small' }, '暂无激活请求记录。'))).catch(() => replace(activity, h('p', { class: 'muted small' }, '活动加载失败。')));

  const toggle = h('button', { class: 'btn', type: 'button' }, icon(card.status === 'active' ? 'ban' : 'play'), card.status === 'active' ? '停用' : '恢复');
  toggle.addEventListener('click', () => {
    const run = async () => { await api(`/api/cards/${card.cardId}`, 'PATCH', { status: card.status === 'active' ? 'disabled' : 'active' }); toast(card.status === 'active' ? '已停用' : '已恢复'); await reload(); };
    if (card.status === 'active') confirm({ title: '停用这张卡密？', confirmText: '停用', message: '停用后所有激活请求都会被拒绝，包括已绑定设备的重新激活。可随时恢复。',
      detail: '已签发的离线许可证不受影响。', action: run });
    else busy(toggle, run);
  });
  const remove = h('button', { class: 'btn btn-danger-ghost', type: 'button', onclick: () => confirm({
    title: '永久删除这张卡密？', confirmText: '删除', message: `将删除卡密及 ${card.usedDevices} 条设备记录，此操作不可恢复。`, detail: '已签发的离线许可证不受影响。',
    action: async () => { await api('/api/cards/batch', 'DELETE', { cardIds: [card.cardId], confirmed: true }); toast('已删除'); dialog.close(); changed('cards'); },
  }) }, icon('trash'), '删除');

  replace(dialog,
    h('div', { class: 'drawer-head' },
      h('div', { class: 'row' }, productChip(card.productId), stateBadge(card.state), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '关闭', onclick: () => dialog.close() }, icon('x'))),
      h('h2', null, cardTitle(card)),
      h('div', { class: 'row muted small' }, meter(card.usedDevices, card.maxDevices), '·', card.edition, '·', `创建于 ${dateTime(card.issuedAt)}`)),
    h('div', { class: 'drawer-body' },
      codeSection,
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h3', null, `设备（${card.usedDevices}/${card.maxDevices}）`),
        card.releases ? h('span', { class: 'badge plain neutral', title: '通过「释放」腾出名额的次数' }, `已释放 ${card.releases} 次`) : null), devices),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h3', null, '客户信息')), form),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h3', null, '激活记录'), h('span', { class: 'muted small' }, '最近 20 条')), activity),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h3', null, '详细信息')),
        h('dl', { class: 'kv' },
          h('dt', null, '卡 ID'), h('dd', null, h('span', { class: 'code-chip' }, card.cardId, copyButton(card.cardId, '复制卡 ID'))),
          h('dt', null, '授权版本'), h('dd', null, card.edition),
          h('dt', null, '设备上限'), h('dd', null, `${card.maxDevices} 台`),
          h('dt', null, '批次'), h('dd', null, card.batchId ? h('a', { href: `#/cards?batchId=${card.batchId}`, onclick: () => dialog.close() }, `查看同批卡密（${card.batchId.slice(0, 8)}）`) : '—'),
          h('dt', null, '创建时间'), h('dd', null, dateTime(card.issuedAt)),
          h('dt', null, '最近活跃'), h('dd', null, card.lastSeenAt ? dateTime(card.lastSeenAt) : '—')))),
    h('div', { class: 'drawer-foot' }, toggle, h('span', { class: 'spacer' }), remove));
}
