const $ = id => document.getElementById(id);
let csrf = '';
let offset = 0;
let query = '';
let productFilter = '';
let statusFilter = '';
let selected = null;
let searchVersion = 0;
let accountSaving = false;
let deleting = false;
let pendingDelete = [];
let pageCards = [];
const checked = new Set();

function openAccount() {
  $('account-error').hidden = true;
  if (!$('account-panel').open) $('account-panel').showModal();
  $('account-current').focus();
}
function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : 'success';
}
function signedOut() {
  csrf = ''; selected = null; searchVersion++; checked.clear(); pageCards = []; pendingDelete = [];
  $('office').hidden = true; $('logout').hidden = true; $('login').hidden = false;
  for (const id of ['detail', 'generated', 'delete-confirm', 'account-panel']) $(id).close();
  $('generated-codes').value = ''; $('note').value = '';
  $('records').replaceChildren(); $('fields').replaceChildren();
  $('open-account').hidden = true; $('account-form').reset();
}
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: {
    ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
  }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) signedOut();
    throw new Error(result.error || '请求失败');
  }
  return result;
}
async function busy(button, fn) {
  button.disabled = true;
  try { await fn(); } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}
function date(value) { return new Date(value).toLocaleString(); }
async function restore() {
  const session = await api('/api/session');
  csrf = session.csrf;
  $('login').hidden = true; $('office').hidden = false; $('logout').hidden = false;
  $('identity').textContent = `${session.username} / 会话有效至 ${date(session.expiresAt)}`;
  $('public-key').textContent = session.publicKey;
   $('product').replaceChildren(...session.products.map(value => new Option(value, value)));
   $('product-filter').replaceChildren(new Option('全部产品', ''), ...session.products.map(value => new Option(value, value)));
  $('edition').replaceChildren(...session.editions.map(value => new Option(value, value)));
  $('open-account').hidden = false;
  $('password-required').hidden = !session.mustChangePassword;
  $('license-workspace').hidden = session.mustChangePassword;
  $('account-notice').textContent = session.mustChangePassword ? '请先修改初始密码。' : '修改账号后，所有会话将退出，请重新登录。';
  $('account-username').value = session.username;
  if (session.mustChangePassword) openAccount();
   else await refreshDashboard();
}
async function refreshDashboard() {
  const summary = await api('/api/dashboard');
  $('summary-total').textContent = summary.totals.total;
  $('summary-active').textContent = summary.totals.active;
  $('summary-disabled').textContent = summary.totals.disabled;
  $('summary-activations').textContent = summary.totals.activations;
  const container = $('recent-cards'); container.replaceChildren();
  if (!summary.recent.length) { container.textContent = '暂无卡密记录。'; return; }
  for (const record of summary.recent) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'recent-item';
    const title = document.createElement('strong'); title.textContent = record.note || record.cardId;
    const meta = document.createElement('span'); meta.textContent = `${record.productId} / ${record.edition} / ${date(record.issuedAt)}`;
    const badge = document.createElement('em'); badge.textContent = record.status === 'active' ? '可激活' : '已停用';
    item.append(title, meta, badge); item.addEventListener('click', () => busy(item, async () => show(await api(`/api/cards/${record.cardId}`)))); container.append(item);
  }
  await list();
}
function selectionState() {
  $('selection-count').textContent = `已选 ${checked.size} 张`;
  $('delete-selected').disabled = checked.size === 0 || deleting;
  $('select-all').disabled = pageCards.length === 0;
  $('select-all').checked = pageCards.length > 0 && checked.size === pageCards.length;
  $('select-all').indeterminate = checked.size > 0 && checked.size < pageCards.length;
}
async function list() {
  const version = ++searchVersion;
  checked.clear(); pageCards = []; selectionState();
  $('records').replaceChildren();
  $('previous').disabled = true; $('next').disabled = true;
  const result = await api(`/api/cards?q=${encodeURIComponent(query)}&productId=${encodeURIComponent(productFilter)}&status=${encodeURIComponent(statusFilter)}&offset=${offset}`);
  if (version !== searchVersion) return;
  if (offset > 0 && offset >= result.total) {
    offset = Math.max(0, Math.floor((result.total - 1) / 30) * 30);
    return list();
  }
  pageCards = result.items;
  $('count').textContent = `${result.total} 张`;
  if (!pageCards.length) {
    const empty = document.createElement('p'); empty.className = 'small';
    empty.textContent = '暂无卡密，请生成卡密或调整搜索条件。'; $('records').append(empty);
  }
  for (const record of pageCards) {
    const row = document.createElement('div'); row.className = 'card-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.cardId = record.cardId;
    checkbox.setAttribute('aria-label', `选择卡密 ${record.cardId}`);
    checkbox.addEventListener('change', () => { checkbox.checked ? checked.add(record.cardId) : checked.delete(record.cardId); selectionState(); });
    const button = document.createElement('button'); button.className = 'record';
    const top = document.createElement('span'); top.className = 'record-top';
    const title = document.createElement('span'); title.className = 'record-title'; title.textContent = record.note || record.cardId;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = record.status === 'active' ? '可激活' : '已停用';
    top.append(title, badge);
    const code = document.createElement('code'); code.textContent = `${record.productId} / 已激活 ${record.usedDevices} 台，上限 ${record.maxDevices} 台`;
    const meta = document.createElement('span'); meta.className = 'record-meta'; meta.textContent = `${record.edition} / ${date(record.issuedAt)}`;
    button.append(top, code, meta);
    button.addEventListener('click', () => busy(button, async () => show(await api(`/api/cards/${record.cardId}`))));
    row.append(checkbox, button); $('records').append(row);
  }
  selectionState();
  $('previous').disabled = offset === 0; $('next').disabled = offset + 30 >= result.total;
  $('page').textContent = `${result.total ? offset + 1 : 0}–${Math.min(offset + 30, result.total)} / ${result.total}`;
}
function show(record) {
  selected = record; $('fields').replaceChildren();
  for (const [label, value] of [['卡密 ID', record.cardId], ['产品', record.productId], ['设备', `${record.usedDevices} / ${record.maxDevices}`], ['版本', record.edition], ['创建时间', date(record.issuedAt)], ['备注', record.note || '无'], ['状态', record.status === 'active' ? '可激活' : '已停用'], ...record.devices.map((device, i) => [`设备 ${i + 1}`, `${device.machineFingerprint} / ${date(device.issuedAt)}`])]) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value; $('fields').append(dt, dd);
  }
  $('archive').textContent = record.status === 'active' ? '停用卡密' : '恢复卡密';
  if (!$('detail').open) $('detail').showModal();
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault(); busy(event.submitter, async () => {
    const password = $('password').value; $('password').value = '';
    await api('/api/login', 'POST', { username: $('username').value, password });
     offset = 0; query = ''; productFilter = ''; statusFilter = ''; $('search').value = ''; await restore(); message('登录成功。');
  });
});
$('issue-form').addEventListener('submit', event => {
  event.preventDefault(); busy(event.submitter, async () => {
    const input = { productId: $('product').value, edition: $('edition').value, maxDevices: Number($('max-devices').value), quantity: Number($('quantity').value), note: $('note').value };
    const result = await api('/api/cards/batch', 'POST', input);
    $('generated-title').textContent = `已生成 ${result.total} 张卡密`;
    $('generated-codes').value = result.items.map(card => card.cardCode).join('\n');
    $('generated-status').textContent = `${input.productId} / ${input.edition} / 每卡 ${input.maxDevices} 台设备`;
    $('generated').showModal(); message('生成成功，请保存本批卡密。');
     offset = 0; query = ''; productFilter = ''; statusFilter = ''; $('search').value = ''; $('product-filter').value = ''; $('status-filter').value = ''; await refreshDashboard();
  });
});
$('account-form').addEventListener('submit', event => {
  event.preventDefault();
  if (accountSaving) return;
  const button = event.submitter;
  accountSaving = true; button.disabled = true; $('close-account').disabled = true;
  $('account-error').hidden = true;
  (async () => {
    try {
    if ($('account-password').value !== $('account-confirm').value) throw new Error('New passwords do not match');
    const username = $('account-username').value;
    await api('/api/account', 'PATCH', { currentPassword: $('account-current').value, username, newPassword: $('account-password').value });
    signedOut(); $('username').value = username; $('account-current').value = ''; $('account-password').value = ''; $('account-confirm').value = ''; message('Credentials changed. Sign in again.');
    } catch (error) {
      $('account-error').textContent = error.message;
      $('account-error').hidden = false;
    } finally {
      accountSaving = false; button.disabled = false; $('close-account').disabled = false;
    }
  })();
});
$('open-account').addEventListener('click', openAccount);
$('close-account').addEventListener('click', () => { if (!accountSaving) $('account-panel').close(); });
$('account-panel').addEventListener('cancel', event => { if (accountSaving) event.preventDefault(); });
$('account-panel').addEventListener('close', () => {
  for (const id of ['account-current', 'account-password', 'account-confirm']) $(id).value = '';
  if (!$('open-account').hidden) $('open-account').focus();
});
$('logout').addEventListener('click', () => busy($('logout'), async () => { await api('/api/logout', 'POST', {}); signedOut(); message('已退出登录。'); }));
 $('search-form').addEventListener('submit', event => { event.preventDefault(); offset = 0; query = $('search').value; productFilter = $('product-filter').value; statusFilter = $('status-filter').value; busy(event.submitter, list); });
 for (const id of ['product-filter', 'status-filter']) $(id).addEventListener('change', () => { offset = 0; productFilter = $('product-filter').value; statusFilter = $('status-filter').value; busy($(id), list); });
 $('refresh-dashboard').addEventListener('click', () => busy($('refresh-dashboard'), refreshDashboard));
for (const [id, delta] of [['previous', -30], ['next', 30]]) $(id).addEventListener('click', async () => {
  offset = Math.max(0, offset + delta);
  try { await list(); } catch (error) { message(error.message, true); }
});
$('close-detail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => { selected = null; });
$('archive').addEventListener('click', () => busy($('archive'), async () => {
  const current = selected;
  if (!current) return;
  const record = await api(`/api/cards/${current.cardId}`, 'PATCH', { status: current.status === 'active' ? 'disabled' : 'active' });
  if (selected === current && $('detail').open) show(record);
   await refreshDashboard();
}));
$('close-generated').addEventListener('click', () => $('generated').close());
$('generated').addEventListener('close', () => { $('generated-codes').value = ''; });
$('copy-generated').addEventListener('click', () => busy($('copy-generated'), async () => {
  try { await navigator.clipboard.writeText($('generated-codes').value); $('generated-status').textContent = '已复制全部卡密。'; }
  catch { $('generated-codes').focus(); $('generated-codes').select(); $('generated-status').textContent = '请手动复制选中的卡密。'; }
}));
$('download-generated').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('generated-codes').value + '\n'], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `cards-${Date.now()}.txt`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('generated-status').textContent = '已发起下载，请确认文件已保存。';
});
$('select-all').addEventListener('change', () => {
  for (const checkbox of $('records').querySelectorAll('input[type="checkbox"]')) {
    checkbox.checked = $('select-all').checked;
    checkbox.checked ? checked.add(checkbox.dataset.cardId) : checked.delete(checkbox.dataset.cardId);
  }
  selectionState();
});
$('delete-selected').addEventListener('click', () => {
  if (!checked.size || deleting) return;
  pendingDelete = [...checked];
  const used = pageCards.filter(card => checked.has(card.cardId)).reduce((sum, card) => sum + card.usedDevices, 0);
  $('delete-description').textContent = `即将永久删除所选 ${pendingDelete.length} 张卡密及 ${used} 条设备激活记录。是否继续？`;
  $('delete-error').hidden = true; $('delete-confirm').showModal(); $('cancel-delete').focus();
});
$('cancel-delete').addEventListener('click', () => { if (!deleting) $('delete-confirm').close(); });
$('delete-confirm').addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
$('delete-confirm').addEventListener('close', () => { pendingDelete = []; });
$('confirm-delete').addEventListener('click', async () => {
  if (deleting || !pendingDelete.length) return;
  deleting = true; $('confirm-delete').disabled = true; $('cancel-delete').disabled = true;
  try {
    const result = await api('/api/cards/batch', 'DELETE', { cardIds: [...pendingDelete], confirmed: true });
     $('delete-confirm').close(); message(`已删除 ${result.deleted} 张卡密。`);
     await refreshDashboard();
  } catch (error) {
    if ($('delete-confirm').open) { $('delete-error').textContent = error.message; $('delete-error').hidden = false; }
    else message(error.message, true);
  } finally {
    deleting = false; $('confirm-delete').disabled = false; $('cancel-delete').disabled = false; selectionState();
  }
});
restore().catch(error => { if (error.message !== 'Please sign in') message(error.message, true); });
