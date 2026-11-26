import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { detectQuery } from '@workshop/core';
import { addToLibrary, libraryFile, MAX_PDF_BYTES, matchLibrary, readIndex, removeFromLibrary } from './library';
import { lookupByPlate, lookupByVin, providerStatuses } from './lookup';
import { runOcr } from './providers/ocr';
import { HttpError } from './util';

export const app = new Hono();

if (process.env.NODE_ENV !== 'test') app.use('*', logger());
app.use('*', cors());

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  return c.json({ error: err.message || 'Error interno' }, status as 400);
});

app.get('/health', (c) => c.json({ ok: true }));

app.get('/api/providers', (c) => c.json(providerStatuses()));

app.get('/api/vehicle/vin/:vin', async (c) => c.json(await lookupByVin(c.req.param('vin'))));

app.get('/api/vehicle/plate/:plate', async (c) => c.json(await lookupByPlate(c.req.param('plate'))));

/** Búsqueda libre: detecta si es VIN o matrícula. */
app.get('/api/vehicle/search', async (c) => {
  const q = c.req.query('q') ?? '';
  const d = detectQuery(q);
  if (!d) throw new HttpError(400, 'Introduce un VIN de 17 caracteres o una matrícula española');
  return c.json(d.type === 'vin' ? await lookupByVin(d.value) : await lookupByPlate(d.value));
});

app.post(
  '/api/ocr',
  bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: 'Imagen demasiado grande (máx. 8 MB)' }, 413) }),
  async (c) => {
    const body = await c.req.json<{ kind?: string; imageBase64?: string; mime?: string }>();
    if (body.kind !== 'plate' && body.kind !== 'vin') throw new HttpError(400, 'kind debe ser "plate" o "vin"');
    if (!body.imageBase64) throw new HttpError(400, 'Falta imageBase64');
    return c.json(await runOcr(body.kind, body.imageBase64, body.mime));
  },
);

// --- Biblioteca de PDFs propios -------------------------------------------

app.get('/api/library', async (c) => {
  const { vin, make, model } = c.req.query();
  return c.json(vin || make ? await matchLibrary({ vin, make, model }) : await readIndex());
});

app.post(
  '/api/library',
  bodyLimit({ maxSize: MAX_PDF_BYTES + 1024 * 1024, onError: (c) => c.json({ error: 'El PDF supera 50 MB' }, 413) }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new HttpError(400, 'Falta el archivo (campo "file")');
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);
    const item = await addToLibrary({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name || 'documento.pdf',
      title: str('title'),
      kind: str('kind'),
      scope: str('scope'),
      vin: str('vin'),
      make: str('make'),
      model: str('model'),
    });
    return c.json(item, 201);
  },
);

app.get('/api/library/:id/file', async (c) => {
  const { bytes, item } = await libraryFile(c.req.param('id'));
  const safeName = item.filename.replace(/[^\w.\- ]+/g, '_');
  return c.body(new Uint8Array(bytes), 200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${safeName}"`,
    'cache-control': 'private, max-age=3600',
  });
});

app.delete('/api/library/:id', async (c) => {
  await removeFromLibrary(c.req.param('id'));
  return c.json({ ok: true });
});
