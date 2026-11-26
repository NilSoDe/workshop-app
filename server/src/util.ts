import type { SourceResult, SourceStatus } from '@workshop/core';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new HttpError(res.status, `${new URL(url).host} respondió ${res.status}`);
  return (await res.json()) as T;
}

/** Ejecuta una fuente midiendo tiempo y convirtiendo errores en SourceResult. */
export async function runSource<T>(
  provider: string,
  label: string,
  fn: () => Promise<{ status: SourceStatus; data?: T; message?: string }>,
): Promise<{ source: SourceResult; data?: T }> {
  const start = Date.now();
  try {
    const r = await fn();
    return { source: { provider, label, status: r.status, message: r.message, ms: Date.now() - start }, data: r.data };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'Tiempo de espera agotado' : e.message) : String(e);
    return { source: { provider, label, status: 'error', message, ms: Date.now() - start } };
  }
}

export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(
    private ttlMs: number,
    private max = 500,
  ) {}
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.map.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(k, { v, exp: Date.now() + this.ttlMs });
  }
  clear() {
    this.map.clear();
  }
}

export const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};
