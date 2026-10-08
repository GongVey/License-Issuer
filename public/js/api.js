// Same-origin JSON client. The CSRF token comes from /api/login or /api/session.
let csrf = '';
const listeners = new Set();
export const setCsrf = value => { csrf = value; };
export const onUnauthorized = fn => listeners.add(fn);

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw new ApiError(0, '网络连接失败，请检查服务是否在运行', 'network'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') for (const fn of listeners) fn();
    throw new ApiError(response.status, result.error || `请求失败（${response.status}）`, result.code);
  }
  return result;
}
export const query = params => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
};
