/**
 * Matrícula española → datos del vehículo (incluido VIN cuando el proveedor lo da).
 *
 * La DGT no publica una API abierta, así que hace falta un proveedor comercial.
 * Implementado: RegCheck / CarRegistrationAPI (endpoint CheckSpain, pago por consulta).
 *
 * ⚠️ El formato exacto de respuesta puede variar: el parseo es defensivo y busca
 * varias claves. Verifica contra la documentación del proveedor al activar la cuenta.
 */
import type { SpecSection, VehicleSummary } from '@workshop/core';
import { env, fetchWithTimeout, HttpError } from '../util';

export interface PlateLookupResult {
  vin?: string;
  summary: VehicleSummary;
  specs: SpecSection[];
}

export const regcheckConfigured = () => !!env('REGCHECK_USERNAME');

type Json = Record<string, unknown>;

/** Lee un valor que puede venir como string o como { CurrentTextValue } */
function pick(obj: Json, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim();
      if (s) return s;
    } else if (typeof v === 'object' && 'CurrentTextValue' in (v as Json)) {
      const s = String((v as Json).CurrentTextValue ?? '').trim();
      if (s) return s;
    }
  }
  return undefined;
}

export function parseRegcheckXml(xml: string): PlateLookupResult | null {
  const m = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/);
  if (!m) return null;
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  let j: Json;
  try {
    j = JSON.parse(decoded) as Json;
  } catch {
    return null;
  }
  const make = pick(j, 'CarMake', 'MakeDescription');
  const model = pick(j, 'CarModel', 'ModelDescription');
  const yearStr = pick(j, 'RegistrationYear');
  const vin = pick(j, 'VehicleIdentificationNumber', 'VIN', 'Vin');
  const fuel = pick(j, 'Fuel', 'FuelType');
  const engineSize = pick(j, 'EngineSize');
  const variant = pick(j, 'Variant', 'Version');
  const ktype = pick(j, 'KType', 'Ktype');
  const engineCode = pick(j, 'EngineCode');
  const firstReg = pick(j, 'DateRegistration', 'RegistrationDate');

  const items = (
    [
      ['Descripción', pick(j, 'Description')],
      ['Marca', make],
      ['Modelo', model],
      ['Versión', variant],
      ['Año matriculación', yearStr],
      ['Fecha matriculación', firstReg],
      ['Combustible', fuel],
      ['Cilindrada', engineSize],
      ['Código motor', engineCode],
      ['Potencia', pick(j, 'Power', 'PowerCV', 'Horsepower')],
      ['Puertas', pick(j, 'NumberOfDoors', 'Doors')],
      ['Plazas', pick(j, 'NumberOfSeats', 'Seats')],
      ['Caja de cambios', pick(j, 'Transmission')],
      ['Carrocería', pick(j, 'BodyStyle')],
      ['Color', pick(j, 'Colour', 'Color')],
      ['K-Type (TecDoc)', ktype],
      ['VIN', vin],
    ] as Array<[string, string | undefined]>
  )
    .filter(([, v]) => !!v)
    .map(([label, value]) => ({ label, value: value! }));

  const year = yearStr ? Number(yearStr) : undefined;
  return {
    vin: vin && vin.length === 17 ? vin.toUpperCase() : undefined,
    summary: {
      make,
      model,
      year: year && Number.isFinite(year) ? year : undefined,
      variant,
      fuel,
      engine: engineSize,
      engineCode,
      ktype,
      firstRegistration: firstReg,
    },
    specs: items.length ? [{ id: 'regcheck', title: 'Datos de matriculación (España)', items, source: 'RegCheck' }] : [],
  };
}

export async function regcheckLookup(plate: string): Promise<PlateLookupResult | null> {
  const user = env('REGCHECK_USERNAME');
  if (!user) throw new HttpError(503, 'REGCHECK_USERNAME no configurado');
  const q = new URLSearchParams({ RegistrationNumber: plate, username: user });
  const res = await fetchWithTimeout(`https://www.regcheck.org.uk/api/reg.asmx/CheckSpain?${q}`, {}, 15_000);
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, `RegCheck respondió ${res.status}: ${body.slice(0, 120)}`);
  return parseRegcheckXml(body);
}
