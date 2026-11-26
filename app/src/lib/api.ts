import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { LibraryItem, OcrResponse, ProviderStatus, VehicleReport } from '@workshop/core';
import { clearSession, getToken, type Session } from './session';
import { getApiUrlOverride } from './storage';

const API_PORT = 8787;

/**
 * URL del API, por orden:
 *  1. La configurada en Ajustes
 *  2. EXPO_PUBLIC_API_URL
 *  3. En desarrollo: misma IP que el servidor de Expo (el móvil ya la alcanza) + puerto 8787
 *  4. localhost
 */
export function getApiUrl(): string {
  const override = getApiUrlOverride();
  if (override) return override;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = `${getApiUrl()}${path}`;
  let res: Response;
  try {
    const token = getToken();
    const headers = new Headers(init?.headers);
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
    res = await fetch(url, { ...init, headers, signal: ctrl.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'El servidor ha tardado demasiado en responder.'
        : `No se puede conectar con el servidor (${getApiUrl()}). Revisa la URL en Ajustes.`,
    );
  } finally {
    clearTimeout(t);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && getToken() && !path.startsWith('/api/auth/login')) {
    await clearSession(); // sesión caducada: vuelve a la pantalla de login
  }
  if (!res.ok) throw new ApiError(body.error ?? `Error ${res.status}`, res.status);
  return body as T;
}

/** Las URLs relativas (PDFs de la biblioteca) apuntan al propio servidor. */
export function resolveUrl(url: string): string {
  if (!url.startsWith('/')) return url;
  // Los PDFs se abren en el navegador, que no puede mandar cabeceras: el token va en la URL.
  const token = getToken();
  const sep = url.includes('?') ? '&' : '?';
  return `${getApiUrl()}${url}${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;
}

export const api = {
  login: (email: string, password: string) =>
    request<Session>('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name?: string) =>
    request<Session>('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),
  byVin: (vin: string) => request<VehicleReport>(`/api/vehicle/vin/${encodeURIComponent(vin)}`),
  byPlate: (plate: string) => request<VehicleReport>(`/api/vehicle/plate/${encodeURIComponent(plate)}`),
  providers: () => request<ProviderStatus[]>('/api/providers', undefined, 8_000),
  health: () => request<{ ok: boolean }>('/health', undefined, 5_000),
  uploadPdf: (form: FormData) =>
    request<LibraryItem>('/api/library', { method: 'POST', body: form }, 120_000),
  deletePdf: (id: string) => request<{ ok: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
  ocr: (kind: 'plate' | 'vin', imageBase64: string) =>
    request<OcrResponse>(
      '/api/ocr',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, imageBase64, mime: 'image/jpeg' }),
      },
      45_000,
    ),
};
