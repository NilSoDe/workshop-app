/**
 * Matrículas españolas.
 *
 * - Actual (desde sept. 2000): 4 dígitos + 3 consonantes sin vocales, Ñ ni Q → "1234 BCD"
 * - Provincial (1971–2000): código de provincia + 4 dígitos + 1-2 letras → "M-1234-AB"
 * - Ciclomotor: C + 4 dígitos + 3 consonantes → "C1234BCD"
 * - Remolque: R + 4 dígitos + 3 consonantes
 * - Vehículo especial: E + 4 dígitos + 3 consonantes
 * - Histórico: H + 4 dígitos + 3 consonantes
 */

export type SpanishPlateType =
  | 'actual'
  | 'provincial'
  | 'ciclomotor'
  | 'remolque'
  | 'especial'
  | 'historico';

const CONSONANTS = 'BCDFGHJKLMNPRSTVWXYZ';
const C3 = `[${CONSONANTS}]{3}`;

export const PROVINCE_CODES: Record<string, string> = {
  A: 'Alicante', AB: 'Albacete', AL: 'Almería', AV: 'Ávila', B: 'Barcelona', BA: 'Badajoz',
  BI: 'Vizcaya', BU: 'Burgos', C: 'A Coruña', CA: 'Cádiz', CC: 'Cáceres', CE: 'Ceuta',
  CO: 'Córdoba', CR: 'Ciudad Real', CS: 'Castellón', CU: 'Cuenca', GC: 'Las Palmas',
  GE: 'Girona', GI: 'Girona', GR: 'Granada', GU: 'Guadalajara', H: 'Huelva', HU: 'Huesca',
  IB: 'Baleares', J: 'Jaén', L: 'Lleida', LE: 'León', LO: 'La Rioja', LU: 'Lugo', M: 'Madrid',
  MA: 'Málaga', ML: 'Melilla', MU: 'Murcia', NA: 'Navarra', O: 'Asturias', OR: 'Ourense',
  OU: 'Ourense', P: 'Palencia', PM: 'Baleares', PO: 'Pontevedra', S: 'Cantabria',
  SA: 'Salamanca', SE: 'Sevilla', SG: 'Segovia', SO: 'Soria', SS: 'Guipúzcoa', T: 'Tarragona',
  TE: 'Teruel', TF: 'Santa Cruz de Tenerife', TO: 'Toledo', V: 'Valencia', VA: 'Valladolid',
  VI: 'Álava', Z: 'Zaragoza', ZA: 'Zamora',
};

export interface PlateInfo {
  input: string;
  normalized: string;
  display: string;
  valid: boolean;
  type?: SpanishPlateType;
  province?: string;
}

export function normalizePlate(input: string): string {
  return input
    .toUpperCase()
    .replace(/^E[\s-]+/, '') // distintivo de país de la franja azul
    .replace(/[^A-Z0-9Ñ]/g, '');
}

const PATTERNS: Array<[SpanishPlateType, RegExp]> = [
  ['actual', new RegExp(`^(\\d{4})(${C3})$`)],
  ['ciclomotor', new RegExp(`^C(\\d{4})(${C3})$`)],
  ['remolque', new RegExp(`^R(\\d{4})(${C3})$`)],
  ['especial', new RegExp(`^E(\\d{4})(${C3})$`)],
  ['historico', new RegExp(`^H(\\d{4})(${C3})$`)],
];

export function parseSpanishPlate(input: string): PlateInfo {
  const normalized = normalizePlate(input);
  for (const [type, re] of PATTERNS) {
    const m = normalized.match(re);
    if (m) {
      const prefix = type === 'actual' ? '' : normalized[0];
      return {
        input,
        normalized,
        display: `${prefix}${prefix ? ' ' : ''}${m[1]} ${m[2]}`,
        valid: true,
        type,
      };
    }
  }
  const prov = normalized.match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/);
  if (prov && PROVINCE_CODES[prov[1]]) {
    return {
      input,
      normalized,
      display: `${prov[1]}-${prov[2]}-${prov[3]}`,
      valid: true,
      type: 'provincial',
      province: PROVINCE_CODES[prov[1]],
    };
  }
  return { input, normalized, display: normalized, valid: false };
}

/** Busca matrículas en texto OCR (corrige O↔0 e I↔1 según la posición). */
export function extractPlateCandidates(text: string): string[] {
  const out = new Set<string>();
  const lines = text.toUpperCase().split(/\n/);
  const chunks = [...lines, lines.join(' ')];
  for (const chunk of chunks) {
    const clean = chunk.replace(/^E\s+/, '').replace(/[^A-Z0-9]/g, '');
    for (let len = 7; len <= 9; len++) {
      for (let i = 0; i + len <= clean.length; i++) {
        const raw = clean.slice(i, i + len);
        for (const variant of ocrVariants(raw)) {
          const info = parseSpanishPlate(variant);
          if (info.valid) out.add(info.normalized);
        }
      }
    }
  }
  // Prioriza el formato actual, que es el más común.
  return [...out]
    .sort((a, b) => Number(/^\d{4}/.test(b)) - Number(/^\d{4}/.test(a)))
    .slice(0, 5);
}

function ocrVariants(raw: string): string[] {
  // Formato actual: 4 dígitos + 3 letras. Corrige confusiones habituales.
  if (raw.length === 7) {
    const digits = raw
      .slice(0, 4)
      .replace(/O|D|Q/g, '0')
      .replace(/I|L/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/B/g, '8');
    const letters = raw.slice(4).replace(/0/g, 'D').replace(/1/g, 'J').replace(/8/g, 'B').replace(/5/g, 'S');
    return [raw, digits + letters];
  }
  return [raw];
}
