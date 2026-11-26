/**
 * Manual del propietario oficial (gratis).
 * Portales verificados por marca; para el resto, búsqueda restringida al dominio
 * oficial de la marca en España, para no acabar en webs de terceros.
 */
import type { VehicleDocument } from '@workshop/core';

interface ManualPortal {
  match: RegExp;
  url: string;
  note: string;
  /** El portal pide el VIN: la app lo copia antes de abrir */
  byVin?: boolean;
}

const PORTALS: ManualPortal[] = [
  {
    match: /volkswagen|^vw\b/i,
    url: 'https://www.volkswagen.ie/en/owners-and-services/customer-information/digital-manual.html',
    note: 'Manual digital oficial por VIN (modelos fabricados desde agosto de 2019).',
    byVin: true,
  },
  { match: /seat|cupra/i, url: 'https://www.seat.com/owners/about-my-car/manuals', note: 'Manuales oficiales SEAT por modelo.' },
  { match: /skoda|škoda/i, url: 'https://www.skoda-auto.com/apps/manuals', note: 'Manuales oficiales Škoda por modelo y año.' },
  { match: /renault/i, url: 'https://es.e-guide.renault.com/', note: 'e-guide oficial de Renault en español.' },
  { match: /peugeot/i, url: 'https://public.servicebox.peugeot.com/APddb/', note: 'Documentación de a bordo oficial de Peugeot.' },
  { match: /citro[eë]n/i, url: 'https://service.citroen.com/ACddb/', note: 'Documentación de a bordo oficial de Citroën.' },
  { match: /kia/i, url: 'https://ownersmanual.kia.com/', note: 'Manuales oficiales Kia (web).' },
];

/** Dominio oficial en España para búsquedas restringidas. */
const DOMAINS: Array<[RegExp, string]> = [
  [/audi/i, 'audi.es'],
  [/bmw/i, 'bmw.es'],
  [/\bmini\b/i, 'mini.es'],
  [/mercedes|smart/i, 'mercedes-benz.es'],
  [/toyota/i, 'toyota.es'],
  [/lexus/i, 'lexus.es'],
  [/ford/i, 'ford.es'],
  [/opel/i, 'opel.es'],
  [/\bds\b/i, 'dsautomobiles.es'],
  [/fiat/i, 'fiat.es'],
  [/alfa/i, 'alfaromeo.es'],
  [/jeep/i, 'jeep.es'],
  [/dacia/i, 'dacia.es'],
  [/hyundai/i, 'hyundai.com'],
  [/nissan/i, 'nissan.es'],
  [/mazda/i, 'mazda.es'],
  [/honda/i, 'honda.es'],
  [/volvo/i, 'volvocars.com'],
  [/suzuki/i, 'suzuki.es'],
  [/mitsubishi/i, 'mitsubishi-motors.es'],
  [/tesla/i, 'tesla.com'],
  [/porsche/i, 'porsche.com'],
];

export function buildOwnerManuals(opts: { make?: string; model?: string; year?: number; vin?: string }): VehicleDocument[] {
  const { make, model, year, vin } = opts;
  if (!make) return [];
  const label = [make, model, year].filter(Boolean).join(' ');
  const docs: VehicleDocument[] = [];
  const portal = PORTALS.find((p) => p.match.test(make));
  if (portal) {
    docs.push({
      title: `Manual del propietario oficial — ${label}`,
      kind: 'manual_usuario',
      url: portal.url,
      source: make,
      trust: 'oficial',
      note: portal.byVin && vin ? `${portal.note} Al abrir se copia el VIN.` : portal.note,
      copyValue: portal.byVin ? vin : undefined,
      priority: 0,
    });
  }
  const domain = DOMAINS.find(([re]) => re.test(make))?.[1];
  const q = `${[model, year].filter(Boolean).join(' ')} manual del propietario pdf`;
  docs.push({
    title: domain ? `Manual en la web oficial (${domain}) — ${label}` : `Manual del propietario — ${label}`,
    kind: 'manual_usuario',
    url: `https://www.google.com/search?q=${encodeURIComponent(domain ? `site:${domain} ${q}` : `${make} ${q}`)}`,
    source: 'Búsqueda web',
    trust: 'busqueda',
    note: domain ? 'Búsqueda solo dentro de la web oficial de la marca.' : undefined,
    priority: 1,
  });
  return docs;
}
