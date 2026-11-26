/**
 * Biblioteca de PDFs propios: manuales y esquemas que ya tienes (comprados en un
 * portal oficial, del concesionario, etc.). Se guardan en disco y se vinculan a:
 *   - un VIN concreto
 *   - una plataforma (p. ej. todos los SEAT 5F)
 *   - un modelo (marca + modelo)
 *   - una marca entera
 * Cuando consultas un vehículo, aparecen todos los que le aplican.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  decodeVinLocal,
  type DocumentKind,
  type LibraryItem,
  type LibraryScope,
  type VehicleDocument,
} from '@workshop/core';
import { HttpError } from './util';

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

const KINDS: DocumentKind[] = [
  'esquema_electrico',
  'manual_taller',
  'mantenimiento',
  'boletin_tecnico',
  'manual_usuario',
  'ficha_rescate',
  'informe_oficial',
  'recambios',
  'otro',
];
const SCOPES: LibraryScope[] = ['vin', 'platform', 'model', 'make'];
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function libraryDir() {
  return path.resolve(process.env.LIBRARY_DIR ?? path.join(process.cwd(), 'data', 'library'));
}
const indexPath = () => path.join(libraryDir(), 'index.json');
const filePath = (id: string) => path.join(libraryDir(), `${id}.pdf`);

/** "SEAT / CUPRA" → "seat"; " León " → "leon" (sin tildes) */
export function norm(s?: string): string | undefined {
  const v = s
    ?.split(' / ')[0]
    .replace(/\s*\(.*\)\s*/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return v || undefined;
}

let queue: Promise<unknown> = Promise.resolve();
/** Serializa escrituras del índice */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export async function readIndex(): Promise<LibraryItem[]> {
  try {
    return JSON.parse(await readFile(indexPath(), 'utf8')) as LibraryItem[];
  } catch {
    return [];
  }
}

async function writeIndex(items: LibraryItem[]) {
  await mkdir(libraryDir(), { recursive: true });
  const tmp = `${indexPath()}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2));
  await rename(tmp, indexPath());
}

export interface AddInput {
  bytes: Uint8Array;
  filename: string;
  title?: string;
  kind?: string;
  scope?: string;
  vin?: string;
  make?: string;
  model?: string;
}

export async function addToLibrary(input: AddInput): Promise<LibraryItem> {
  if (input.bytes.byteLength > MAX_PDF_BYTES) throw new HttpError(413, 'El PDF supera 50 MB');
  const head = new TextDecoder().decode(input.bytes.slice(0, 5));
  if (head !== '%PDF-') throw new HttpError(400, 'El archivo no es un PDF');

  const kind = (KINDS.includes(input.kind as DocumentKind) ? input.kind : 'otro') as DocumentKind;
  const scope = input.scope as LibraryScope;
  if (!SCOPES.includes(scope)) throw new HttpError(400, 'scope debe ser vin, platform, model o make');

  const vinInfo = input.vin ? decodeVinLocal(input.vin) : undefined;
  const item: LibraryItem = {
    id: randomUUID(),
    title: (input.title?.trim() || input.filename.replace(/\.pdf$/i, '')).slice(0, 200),
    kind,
    scope,
    filename: input.filename.slice(0, 200),
    size: input.bytes.byteLength,
    uploadedAt: new Date().toISOString(),
  };

  if (scope === 'vin') {
    if (!vinInfo?.vin || vinInfo.vin.length !== 17) throw new HttpError(400, 'Para vincular a un VIN hace falta un VIN válido');
    item.vin = vinInfo.vin;
  }
  if (scope === 'platform') {
    if (!vinInfo?.platform) throw new HttpError(400, 'Este VIN no tiene código de plataforma reconocible');
    item.platformKey = `${vinInfo.platform.scheme}:${vinInfo.platform.code}`;
  }
  if (scope === 'model' || scope === 'make') {
    item.make = norm(input.make);
    if (!item.make) throw new HttpError(400, 'Falta la marca');
  }
  if (scope === 'model') {
    item.model = norm(input.model);
    if (!item.model) throw new HttpError(400, 'Falta el modelo');
  }
  // Descriptivo, para listar: guarda también lo que se sepa
  item.make ??= norm(input.make ?? vinInfo?.manufacturer);
  item.model ??= norm(input.model);

  await mkdir(libraryDir(), { recursive: true });
  await writeFile(filePath(item.id), input.bytes);
  await exclusive(async () => writeIndex([...(await readIndex()), item]));
  return item;
}

export async function removeFromLibrary(id: string): Promise<void> {
  if (!ID_RE.test(id)) throw new HttpError(400, 'id no válido');
  const found = await exclusive(async () => {
    const items = await readIndex();
    const next = items.filter((i) => i.id !== id);
    if (next.length === items.length) return false;
    await writeIndex(next);
    return true;
  });
  if (!found) throw new HttpError(404, 'No existe');
  await rm(filePath(id), { force: true });
}

export async function libraryFile(id: string): Promise<{ bytes: Buffer; item: LibraryItem }> {
  if (!ID_RE.test(id)) throw new HttpError(400, 'id no válido');
  const item = (await readIndex()).find((i) => i.id === id);
  if (!item) throw new HttpError(404, 'No existe');
  await stat(filePath(id)).catch(() => {
    throw new HttpError(404, 'Archivo no encontrado');
  });
  return { bytes: await readFile(filePath(id)), item };
}

/** Qué PDFs aplican a este vehículo, del más específico al más general. */
export async function matchLibrary(q: { vin?: string; make?: string; model?: string }): Promise<LibraryItem[]> {
  const items = await readIndex();
  const vinInfo = q.vin ? decodeVinLocal(q.vin) : undefined;
  const platformKey = vinInfo?.platform ? `${vinInfo.platform.scheme}:${vinInfo.platform.code}` : undefined;
  const make = norm(q.make ?? vinInfo?.manufacturer);
  const model = norm(q.model);
  const rank: Record<LibraryScope, number> = { vin: 0, platform: 1, model: 2, make: 3 };
  return items
    .filter((i) => {
      switch (i.scope) {
        case 'vin':
          return !!vinInfo && i.vin === vinInfo.vin;
        case 'platform':
          return !!platformKey && i.platformKey === platformKey;
        case 'model':
          return !!make && !!model && i.make === make && i.model === model;
        case 'make':
          return !!make && i.make === make;
      }
    })
    .sort((a, b) => rank[a.scope] - rank[b.scope] || b.uploadedAt.localeCompare(a.uploadedAt));
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const SCOPE_LABEL: Record<LibraryScope, string> = {
  vin: 'este VIN',
  platform: 'esta plataforma',
  model: 'este modelo',
  make: 'esta marca',
};

export function libraryToDocuments(items: LibraryItem[]): VehicleDocument[] {
  return items.map((i, idx) => ({
    title: i.title,
    kind: i.kind,
    url: `/api/library/${i.id}/file`,
    source: 'Tu biblioteca',
    trust: 'propio',
    note: `PDF propio · vinculado a ${SCOPE_LABEL[i.scope]} · ${formatSize(i.size)}`,
    priority: -10 + idx,
    libraryId: i.id,
    libraryScope: i.scope,
  }));
}
