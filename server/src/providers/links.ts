/**
 * Documentación accesible sin licencia: fuentes oficiales y búsquedas dirigidas
 * (manuales de taller, esquemas eléctricos, manual de usuario, boletines, recambios).
 */
import type { VehicleDocument, VehicleSummary } from '@workshop/core';
import { buildOwnerManuals } from './manuals';
import { buildRescueSheets } from './rescue';

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export function buildDocumentLinks(opts: {
  summary: VehicleSummary;
  vin?: string;
  plate?: string;
  northAmerican?: boolean;
}): VehicleDocument[] {
  const { summary, vin, plate, northAmerican } = opts;
  const docs: VehicleDocument[] = [];

  docs.push({
    title: 'Informe oficial del vehículo (DGT)',
    kind: 'informe_oficial',
    url: 'https://sede.dgt.gob.es/es/vehiculos/informe-de-vehiculo/',
    source: 'DGT',
    trust: 'oficial',
    note: `Titularidad, cargas, ITV, kilometraje. De pago, con ${plate ? 'la matrícula' : 'matrícula o bastidor'}.`,
  });

  docs.push({
    title: 'Aceites y líquidos recomendados (Castrol)',
    kind: 'mantenimiento',
    url: 'https://www.castrol.com/es_es/spain/home/product-finder.html',
    source: 'Castrol',
    trust: 'oficial',
    note: plate
      ? 'Busca por matrícula: aceite, caja, frenos y refrigerante. La matrícula se copia al abrir.'
      : 'Busca por matrícula o por marca y modelo: aceite, caja, frenos y refrigerante.',
    copyValue: plate,
  });

  if (northAmerican && vin) {
    docs.push({
      title: 'Llamadas a revisión por VIN (NHTSA)',
      kind: 'informe_oficial',
      url: `https://www.nhtsa.gov/recalls?vin=${vin}`,
      source: 'NHTSA',
      trust: 'oficial',
    });
  }

  docs.push(...buildRescueSheets(summary.make, summary.model));
  docs.push(...buildOwnerManuals({ make: summary.make, model: summary.model, year: summary.year, vin }));

  const base = [summary.make, summary.model].filter(Boolean).join(' ');
  if (!base) return docs;
  const withYear = [base, summary.year].filter(Boolean).join(' ');
  const withEngine = [withYear, summary.engineCode ?? summary.engine].filter(Boolean).join(' ');

  docs.push(
    {
      title: `Manual de taller — ${withEngine}`,
      kind: 'manual_taller',
      url: google(`${withEngine} manual de taller pdf`),
      source: 'Búsqueda web',
      trust: 'busqueda',
    },
    {
      title: `Plan de mantenimiento — ${withEngine}`,
      kind: 'mantenimiento',
      url: google(`${withEngine} plan de mantenimiento intervalos aceite distribución`),
      source: 'Búsqueda web',
      trust: 'busqueda',
    },
    {
      title: `Boletines técnicos / averías conocidas — ${withYear}`,
      kind: 'boletin_tecnico',
      url: google(`${withEngine} TSB boletín técnico problemas comunes`),
      source: 'Búsqueda web',
      trust: 'busqueda',
    },
    {
      title: `Portal oficial de reparación (RMI) de ${summary.make ?? 'la marca'}`,
      kind: 'manual_taller',
      url: google(`${summary.make ?? base} RMI repair maintenance information portal taller independiente`),
      source: 'Búsqueda web',
      trust: 'busqueda',
      note: 'Por normativa UE los fabricantes deben dar acceso a talleres independientes (suscripción).',
    },
    {
      title: `Alertas de seguridad UE (Safety Gate) — ${base}`,
      kind: 'informe_oficial',
      url: google(`site:ec.europa.eu safety gate ${base}`),
      source: 'Búsqueda web',
      trust: 'busqueda',
    },
    {
      title: `Recambios — ${withEngine}`,
      kind: 'recambios',
      url: google(`${summary.ktype ? `ktype ${summary.ktype}` : withEngine} recambios`),
      source: 'Búsqueda web',
      trust: 'busqueda',
    },
  );
  return docs;
}
