const $ = id => document.getElementById(id);
let csrf = '';
let offset = 0;
let query = '';
let selected = null;
let searchVersion = 0;
let accountSaving = false;

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
  csrf = ''; selected = null; searchVersion++;
  $('office').hidden = true; $('logout').hidden = true; $('login').hidden = false;
  $('detail').close(); $('records').replaceChildren(); $('fields').replaceChildren();
  $('license-code').value = ''; $('note').value = ''; $('machine').value = '';
  $('account-panel').close(); $('open-account').hidden = true; $('issue-panel').hidden = false;
  $('account-form').reset();
}
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: {
    ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
  }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) signedOut();
    throw new Error(result.error || 'Request failed');
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
  $('identity').textContent = `${session.username} / session until ${date(session.expiresAt)}`;
  $('public-key').textContent = session.publicKey;
  $('edition').replaceChildren(...session.editions.map(value => new Option(value, value)));
  $('open-account').hidden = false;
  $('password-required').hidden = !session.mustChangePassword;
  $('license-workspace').hidden = session.mustChangePassword;
  $('account-notice').textContent = session.mustChangePassword ? 'Replace your temporary password before accessing licenses.' : 'Change your username and password here. Saving signs out all sessions.';
  $('issue-panel').hidden = session.mustChangePassword;
  $('account-username').value = session.username;
  if (session.mustChangePassword) openAccount();
  if (!session.mustChangePassword) await list();
}
async function list() {
  const version = ++searchVersion;
  const result = await api(`/api/licenses?q=${encodeURIComponent(query)}&offset=${offset}`);
  if (version !== searchVersion) return;
  $('count').textContent = `${result.total} records`;
  $('records').replaceChildren();
  if (!result.items.length) {
    const empty = document.createElement('p'); empty.className = 'small';
    empty.textContent = 'No licenses found. Issue a license or adjust your search.';
    $('records').append(empty);
  }
  for (const record of result.items) {
    const button = document.createElement('button'); button.className = 'record';
    const top = document.createElement('span'); top.className = 'record-top';
    const title = document.createElement('span'); title.className = 'record-title'; title.textContent = record.note || record.licenseId;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = record.status === 'active' ? 'On file' : 'Archived';
    top.append(title, badge);
    const code = document.createElement('code'); code.textContent = record.machineFingerprint;
    const meta = document.createElement('span'); meta.className = 'record-meta'; meta.textContent = `${record.edition} / ${date(record.issuedAt)}`;
    button.append(top, code, meta);
    button.addEventListener('click', () => busy(button, async () => show(await api(`/api/licenses/${record.licenseId}`))));
    $('records').append(button);
  }
  $('previous').disabled = offset === 0; $('next').disabled = offset + 30 >= result.total;
  $('page').textContent = `${result.total ? offset + 1 : 0}-${Math.min(offset + 30, result.total)} / ${result.total}`;
}
function show(record) {
  selected = record;
  $('fields').replaceChildren();
  for (const [label, value] of [['License ID', record.licenseId], ['Machine', record.machineFingerprint], ['Edition', record.edition], ['Issued', `${date(record.issuedAt)} (${record.issuedAt} ms)`], ['Note', record.note || '(none)'], ['Local status', record.status === 'active' ? 'On file' : 'Archived']]) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value; $('fields').append(dt, dd);
  }
  $('license-code').value = record.code;
  $('archive').textContent = record.status === 'active' ? 'Archive locally' : 'Restore to register';
  $('copy-code').textContent = 'Copy license code';
  if (!$('detail').open) $('detail').showModal();
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const password = $('password').value; $('password').value = '';
    await api('/api/login', 'POST', { username: $('username').value, password });
    offset = 0; query = ''; $('search').value = '';
    await restore(); message('Signed in.');
  });
});
$('issue-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const record = await api('/api/licenses', 'POST', { machineFingerprint: $('machine').value.trim(), edition: $('edition').value, note: $('note').value });
    $('machine').value = ''; $('note').value = '';
    show(record); message('License signed and saved.'); offset = 0; query = ''; $('search').value = ''; await list();
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
$('logout').addEventListener('click', () => busy($('logout'), async () => { await api('/api/logout', 'POST', {}); signedOut(); message('Signed out.'); }));
$('search-form').addEventListener('submit', event => { event.preventDefault(); offset = 0; query = $('search').value; busy(event.submitter, list); });
for (const [id, delta] of [['previous', -30], ['next', 30]]) $(id).addEventListener('click', async () => {
  offset = Math.max(0, offset + delta);
  $('previous').disabled = true; $('next').disabled = true;
  try { await list(); } catch (error) { message(error.message, true); }
});
$('close-detail').addEventListener('click', () => $('detail').close());
$('copy-code').addEventListener('click', () => busy($('copy-code'), async () => {
  try { await navigator.clipboard.writeText($('license-code').value); $('copy-code').textContent = 'Copied'; }
  catch { $('license-code').focus(); $('license-code').select(); $('copy-code').textContent = 'Select & copy manually'; }
}));
$('archive').addEventListener('click', () => busy($('archive'), async () => {
  const record = await api(`/api/licenses/${selected.licenseId}`, 'PATCH', { status: selected.status === 'active' ? 'archived' : 'active' });
  show(record); await list();
}));
restore().catch(error => { if (error.message !== 'Please sign in') message(error.message, true); });
