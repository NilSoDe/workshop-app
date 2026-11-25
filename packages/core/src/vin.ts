/**
 * VIN (Vehicle Identification Number) — ISO 3779 / ISO 3780.
 *
 * Estructura de 17 caracteres:
 *   1-3   WMI  (World Manufacturer Identifier): región, país y fabricante
 *   4-9   VDS  (Vehicle Descriptor Section): modelo, carrocería, motor… (posición 9 = dígito de control en Norteamérica)
 *   10-17 VIS  (Vehicle Identifier Section): 10 = año modelo, 11 = planta, 12-17 = nº de serie
 *
 * En Europa el dígito de control y el año en la posición 10 NO son obligatorios,
 * así que se informan como "probables" y nunca se usan para rechazar un VIN.
 */

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Códigos de año (posición 10). Ciclo de 30 años: 1980–2009 y 2010–2039. */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/** Limpia un VIN: mayúsculas, sin espacios/guiones, y corrige confusiones típicas de OCR (O→0, I→1, Q→0). */
export function normalizeVin(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-_.·*]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Q/g, '0');
}

export function isVinFormat(vin: string): boolean {
  return VIN_CHARS.test(vin);
}

function charValue(c: string): number {
  if (c >= '0' && c <= '9') return Number(c);
  return TRANSLITERATION[c] ?? 0;
}

/** Calcula el dígito de control (posición 9) según el algoritmo norteamericano (49 CFR 565). */
export function computeCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += charValue(vin[i]) * WEIGHTS[i];
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

export function hasValidCheckDigit(vin: string): boolean {
  return isVinFormat(vin) && computeCheckDigit(vin) === vin[8];
}

export type Region =
  | 'África' | 'Asia' | 'Europa' | 'Norteamérica' | 'Oceanía' | 'Sudamérica' | 'Desconocida';

export function regionFromVin(vin: string): Region {
  const c = vin[0];
  if (c >= 'A' && c <= 'H') return 'África';
  if (c >= 'J' && c <= 'R') return 'Asia';
  if (c >= 'S' && c <= 'Z') return 'Europa';
  if (c >= '1' && c <= '5') return 'Norteamérica';
  if (c === '6' || c === '7') return 'Oceanía';
  if (c === '8' || c === '9') return 'Sudamérica';
  return 'Desconocida';
}

/** Países por los dos primeros caracteres (rangos ISO 3780 más habituales). */
const COUNTRY_RANGES: Array<[string, string, string]> = [
  ['SA', 'SM', 'Reino Unido'],
  ['SU', 'SZ', 'Polonia'],
  ['TA', 'TH', 'Suiza'],
  ['TJ', 'TP', 'República Checa'],
  ['TR', 'TV', 'Hungría'],
  ['TW', 'T1', 'Portugal'],
  ['U5', 'U7', 'Eslovaquia'],
  ['UU', 'UZ', 'Rumanía'],
  ['VA', 'VE', 'Austria'],
  ['VF', 'VR', 'Francia'],
  ['VS', 'VW', 'España'],
  ['WA', 'W0', 'Alemania'],
  ['XL', 'XR', 'Países Bajos'],
  ['XS', 'XW', 'Rusia'],
  ['YA', 'YE', 'Bélgica'],
  ['YF', 'YK', 'Finlandia'],
  ['YS', 'YW', 'Suecia'],
  ['ZA', 'ZR', 'Italia'],
  ['JA', 'J0', 'Japón'],
  ['KL', 'KR', 'Corea del Sur'],
  ['LA', 'L0', 'China'],
  ['MA', 'ME', 'India'],
  ['NL', 'NR', 'Turquía'],
  ['1A', '10', 'Estados Unidos'],
  ['4A', '40', 'Estados Unidos'],
  ['5A', '50', 'Estados Unidos'],
  ['2A', '20', 'Canadá'],
  ['3A', '3W', 'México'],
  ['9A', '9E', 'Brasil'],
  ['8A', '8E', 'Argentina'],
];

/** Orden de la segunda posición dentro de un rango ISO 3780 (A..Z y luego 1..9, 0). */
const SECOND_ORDER = 'ABCDEFGHJKLMNPRSTUVWXYZ1234567890';

export function countryFromVin(vin: string): string | undefined {
  const a = vin[0];
  const b = SECOND_ORDER.indexOf(vin[1]);
  for (const [from, to, country] of COUNTRY_RANGES) {
    if (from[0] !== a) continue;
    const lo = SECOND_ORDER.indexOf(from[1]);
    const hi = SECOND_ORDER.indexOf(to[1]);
    if (b >= lo && b <= hi) return country;
  }
  return undefined;
}

/** Fabricantes por WMI. Lista orientada al parque español; NHTSA/proveedores completan el resto. */
export const WMI_MANUFACTURERS: Record<string, string> = {
  VSS: 'SEAT / CUPRA',
  VS6: 'Ford España',
  VS7: 'Citroën España',
  VSK: 'Nissan España',
  VF1: 'Renault',
  VF3: 'Peugeot',
  VF7: 'Citroën',
  VR3: 'Peugeot',
  VR7: 'Citroën / DS',
  VNK: 'Toyota (Francia)',
  UU1: 'Dacia',
  WVW: 'Volkswagen',
  WV1: 'Volkswagen Vehículos Comerciales',
  WV2: 'Volkswagen Vehículos Comerciales',
  WAU: 'Audi',
  TRU: 'Audi (Hungría)',
  WUA: 'Audi Sport',
  WBA: 'BMW',
  WBS: 'BMW M',
  WBY: 'BMW i',
  WMW: 'MINI',
  WDB: 'Mercedes-Benz',
  WDD: 'Mercedes-Benz',
  WDC: 'Mercedes-Benz (SUV)',
  W1K: 'Mercedes-Benz',
  W1N: 'Mercedes-Benz (SUV)',
  W1V: 'Mercedes-Benz Vans',
  WF0: 'Ford Alemania',
  W0L: 'Opel',
  W0V: 'Opel',
  WP0: 'Porsche',
  WP1: 'Porsche (SUV)',
  ZFA: 'Fiat',
  ZAR: 'Alfa Romeo',
  ZLA: 'Lancia',
  ZFF: 'Ferrari',
  ZHW: 'Lamborghini',
  TMB: 'Škoda',
  TMA: 'Hyundai (Chequia)',
  KMH: 'Hyundai',
  KNA: 'Kia',
  U5Y: 'Kia (Eslovaquia)',
  JTD: 'Toyota',
  JTE: 'Toyota',
  JTM: 'Toyota',
  SB1: 'Toyota (Reino Unido)',
  JN1: 'Nissan',
  SJN: 'Nissan (Reino Unido)',
  JMZ: 'Mazda',
  JHM: 'Honda',
  SHH: 'Honda (Reino Unido)',
  JSA: 'Suzuki',
  TSM: 'Suzuki (Hungría)',
  YV1: 'Volvo',
  YS3: 'Saab',
  SAL: 'Land Rover',
  SAJ: 'Jaguar',
  '5YJ': 'Tesla',
  LRW: 'Tesla (China)',
  XP7: 'Tesla (Alemania)',
};

export function manufacturerFromVin(vin: string): string | undefined {
  return WMI_MANUFACTURERS[vin.slice(0, 3)];
}

/**
 * Años modelo posibles a partir de la posición 10.
 * En Norteamérica, si la posición 7 es letra el año es 2010–2039; si es número, 1980–2009.
 * En Europa devolvemos ambos candidatos ≤ año actual + 1.
 */
export function modelYearCandidates(vin: string, now = new Date()): number[] {
  const idx = YEAR_CODES.indexOf(vin[9]);
  if (idx < 0) return [];
  const a = 1980 + idx;
  const b = 2010 + idx;
  const max = now.getFullYear() + 1;
  if (regionFromVin(vin) === 'Norteamérica') {
    return /[A-Z]/.test(vin[6]) ? [b] : [a];
  }
  return [b, a].filter((y) => y <= max);
}

export interface VinInfo {
  vin: string;
  valid: boolean;
  wmi: string;
  vds: string;
  vis: string;
  region: Region;
  country?: string;
  manufacturer?: string;
  checkDigitValid: boolean;
  /** true si el dígito de control es obligatorio (Norteamérica) */
  checkDigitRequired: boolean;
  modelYearCandidates: number[];
  plantCode: string;
  serialNumber: string;
  warnings: string[];
}

/** Decodificación local, sin red. */
export function decodeVinLocal(input: string): VinInfo {
  const vin = normalizeVin(input);
  const valid = isVinFormat(vin);
  const region = valid ? regionFromVin(vin) : 'Desconocida';
  const checkDigitRequired = region === 'Norteamérica';
  const checkDigitValid = valid && hasValidCheckDigit(vin);
  const warnings: string[] = [];
  if (!valid) {
    warnings.push(
      vin.length !== 17
        ? `El VIN debe tener 17 caracteres (tiene ${vin.length}).`
        : 'El VIN contiene caracteres no permitidos.',
    );
  } else if (!checkDigitValid && checkDigitRequired) {
    // En Europa el dígito de control no es obligatorio: no se avisa.
    warnings.push('El dígito de control no cuadra: probablemente hay un carácter mal leído.');
  }
  return {
    vin,
    valid: valid && (!checkDigitRequired || checkDigitValid),
    wmi: vin.slice(0, 3),
    vds: vin.slice(3, 9),
    vis: vin.slice(9, 17),
    region,
    country: valid ? countryFromVin(vin) : undefined,
    manufacturer: valid ? manufacturerFromVin(vin) : undefined,
    checkDigitValid,
    checkDigitRequired,
    modelYearCandidates: valid ? modelYearCandidates(vin) : [],
    plantCode: vin[10] ?? '',
    serialNumber: vin.slice(11, 17),
    warnings,
  };
}

/**
 * Busca VINs dentro de texto OCR. Devuelve candidatos ordenados (primero los
 * que pasan dígito de control y tienen WMI conocido).
 */
export function extractVinCandidates(text: string): string[] {
  const found = new Set<string>();
  const upper = text.toUpperCase();
  // 1) tokens que ya parecen un VIN (permitiendo espacios internos de la placa/ficha)
  const compact = upper.split(/\n/).map((l) => l.replace(/[\s\-_.·*:]/g, ''));
  for (const line of [...compact, upper.replace(/[^A-Z0-9]/g, '')]) {
    const clean = line.replace(/[^A-Z0-9]/g, '');
    for (let i = 0; i + 17 <= clean.length; i++) {
      const cand = normalizeVin(clean.slice(i, i + 17));
      if (isVinFormat(cand) && /[A-Z]/.test(cand) && /\d{4,}$/.test(cand.slice(-6))) {
        found.add(cand);
      }
    }
  }
  const score = (v: string) =>
    (hasValidCheckDigit(v) ? 4 : 0) + (manufacturerFromVin(v) ? 2 : 0) + (countryFromVin(v) ? 1 : 0);
  return [...found].sort((a, b) => score(b) - score(a)).slice(0, 5);
}
