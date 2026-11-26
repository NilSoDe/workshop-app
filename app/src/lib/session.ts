import { useSyncExternalStore } from 'react';
import { kv } from './kv';

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}
export interface Session {
  token: string;
  user: SessionUser;
}

const KEY = 'session.v1';

function load(): Session | null {
  try {
    const raw = kv.getSync(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let current: Session | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getSession = () => current;
export const getToken = () => current?.token ?? null;

export async function setSession(s: Session): Promise<void> {
  current = s;
  emit();
  await kv.set(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  if (!current) return;
  current = null;
  emit();
  await kv.remove(KEY);
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
