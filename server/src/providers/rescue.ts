/**
 * Fichas de rescate (rescue sheets, ISO 17840): gratuitas y oficiales.
 * Muestran airbags, pretensores, batería, depósito, alta tensión y puntos de corte.
 *
 * Enlaces oficiales de cada fabricante tomados del índice del ADAC
 * (adac.de/rund-ums-fahrzeug/unfall-schaden-panne/rettungskarte). Donde existe
 * versión en español verificada, se usa esa.
 */
import type { VehicleDocument } from '@workshop/core';

const RESCUE_PAGES: Array<[RegExp, string, string?]> = [
  [/abarth/i, 'https://www.abarth.de/rettungsdatenblaetter'],
  [/alfa/i, 'https://www.alfaromeo.de/rettungsdaten-blaetter'],
  [/audi/i, 'https://www.audi.com/de/rescue.html'],
  [/bentley/i, 'https://www.bentleymotors.com/en/world-of-bentley/ownership/services/other-vehicle-information.html'],
  [/bmw/i, 'https://aos.bmwgroup.com/services/rescue-information/bmw/overview'],
  [/\bmini\b/i, 'https://aos.bmwgroup.com/services/rescue-information/mini/overview'],
  [/byd/i, 'https://www.bydauto.at/downloads'],
  [/chevrolet/i, 'https://www.chevrolet.de/de/rettungskarten'],
  [/citro[eë]n/i, 'https://public.servicebox-parts.com/AC/secours/AC/documents/es_ES/index.html', 'es'],
  [/cupra/i, 'https://www.cupraofficial.at/service-zubehoer/downloads/rettungsdatenblaetter'],
  [/dacia/i, 'https://www.dacia.de/rettungskarten.html'],
  [/\bds\b/i, 'https://www.dsautomobiles.de/mein-ds/garantie-assistance/ds-assistance/redirect-manuel-de-secours-et-rescue-sheet.html'],
  [/fiat/i, 'https://www.fiat.de/besitzer/rettungsdatenblaetter'],
  [/ford/i, 'https://www.fordserviceinfo.com/ServiceTip?category=RESCUE'],
  [/honda/i, 'https://www.honda.de/cars/services/download-rettungsdatenblaetter.html'],
  [/hyundai/i, 'https://www.hyundai.com/de/de/service/gut-informiert/anleitungen-und-datenblaetter.html'],
  [/jaguar/i, 'https://www.jaguar.de/service-und-zubehor/service-garantien/rettungskarten.html'],
  [/jeep/i, 'https://www.jeep.de/mopar/rettungsdatenblaetter'],
  [/kia/i, 'https://www.kia.com/es/kia-service/servicio-y-mantenimiento/hojas-rescate/', 'es'],
  [/lancia/i, 'https://www.lancia.de/mopar/rettungsdatenblaetter'],
  [/land rover/i, 'https://www.landrover.de/ownership/emergency.html'],
  [/lexus/i, 'https://www.lexus.de/lexus-besitzer/fahrzeuginformationen#rescue'],
  [/mazda/i, 'https://www.mazda.de/rettungskarten/'],
  [/mercedes|maybach/i, 'https://rk.mb-qr.com/es/', 'es'],
  [/\bmg\b/i, 'https://www.mgmotor.de/owners/rettungskarten'],
  [/mitsubishi/i, 'https://www.mitsubishi-publikationen.de/de/profiles/bf834dc9c730/editions/category/2756'],
  [/nissan/i, 'https://www.nissan.de/rescuers_page.html'],
  [/opel|vauxhall/i, 'https://www.ifz-berlin.de/index.html#/rescue'],
  [/peugeot/i, 'https://public.servicebox.peugeot.com/AP/secours/AP/documents/es_ES/index.html', 'es'],
  [/porsche/i, 'https://www.porsche.com/international/accessoriesandservice/porscheservice/vehicleinformation/documents/'],
  [/renault/i, 'https://www.renault.de/tipps-und-anleitungen/rettungskarten.html'],
  [/seat/i, 'https://www.seat.de/kontakt/downloads/rettungsblaetter'],
  [/skoda|škoda/i, 'https://www.skoda-auto.de/service/rettungskraefte'],
  [/smart/i, 'https://www.rescuecard.smart.com/'],
  [/ssang ?yong|kgm/i, 'https://www.ssangyong.de/service/rettungsdatenblaetter'],
  [/subaru/i, 'https://www.subaru.de/marke-technik/technik/sicherheit'],
  [/suzuki/i, 'https://auto.suzuki.de/service/dokumente-hilfe'],
  [/tesla/i, 'https://www.tesla.com/de_DE/firstresponders'],
  [/toyota/i, 'https://www.toyota.de/zubehoer-service/fahrzeuginformationen/rettungsdatenblaetter'],
  [/volkswagen|^vw\b/i, 'https://www.volkswagen.de/de/besitzer-und-service/ueber-ihr-auto/kundeninformationen/rechtliches/rescue-data.html'],
  [/volvo/i, 'https://www.volvocars.com/de/l/zubehoer-und-services/rettungsleitfaeden/'],
];

export function buildRescueSheets(make?: string, model?: string): VehicleDocument[] {
  const docs: VehicleDocument[] = [];
  const hit = make ? RESCUE_PAGES.find(([re]) => re.test(make)) : undefined;
  if (hit) {
    const [, url, lang] = hit;
    docs.push({
      title: `Ficha de rescate oficial — ${make}${model ? ` ${model}` : ''}`,
      kind: 'ficha_rescate',
      url,
      source: make!,
      trust: 'oficial',
      note:
        (lang === 'es' ? '' : 'Página del fabricante en alemán; las fichas usan pictogramas ISO 17840 y suelen estar en varios idiomas. ') +
        'Airbags, pretensores, batería, depósito, alta tensión y puntos de corte.',
      priority: 0,
    });
  }
  docs.push({
    title: 'Euro Rescue (app gratuita de Euro NCAP)',
    kind: 'ficha_rescate',
    url: `https://www.google.com/search?q=${encodeURIComponent('Euro Rescue app Euro NCAP')}`,
    source: 'Euro NCAP / CTIF',
    trust: 'busqueda',
    note: 'Fichas de rescate de casi todas las marcas, en español y sin conexión.',
    priority: 1,
  });
  return docs;
}
