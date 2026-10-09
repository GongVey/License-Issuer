import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './controls';

// Keeps a failing page from blanking the whole console: the shell stays usable and the error is shown with a way out.
// `resetKey` (the route) clears the error when the user navigates elsewhere.
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto grid max-w-md justify-items-center gap-2 py-24 text-center">
        <span className="mb-2 grid size-11 place-items-center rounded-xl bg-danger-soft text-danger"><AlertTriangle className="size-5" /></span>
        <p className="text-base font-semibold">页面加载出错</p>
        <p className="text-[13px] leading-relaxed text-muted">可能是后台刚刚更新过。重新加载页面通常可以解决；若仍出错，请确认服务端已重启到最新版本。</p>
        <p className="mt-1 max-w-full truncate font-mono text-xs text-muted">{this.state.error.message}</p>
        <Button variant="primary" className="mt-4" icon={<RotateCw />} onClick={() => location.reload()}>重新加载</Button>
      </div>
    );
  }
}

// A lazy page whose chunk can go stale after a redeploy (old index, new file names). The first failure reloads the
// page once to pick up the new build; a second failure surfaces to the error boundary instead of looping.
export function lazyPage<T>(load: () => Promise<T>): () => Promise<T> {
  const flag = 'chunk-reload';
  return () => load().then(module => { try { sessionStorage.removeItem(flag); } catch { /* storage unavailable */ } return module; }, error => {
    let reloaded = true;
    try { reloaded = sessionStorage.getItem(flag) === '1'; if (!reloaded) sessionStorage.setItem(flag, '1'); } catch { /* storage unavailable */ }
    if (!reloaded) { location.reload(); return new Promise<T>(() => {}); }
    throw error;
  });
}
