/**
 * Agregador: combina todas las fuentes en un único VehicleReport.
 * Prioridad del resumen: datos de matrícula (mercado español) > datos de taller > NHTSA > decodificación local.
 */
import {
  decodeVinLocal,
  parseSpanishPlate,
  type ProviderStatus,
  type Recall,
  type SourceResult,
  type SpecSection,
  type VehicleDocument,
  type VehicleReport,
  type VehicleSummary,
} from '@workshop/core';
import { nhtsaDecode, nhtsaRecalls } from './providers/nhtsa';
import { buildDocumentLinks } from './providers/links';
import { regcheckConfigured, regcheckLookup, type PlateLookupResult } from './providers/regcheck';
import { buildWiringSources } from './providers/wiring';
import { workshopProviders } from './providers/workshop';
import { env, HttpError, runSource, TtlCache } from './util';

export const reportCache = new TtlCache<VehicleReport>(24 * 60 * 60 * 1000);

function mergeSummary(...layers: Array<VehicleSummary | undefined>): VehicleSummary {
  // las primeras capas tienen prioridad
  const out: VehicleSummary = {};
  for (const layer of layers.reverse()) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function lookupByVin(rawVin: string, fromPlate?: { plate: string; data: PlateLookupResult; source: SourceResult }): Promise<VehicleReport> {
  const vinInfo = decodeVinLocal(rawVin);
  if (!vinInfo.vin || vinInfo.vin.length !== 17 || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vinInfo.vin)) {
    throw new HttpError(400, vinInfo.warnings[0] ?? 'VIN no válido');
  }
  const cacheKey = `vin:${vinInfo.vin}:${fromPlate?.plate ?? ''}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  const warnings = [...vinInfo.warnings];
  const sources: SourceResult[] = [];
  if (fromPlate) sources.push(fromPlate.source);

  const localSummary: VehicleSummary = {
    make: vinInfo.manufacturer?.split(' / ')[0],
    model: vinInfo.platform?.label,
    platform: vinInfo.platform ? vinInfo.platform.searchTerm + (vinInfo.platform.label ? ` (${vinInfo.platform.label})` : '') : undefined,
    year: vinInfo.modelYearCandidates.length === 1 ? vinInfo.modelYearCandidates[0] : undefined,
  };

  const nhtsa = await runSource('nhtsa', 'NHTSA vPIC (decodificador VIN)', async () => {
    const r = await nhtsaDecode(vinInfo.vin);
    return r ? { status: 'ok' as const, data: r, message: r.errorText } : { status: 'empty' as const, message: 'Sin datos para este VIN' };
  });
  sources.push(nhtsa.source);

  const baseSummary = mergeSummary(fromPlate?.data.summary, nhtsa.data?.summary, localSummary);

  const workshop = await Promise.all(
    workshopProviders.map((p) =>
      runSource(p.id, p.label, async () => {
        if (!p.configured()) return { status: 'not_configured' as const, message: p.description };
        const data = await p.fetch({ vin: vinInfo.vin, plate: fromPlate?.plate, summary: baseSummary });
        return { status: 'ok' as const, data };
      }),
    ),
  );
  sources.push(...workshop.map((w) => w.source));

  const northAmerican = vinInfo.region === 'Norteamérica';
  let recalls: Recall[] = [];
  if (northAmerican && baseSummary.make && baseSummary.model && baseSummary.year) {
    const r = await runSource('nhtsa-recalls', 'Llamadas a revisión (NHTSA)', async () => {
      const list = await nhtsaRecalls(baseSummary.make!, baseSummary.model!, baseSummary.year!);
      return { status: list.length ? ('ok' as const) : ('empty' as const), data: list };
    });
    sources.push(r.source);
    recalls = r.data ?? [];
  } else {
    sources.push({
      provider: 'nhtsa-recalls',
      label: 'Llamadas a revisión (NHTSA)',
      status: 'skipped',
      message: 'Solo aplica a vehículos del mercado norteamericano. Para Europa consulta Safety Gate o el concesionario.',
    });
  }

  const specs: SpecSection[] = [
    ...(fromPlate?.data.specs ?? []),
    ...workshop.flatMap((w) => w.data?.specs ?? []),
    ...(nhtsa.data?.specs ?? []),
    vinSection(vinInfo),
  ];

  const documents: VehicleDocument[] = [
    ...workshop.flatMap((w) => w.data?.documents ?? []),
    ...buildWiringSources({ vin: vinInfo, summary: baseSummary }),
    ...buildDocumentLinks({ summary: baseSummary, vin: vinInfo.vin, plate: fromPlate?.plate, northAmerican }),
  ];

  if (!baseSummary.model) {
    warnings.push(
      'No se ha podido determinar el modelo exacto con fuentes gratuitas. Configura un proveedor de matrícula o datos de taller para más detalle.',
    );
  }

  const report: VehicleReport = {
    query: { vin: vinInfo.vin, plate: fromPlate?.plate },
    generatedAt: new Date().toISOString(),
    summary: baseSummary,
    vin: vinInfo,
    plate: fromPlate ? parseSpanishPlate(fromPlate.plate) : undefined,
    specs,
    recalls,
    documents,
    sources,
    warnings,
  };
  // no cacheamos si alguna fuente falló, para reintentar en la próxima consulta
  if (!sources.some((s) => s.status === 'error')) reportCache.set(cacheKey, report);
  return report;
}

function vinSection(v: ReturnType<typeof decodeVinLocal>): SpecSection {
  const items = [
    { label: 'VIN', value: v.vin },
    { label: 'WMI (fabricante)', value: v.wmi },
    { label: 'VDS (descriptor)', value: v.vds },
    { label: 'VIS (identificador)', value: v.vis },
    { label: 'Región', value: v.region },
    v.country ? { label: 'País de fabricación', value: v.country } : null,
    v.manufacturer ? { label: 'Fabricante (WMI)', value: v.manufacturer } : null,
    v.modelYearCandidates.length
      ? { label: 'Año modelo (pos. 10)', value: v.modelYearCandidates.join(' o ') + (v.checkDigitRequired ? '' : ' (orientativo en UE)') }
      : null,
    v.platform
      ? { label: `Plataforma (${v.platform.scheme})`, value: v.platform.searchTerm + (v.platform.label ? ` · ${v.platform.label}` : '') }
      : null,
    { label: 'Código de planta', value: v.plantCode },
    { label: 'Nº de serie', value: v.serialNumber },
    { label: 'Dígito de control', value: v.checkDigitValid ? 'Correcto' : v.checkDigitRequired ? 'Incorrecto' : 'No aplica / no cuadra' },
  ].filter((x): x is { label: string; value: string } => !!x);
  return { id: 'vin', title: 'Desglose del VIN', items, source: 'Decodificación local (ISO 3779)' };
}

export async function lookupByPlate(rawPlate: string): Promise<VehicleReport> {
  const plate = parseSpanishPlate(rawPlate);
  if (!plate.valid) throw new HttpError(400, `"${rawPlate}" no parece una matrícula española válida`);
  const cacheKey = `plate:${plate.normalized}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  const res = await runSource('regcheck', 'Matrícula → vehículo (RegCheck)', async () => {
    if (!regcheckConfigured()) {
      return { status: 'not_configured' as const, message: 'Define REGCHECK_USERNAME para obtener VIN y datos desde la matrícula' };
    }
    const r = await regcheckLookup(plate.normalized);
    return r ? { status: 'ok' as const, data: r } : { status: 'empty' as const, message: 'Matrícula no encontrada' };
  });

  if (res.data?.vin) {
    const report = await lookupByVin(res.data.vin, { plate: plate.normalized, data: res.data, source: res.source });
    reportCache.set(cacheKey, report);
    return report;
  }

  const summary = res.data?.summary ?? {};
  const warnings: string[] = [];
  warnings.push(
    res.source.status === 'not_configured'
      ? 'Sin proveedor de matrícula configurado: escanea el VIN (parabrisas, pilar de la puerta o ficha técnica) para obtener la ficha completa.'
      : 'El proveedor no devolvió el VIN: escanéalo para completar la ficha.',
  );
  const report: VehicleReport = {
    query: { plate: plate.normalized },
    generatedAt: new Date().toISOString(),
    summary,
    plate,
    specs: res.data?.specs ?? [],
    recalls: [],
    documents: buildDocumentLinks({ summary, plate: plate.normalized }),
    sources: [res.source],
    warnings,
  };
  if (res.source.status === 'ok') reportCache.set(cacheKey, report);
  return report;
}

export function providerStatuses(): ProviderStatus[] {
  return [
    {
      id: 'ocrspace',
      label: 'OCR.space',
      kind: 'ocr',
      configured: !!env('OCRSPACE_API_KEY'),
      free: true,
      description: 'Lectura de texto de fotos (VIN y matrícula de respaldo)',
    },
    {
      id: 'platerecognizer',
      label: 'Plate Recognizer',
      kind: 'ocr',
      configured: !!env('PLATE_RECOGNIZER_TOKEN'),
      free: true,
      description: 'Lector especializado de matrículas (plan gratuito limitado)',
    },
    { id: 'nhtsa', label: 'NHTSA vPIC', kind: 'vin_decode', configured: true, free: true, description: 'Decodificador VIN público' },
    { id: 'nhtsa-recalls', label: 'NHTSA Recalls', kind: 'recalls', configured: true, free: true, description: 'Llamadas a revisión (EE. UU.)' },
    {
      id: 'regcheck',
      label: 'RegCheck',
      kind: 'plate_lookup',
      configured: regcheckConfigured(),
      free: false,
      description: 'Matrícula española → VIN y datos',
    },
    ...workshopProviders.map((p) => ({
      id: p.id,
      label: p.label,
      kind: 'workshop_data' as const,
      configured: p.configured(),
      free: false,
      description: p.description,
    })),
  ];
}
