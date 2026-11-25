import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrResponse, VehicleReport } from '@workshop/core';
import { app } from './app';
import { reportCache } from './lookup';
import { parseRegcheckXml } from './providers/regcheck';

const vpicRow = (o: Record<string, string>) => ({ Results: [{ ErrorCode: '0', ...o }] });

function mockFetch(routes: Array<[RegExp, (url: string, init?: RequestInit) => unknown]>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const [re, handler] of routes) {
      if (re.test(url)) {
        const body = handler(url, init);
        return typeof body === 'string' ? new Response(body) : Response.json(body);
      }
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  reportCache.clear();
  for (const k of ['OCRSPACE_API_KEY', 'PLATE_RECOGNIZER_TOKEN', 'REGCHECK_USERNAME']) delete process.env[k];
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/vehicle/vin/:vin', () => {
  it('combina decodificación local + NHTSA y genera enlaces de documentación', async () => {
    mockFetch([
      [/vpic\.nhtsa/, () => vpicRow({ Make: 'SEAT', Model: 'Leon', ModelYear: '2019', DisplacementL: '1.5', EngineModel: 'DADA', FuelTypePrimary: 'Gasoline' })],
    ]);
    const res = await app.request('/api/vehicle/vin/VSSZZZ5FZKR123456');
    expect(res.status).toBe(200);
    const r = (await res.json()) as VehicleReport;
    expect(r.summary).toMatchObject({ make: 'SEAT', model: 'Leon', year: 2019, engineCode: 'DADA' });
    expect(r.vin?.country).toBe('España');
    expect(r.specs.map((s) => s.id)).toEqual(expect.arrayContaining(['nhtsa-identificacion', 'nhtsa-motor', 'vin']));
    // esquemas: portal oficial de la marca (erWin SEAT) con el VIN para copiar, y búsquedas con la plataforma 5F
    const wiring = r.documents.filter((d) => d.kind === 'esquema_electrico');
    expect(wiring[0]).toMatchObject({ trust: 'oficial', copyValue: 'VSSZZZ5FZKR123456' });
    expect(wiring[0].url).toContain('erwin.seat.com');
    expect(wiring.some((d) => decodeURIComponent(d.url).includes('León III 5F') && decodeURIComponent(d.url).includes('Stromlaufplan'))).toBe(true);
    expect(wiring.some((d) => d.title.includes('DADA'))).toBe(true);
    expect(r.summary.platform).toBe('5F (León III)');
    // recalls de EE. UU. no aplican a un VIN europeo
    expect(r.sources.find((s) => s.provider === 'nhtsa-recalls')?.status).toBe('skipped');
    // los proveedores con licencia aparecen como "no configurado"
    expect(r.sources.find((s) => s.provider === 'haynespro')?.status).toBe('not_configured');
  });

  it('consulta recalls para VIN norteamericano', async () => {
    mockFetch([
      [/vpic\.nhtsa/, () => vpicRow({ Make: 'FORD', Model: 'Focus', ModelYear: '2014' })],
      [/recallsByVehicle/, () => ({ results: [{ NHTSACampaignNumber: '14V123000', Summary: 'Fallo X', Component: 'AIR BAGS' }] })],
    ]);
    const res = await app.request('/api/vehicle/vin/1M8GDM9AXKP042788');
    const r = (await res.json()) as VehicleReport;
    expect(r.recalls).toHaveLength(1);
    expect(r.recalls[0].id).toBe('14V123000');
  });

  it('sigue respondiendo si NHTSA falla', async () => {
    mockFetch([[/vpic\.nhtsa/, () => { throw new Error('boom'); }]]);
    const res = await app.request('/api/vehicle/vin/WVWZZZ1KZ8W123456');
    expect(res.status).toBe(200);
    const r = (await res.json()) as VehicleReport;
    expect(r.summary.make).toBe('Volkswagen');
    expect(r.sources.find((s) => s.provider === 'nhtsa')?.status).toBe('error');
  });

  it('400 si el VIN es inválido', async () => {
    const res = await app.request('/api/vehicle/vin/ABC');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/vehicle/plate/:plate', () => {
  it('sin proveedor configurado devuelve ficha parcial con aviso', async () => {
    mockFetch([]);
    const res = await app.request('/api/vehicle/plate/1234-BCD');
    const r = (await res.json()) as VehicleReport;
    expect(r.plate?.display).toBe('1234 BCD');
    expect(r.sources[0].status).toBe('not_configured');
    expect(r.warnings[0]).toMatch(/escanea el VIN/);
    // sin VIN no hay esquemas, pero sí el buscador de Castrol con la matrícula para copiar
    expect(r.documents.some((d) => d.kind === 'esquema_electrico')).toBe(false);
    expect(r.documents.find((d) => d.source === 'Castrol')).toMatchObject({ copyValue: '1234BCD' });
  });

  it('con RegCheck obtiene el VIN y encadena la búsqueda por VIN', async () => {
    process.env.REGCHECK_USERNAME = 'demo';
    const json = JSON.stringify({
      Description: 'SEAT LEON',
      CarMake: { CurrentTextValue: 'SEAT' },
      CarModel: { CurrentTextValue: 'LEON' },
      RegistrationYear: '2019',
      VehicleIdentificationNumber: 'VSSZZZ5FZKR123456',
      KType: '12345',
    }).replace(/"/g, '&quot;');
    mockFetch([
      [/regcheck/, () => `<?xml version="1.0"?><Vehicle><vehicleJson>${json}</vehicleJson></Vehicle>`],
      [/vpic\.nhtsa/, () => vpicRow({ Make: 'SEAT', Model: 'Leon', ModelYear: '2019' })],
    ]);
    const res = await app.request('/api/vehicle/plate/1234BCD');
    const r = (await res.json()) as VehicleReport;
    expect(r.query).toEqual({ vin: 'VSSZZZ5FZKR123456', plate: '1234BCD' });
    expect(r.summary).toMatchObject({ make: 'SEAT', model: 'LEON', ktype: '12345' });
    expect(r.specs[0].id).toBe('regcheck');
  });

  it('400 si la matrícula no es española', async () => {
    const res = await app.request('/api/vehicle/plate/AB12CDE');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/vehicle/search', () => {
  it('detecta matrícula', async () => {
    mockFetch([]);
    const res = await app.request('/api/vehicle/search?q=9876%20KLM');
    expect(((await res.json()) as VehicleReport).query.plate).toBe('9876KLM');
  });
});

describe('POST /api/ocr', () => {
  it('extrae VIN con OCR.space', async () => {
    process.env.OCRSPACE_API_KEY = 'k';
    const f = mockFetch([[/ocr\.space/, () => ({ ParsedResults: [{ ParsedText: 'VIN WVWZZZ1KZ8W123456' }] })]]);
    const res = await app.request('/api/ocr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'vin', imageBase64: 'AAAA' }),
    });
    const r = (await res.json()) as OcrResponse;
    expect(r.candidates[0]).toBe('WVWZZZ1KZ8W123456');
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).apikey).toBe('k');
  });

  it('usa Plate Recognizer para matrículas si hay token', async () => {
    process.env.PLATE_RECOGNIZER_TOKEN = 't';
    mockFetch([[/platerecognizer/, () => ({ results: [{ plate: '1234bcd', score: 0.9 }] })]]);
    const res = await app.request('/api/ocr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'plate', imageBase64: 'AAAA' }),
    });
    const r = (await res.json()) as OcrResponse;
    expect(r).toMatchObject({ provider: 'Plate Recognizer', candidates: ['1234BCD'] });
  });

  it('503 si no hay OCR configurado', async () => {
    const res = await app.request('/api/ocr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'vin', imageBase64: 'AAAA' }),
    });
    expect(res.status).toBe(503);
  });
});

describe('findOemPortal', () => {
  it('asigna el portal oficial por marca', async () => {
    const { findOemPortal } = await import('./providers/wiring');
    expect(findOemPortal('Renault')?.portals[0].url).toContain('newdialogys');
    expect(findOemPortal('Mercedes-Benz')?.portals[0].url).toContain('b2bconnect');
    expect(findOemPortal('CITROËN')?.group).toBe('Stellantis (PSA)');
    expect(findOemPortal('Ferrari')).toBeUndefined();
  });
});

describe('parseRegcheckXml', () => {
  it('devuelve null con XML sin datos', () => {
    expect(parseRegcheckXml('<Vehicle></Vehicle>')).toBeNull();
  });
});
