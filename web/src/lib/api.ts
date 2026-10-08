// Same-origin JSON client. The CSRF token comes from /api/login or /api/session.
let csrf = '';
let onUnauthorized: (() => void) | null = null;
export const setCsrf = (value: string) => { csrf = value; };
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw new ApiError(0, '网络连接失败，请检查服务是否在运行', 'network'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') onUnauthorized?.();
    throw new ApiError(response.status, result.error || `请求失败（${response.status}）`, result.code);
  }
  return result as T;
}
export function qs(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}
