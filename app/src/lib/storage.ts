import { kv } from './kv';
import type { VehicleSummary } from '@workshop/core';

const HISTORY_KEY = 'history.v1';
const API_URL_KEY = 'settings.apiUrl';
const MAX_HISTORY = 50;

export interface HistoryEntry {
  /** 'vin' o 'plate' */
  type: 'vin' | 'plate';
  value: string;
  vin?: string;
  plate?: string;
  summary: VehicleSummary;
  at: string;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await kv.get(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addToHistory(entry: HistoryEntry): Promise<void> {
  const list = await getHistory();
  const key = (e: HistoryEntry) => e.vin ?? e.plate ?? e.value;
  const next = [entry, ...list.filter((e) => key(e) !== key(entry))].slice(0, MAX_HISTORY);
  await kv.set(HISTORY_KEY, JSON.stringify(next));
}

export async function clearHistory(): Promise<void> {
  await kv.remove(HISTORY_KEY);
}

export function getApiUrlOverride(): string | null {
  try {
    return kv.getSync(API_URL_KEY);
  } catch {
    return null;
  }
}

export async function setApiUrlOverride(url: string | null): Promise<void> {
  if (url) await kv.set(API_URL_KEY, url.replace(/\/+$/, ''));
  else await kv.remove(API_URL_KEY);
}
