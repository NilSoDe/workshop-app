/**
 * Plan de mantenimiento oficial gratuito.
 *
 * Grupo VW: el "Digital Service Schedule" de erWin es gratis para empresas
 * (alta en erWin, sin contratar tarifa). Por VIN muestra el historial de
 * servicio y genera la tabla de mantenimiento de esa unidad.
 * Fuente: guía de erWin "Digital Service Schedule" (VW CR4688).
 */
import type { VehicleDocument } from '@workshop/core';

const ERWIN_HOME: Array<[RegExp, string, string]> = [
  [/volkswagen|^vw\b/i, 'Volkswagen', 'https://erwin.volkswagen.de/'],
  [/audi/i, 'Audi', 'https://erwin.audi.com/'],
  [/seat|cupra/i, 'SEAT / CUPRA', 'https://erwin.seat.com/'],
  [/skoda|škoda/i, 'Škoda', 'https://erwin.skoda-auto.cz/'],
];

export function buildMaintenanceSources(make?: string, vin?: string): VehicleDocument[] {
  if (!make || !vin) return [];
  const hit = ERWIN_HOME.find(([re]) => re.test(make));
  if (!hit) return [];
  const [, brand, url] = hit;
  return [
    {
      title: `Plan de mantenimiento e historial de servicio — erWin ${brand}`,
      kind: 'mantenimiento',
      url,
      source: `erWin ${brand}`,
      trust: 'oficial',
      note:
        'Gratis para empresas (alta en erWin, sin tarifa). "Products and services" → VIN → tabla de mantenimiento e historial de servicio. Al abrir se copia el VIN.',
      copyValue: vin,
      priority: 0,
    },
  ];
}
