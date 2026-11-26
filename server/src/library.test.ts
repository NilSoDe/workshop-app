import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem, VehicleReport } from '@workshop/core';
import { app } from './app';
import { reportCache } from './lookup';

let dir: string;
const PDF = new TextEncoder().encode('%PDF-1.4\n% prueba\n%%EOF');

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lib-'));
  process.env.LIBRARY_DIR = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
beforeEach(() => {
  reportCache.clear();
  // sin red: NHTSA "falla" y el informe sale igual
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
});

async function upload(fields: Record<string, string>, bytes: Uint8Array<ArrayBuffer> = PDF, name = 'esquema.pdf') {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type: 'application/pdf' }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return app.request('/api/library', { method: 'POST', body: form });
}

describe('biblioteca de PDFs', () => {
  it('sube, vincula por plataforma y aparece en cualquier VIN de esa plataforma', async () => {
    const res = await upload({ title: 'Esquema confort León', kind: 'esquema_electrico', scope: 'platform', vin: 'VSSZZZ5FZKR123456' });
    expect(res.status).toBe(201);
    const item = (await res.json()) as LibraryItem;
    expect(item.platformKey).toBe('VAG:5F');

    // otro León III (otro VIN, misma plataforma)
    const r = (await (await app.request('/api/vehicle/vin/VSSZZZ5FZJR999999')).json()) as VehicleReport;
    const mine = r.documents.find((d) => d.libraryId === item.id);
    expect(mine).toMatchObject({ trust: 'propio', kind: 'esquema_electrico', url: `/api/library/${item.id}/file` });

    // un Ibiza (plataforma KJ) no lo ve
    const other = (await (await app.request('/api/vehicle/vin/VSSZZZKJZKR123456')).json()) as VehicleReport;
    expect(other.documents.some((d) => d.libraryId === item.id)).toBe(false);

    // se descarga
    const file = await app.request(`/api/library/${item.id}/file`);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
  });

  it('vincula por VIN exacto y por modelo (sin tildes ni mayúsculas)', async () => {
    const byVin = (await (await upload({ kind: 'manual_taller', scope: 'vin', vin: 'WVWZZZ1KZ8W123456' })).json()) as LibraryItem;
    const byModel = (await (await upload({ kind: 'mantenimiento', scope: 'model', make: 'SEAT', model: 'León' })).json()) as LibraryItem;
    const list = (await (await app.request('/api/library?vin=WVWZZZ1KZ8W123456')).json()) as LibraryItem[];
    expect(list.map((i) => i.id)).toContain(byVin.id);
    const leon = (await (await app.request('/api/library?make=seat&model=LEON')).json()) as LibraryItem[];
    expect(leon.map((i) => i.id)).toContain(byModel.id);
  });

  it('rechaza lo que no es PDF y scopes inválidos', async () => {
    expect((await upload({ scope: 'make', make: 'SEAT' }, new TextEncoder().encode('hola'))).status).toBe(400);
    expect((await upload({ scope: 'todo', make: 'SEAT' })).status).toBe(400);
    expect((await upload({ scope: 'platform', vin: 'VF1RFB00X12345678' })).status).toBe(400);
  });

  it('borra', async () => {
    const item = (await (await upload({ scope: 'make', make: 'Renault' })).json()) as LibraryItem;
    expect((await app.request(`/api/library/${item.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/library/${item.id}/file`)).status).toBe(404);
    expect((await app.request('/api/library/../../etc/passwd/file')).status).toBe(404);
    expect((await app.request('/api/library/no-es-un-id', { method: 'DELETE' })).status).toBe(400);
  });
});
