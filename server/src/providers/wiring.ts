/**
 * Esquemas eléctricos: se buscan DESPUÉS de tener el VIN.
 *
 * La fuente buena es el portal oficial del fabricante (RMI, Reglamento UE 2018/858):
 * identifica el coche por VIN y da el esquema exacto de esa unidad. Acceso de pago
 * por horas/días para talleres independientes. Autodata/Alldata no se usan.
 *
 * Además se generan búsquedas dirigidas usando el código de plataforma del VIN
 * (p. ej. "5F" = SEAT León III, "W205" = Mercedes Clase C) y el código de motor,
 * que es como aparecen titulados los esquemas originales.
 */
import type { VehicleDocument, VehicleSummary, VinInfo } from '@workshop/core';

interface OemPortal {
  match: RegExp;
  group: string;
  portals: Array<{ name: string; url: string; note: string }>;
  /** idioma de origen de la documentación, para afinar la búsqueda */
  lang: 'de' | 'fr' | 'it' | 'en';
}

const ERWIN_NOTE = 'erWin (Grupo VW): identifica por VIN → "Stromlaufpläne". Acceso de pago por horas/días.';

/** Portales oficiales verificados por marca. */
const OEM_PORTALS: OemPortal[] = [
  { match: /volkswagen|^vw\b/i, group: 'VAG', lang: 'de', portals: [{ name: 'erWin Volkswagen', url: 'https://erwin.volkswagen.de/erwin/showHome.do', note: ERWIN_NOTE }] },
  { match: /audi/i, group: 'VAG', lang: 'de', portals: [{ name: 'erWin Audi', url: 'https://erwin.audi.com/erwin/showHome.do', note: ERWIN_NOTE }] },
  { match: /seat|cupra/i, group: 'VAG', lang: 'de', portals: [{ name: 'erWin SEAT / CUPRA', url: 'https://erwin.seat.com/erwin/showHome.do', note: ERWIN_NOTE }] },
  { match: /skoda|škoda/i, group: 'VAG', lang: 'de', portals: [{ name: 'erWin Škoda', url: 'https://erwin.skoda-auto.cz/erwin/showHome.do', note: ERWIN_NOTE }] },
  {
    match: /peugeot|citro[eë]n|\bds\b/i,
    group: 'Stellantis (PSA)',
    lang: 'fr',
    portals: [{ name: 'Service Box (Peugeot / Citroën / DS)', url: 'https://public.servicebox.peugeot.com/', note: 'Documentación técnica con "Schémas électriques"; se identifica por VIN.' }],
  },
  {
    match: /opel|vauxhall/i,
    group: 'Stellantis (PSA)',
    lang: 'fr',
    portals: [{ name: 'Service Box Opel', url: 'https://public-servicebox.opel.com/', note: 'Opel de base PSA (aprox. desde 2019). Los Opel anteriores ("Legacy") tienen otra documentación.' }],
  },
  {
    match: /fiat|alfa|lancia|abarth|jeep/i,
    group: 'Stellantis (FCA)',
    lang: 'it',
    portals: [{ name: 'Stellantis Technical Information (FCA)', url: 'https://www.technicalinformation.fiat.com', note: 'Genuine Service: esquemas eléctricos con localización de componentes.' }],
  },
  {
    match: /renault|dacia/i,
    group: 'Renault Group',
    lang: 'fr',
    portals: [
      { name: 'NewDialogys (documentación Renault / Dacia)', url: 'https://newdialogys.renault.com', note: 'Esquemas y manuales por VIN. Se contrata el acceso en el portal ASOS.' },
      { name: 'ASOS Renault (alta y compra de acceso)', url: 'https://asos.renault.com/#/login', note: 'Registro con CIF; acceso por hora, día, semana o mes.' },
    ],
  },
  {
    match: /bmw|mini/i,
    group: 'BMW Group',
    lang: 'de',
    portals: [{ name: 'BMW AOS (Aftersales Online System)', url: 'https://aos.bmwgroup.com/', note: 'Esquemas con vistas de conectores, pines y ubicación de componentes; por VIN.' }],
  },
  {
    match: /mercedes|smart/i,
    group: 'Mercedes-Benz',
    lang: 'de',
    portals: [{ name: 'Mercedes-Benz B2B Connect (XENTRY WIS)', url: 'https://b2bconnect.mercedes-benz.com', note: '"Dynamic Wiring Diagram": muestra solo el esquema de ese VIN.' }],
  },
  {
    match: /toyota|lexus/i,
    group: 'Toyota',
    lang: 'en',
    portals: [{ name: 'Toyota-tech.eu', url: 'https://www.toyota-tech.eu', note: 'Electrical Wiring Diagrams (EWD) oficiales.' }],
  },
  {
    match: /hyundai/i,
    group: 'Hyundai',
    lang: 'en',
    portals: [{ name: 'Hyundai — portal RMI para independientes', url: 'https://www.hyundai.com/eu/en/driving-hyundai/information/independent-operator.html', note: 'Enlace oficial al portal de reparación y mantenimiento.' }],
  },
];

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

const WIRING_WORD: Record<OemPortal['lang'], string> = {
  de: 'Stromlaufplan',
  fr: '"schéma électrique"',
  it: '"schema elettrico"',
  en: '"wiring diagram"',
};

/** "SEAT / CUPRA" → "SEAT", "Toyota (Francia)" → "Toyota" */
function cleanMake(make?: string): string | undefined {
  return make?.split(' / ')[0].replace(/\s*\(.*\)\s*/g, '').trim() || undefined;
}

export function findOemPortal(make?: string): OemPortal | undefined {
  if (!make) return undefined;
  return OEM_PORTALS.find((p) => p.match.test(make));
}

export function buildWiringSources(opts: { vin: VinInfo; summary: VehicleSummary }): VehicleDocument[] {
  const { vin, summary } = opts;
  const make = summary.make ?? vin.manufacturer;
  const portal = findOemPortal(make) ?? findOemPortal(vin.manufacturer);
  const docs: VehicleDocument[] = [];

  if (portal) {
    portal.portals.forEach((p, i) =>
      docs.push({
        title: `Esquemas oficiales — ${p.name}`,
        kind: 'esquema_electrico',
        url: p.url,
        source: portal.group,
        trust: 'oficial',
        note: `${p.note} Al abrir se copia el VIN para pegarlo.`,
        copyValue: vin.vin,
        priority: i,
      }),
    );
  } else {
    docs.push({
      title: `Portal oficial de ${make ?? 'la marca'} (RMI)`,
      kind: 'esquema_electrico',
      url: google(`${make ?? ''} RMI portal independent operator wiring diagrams`),
      source: 'Búsqueda web',
      trust: 'busqueda',
      note: 'Por normativa UE cada marca tiene un portal con esquemas por VIN para talleres independientes.',
      copyValue: vin.vin,
      priority: 0,
    });
  }

  // Búsquedas dirigidas: plataforma + motor, en el idioma de origen de la documentación.
  const platform = vin.platform;
  const makeTerm = cleanMake(make);
  const vehicle = (
    platform
      ? [makeTerm, platform.label ?? summary.model, platform.searchTerm]
      : [makeTerm, summary.model, summary.year]
  )
    .filter(Boolean)
    .join(' ')
    .trim();
  const lang = portal?.lang ?? 'en';

  if (vehicle) {
    docs.push({
      title: `Esquemas eléctricos — ${vehicle}`,
      kind: 'esquema_electrico',
      url: google(`${vehicle} esquema eléctrico pdf`),
      source: 'Búsqueda web',
      trust: 'busqueda',
      priority: 10,
    });
    if (lang !== 'en') {
      docs.push({
        title: `Esquemas en idioma original (${lang.toUpperCase()}) — ${vehicle}`,
        kind: 'esquema_electrico',
        url: google(`${vehicle} ${WIRING_WORD[lang]} pdf`),
        source: 'Búsqueda web',
        trust: 'busqueda',
        note: 'La documentación original de la marca suele estar en este idioma: salen más resultados.',
        priority: 11,
      });
    }
    docs.push({
      title: `Wiring diagram (EN) — ${vehicle}`,
      kind: 'esquema_electrico',
      url: google(`${vehicle} ${WIRING_WORD.en} pdf`),
      source: 'Búsqueda web',
      trust: 'busqueda',
      priority: 12,
    });
  }
  if (summary.engineCode && makeTerm) {
    docs.push({
      title: `Esquema gestión motor ${summary.engineCode}`,
      kind: 'esquema_electrico',
      url: google(`${makeTerm} ${summary.engineCode} ${WIRING_WORD[lang]} OR "esquema eléctrico" motor`),
      source: 'Búsqueda web',
      trust: 'busqueda',
      priority: 13,
    });
  }
  return docs;
}
