/**
 * NHTSA vPIC (gratis, sin clave). Cobertura completa para vehículos del mercado
 * norteamericano; para VIN europeos suele devolver al menos fabricante y, a veces, modelo/motor.
 * https://vpic.nhtsa.dot.gov/api/
 */
import type { ComplaintsSummary, Recall, SpecSection, VehicleSummary } from '@workshop/core';
import { fetchJson } from '../util';

type VpicRow = Record<string, string | null>;

const SECTIONS: Array<{ id: string; title: string; fields: Array<[string, string, string?]> }> = [
  {
    id: 'identificacion',
    title: 'Identificación',
    fields: [
      ['Make', 'Marca'],
      ['Model', 'Modelo'],
      ['ModelYear', 'Año modelo'],
      ['Series', 'Serie'],
      ['Trim', 'Acabado'],
      ['Manufacturer', 'Fabricante'],
      ['VehicleType', 'Tipo de vehículo'],
      ['BodyClass', 'Carrocería'],
      ['Doors', 'Puertas'],
      ['Seats', 'Plazas'],
    ],
  },
  {
    id: 'motor',
    title: 'Motor',
    fields: [
      ['EngineModel', 'Código / modelo de motor'],
      ['EngineConfiguration', 'Configuración'],
      ['EngineCylinders', 'Cilindros'],
      ['DisplacementCC', 'Cilindrada', 'cc'],
      ['EngineKW', 'Potencia', 'kW'],
      ['EngineHP', 'Potencia', 'hp'],
      ['FuelTypePrimary', 'Combustible'],
      ['FuelTypeSecondary', 'Combustible secundario'],
      ['FuelInjectionType', 'Inyección'],
      ['Turbo', 'Turbo'],
      ['ValveTrainDesign', 'Distribución'],
      ['CoolingType', 'Refrigeración'],
      ['ElectrificationLevel', 'Electrificación'],
      ['BatteryKWh', 'Batería', 'kWh'],
      ['OtherEngineInfo', 'Otros datos motor'],
    ],
  },
  {
    id: 'transmision',
    title: 'Transmisión',
    fields: [
      ['TransmissionStyle', 'Caja de cambios'],
      ['TransmissionSpeeds', 'Marchas'],
      ['DriveType', 'Tracción'],
    ],
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    fields: [
      ['ABS', 'ABS'],
      ['ESC', 'Control de estabilidad'],
      ['TPMS', 'Sensor presión neumáticos'],
      ['AirBagLocFront', 'Airbags frontales'],
      ['AirBagLocSide', 'Airbags laterales'],
      ['AirBagLocCurtain', 'Airbags de cortina'],
    ],
  },
  {
    id: 'fabricacion',
    title: 'Fabricación',
    fields: [
      ['PlantCompanyName', 'Planta'],
      ['PlantCity', 'Ciudad'],
      ['PlantCountry', 'País'],
      ['GVWR', 'Peso máximo (GVWR)'],
      ['SteeringLocation', 'Posición volante'],
    ],
  },
];

const clean = (v: string | null | undefined) => {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t && t !== 'Not Applicable' && t !== '0' ? t : undefined;
};

export interface NhtsaDecode {
  summary: VehicleSummary;
  specs: SpecSection[];
  errorText?: string;
}

export async function nhtsaDecode(vin: string): Promise<NhtsaDecode | null> {
  const data = await fetchJson<{ Results: VpicRow[] }>(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
  );
  const row = data.Results?.[0];
  if (!row || !clean(row.Make)) return null;

  const specs: SpecSection[] = [];
  for (const s of SECTIONS) {
    const items = s.fields
      .map(([key, label, unit]) => {
        const v = clean(row[key]);
        if (!v) return null;
        const num = Number(v);
        const value = unit ? `${Number.isFinite(num) ? Math.round(num * 10) / 10 : v} ${unit}` : v;
        return { label, value };
      })
      .filter((x): x is { label: string; value: string } => !!x);
    if (items.length) specs.push({ id: `nhtsa-${s.id}`, title: s.title, items, source: 'NHTSA vPIC' });
  }

  const disp = clean(row.DisplacementL);
  const year = Number(clean(row.ModelYear));
  return {
    summary: {
      make: clean(row.Make),
      model: clean(row.Model),
      year: Number.isFinite(year) && year > 1900 ? year : undefined,
      variant: [clean(row.Series), clean(row.Trim)].filter(Boolean).join(' ') || undefined,
      fuel: clean(row.FuelTypePrimary),
      engine: [disp ? `${Number(disp).toFixed(1)} L` : undefined, clean(row.EngineModel)].filter(Boolean).join(' ') || undefined,
      body: clean(row.BodyClass),
      engineCode: clean(row.EngineModel),
    },
    specs,
    errorText: row.ErrorCode && row.ErrorCode !== '0' ? clean(row.ErrorText) : undefined,
  };
}

interface NhtsaRecallRow {
  NHTSACampaignNumber: string;
  ReportReceivedDate?: string;
  Component?: string;
  Summary: string;
  Consequence?: string;
  Remedy?: string;
}

/** Campañas de llamada a revisión en EE. UU. por marca/modelo/año. */
export async function nhtsaRecalls(make: string, model: string, year: number): Promise<Recall[]> {
  const q = new URLSearchParams({ make, model, modelYear: String(year) });
  const data = await fetchJson<{ results?: NhtsaRecallRow[] }>(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`);
  return (data.results ?? []).map((r) => ({
    id: r.NHTSACampaignNumber,
    date: r.ReportReceivedDate,
    component: r.Component,
    summary: r.Summary,
    consequence: r.Consequence,
    remedy: r.Remedy,
    source: 'NHTSA (EE. UU.)',
  }));
}

interface NhtsaComplaintRow {
  odiNumber: number;
  dateOfIncident?: string;
  dateComplaintFiled?: string;
  components?: string;
  summary?: string;
  crash?: boolean;
  fire?: boolean;
  numberOfInjuries?: number;
}

/** "10/23/2026" → "2026-10-23" (para ordenar y mostrar) */
function isoDate(d?: string): string | undefined {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : d;
}

/** Quejas de usuarios (EE. UU.) por marca/modelo/año, agregadas por componente. */
export async function nhtsaComplaints(make: string, model: string, year: number, recentLimit = 8): Promise<ComplaintsSummary> {
  const q = new URLSearchParams({ make, model, modelYear: String(year) });
  const data = await fetchJson<{ count?: number; results?: NhtsaComplaintRow[] }>(
    `https://api.nhtsa.gov/complaints/complaintsByVehicle?${q}`,
  );
  const rows = data.results ?? [];
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const c of (r.components ?? 'UNKNOWN OR OTHER').split(',').map((x) => x.trim()).filter(Boolean)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const recent = rows
    .map((r) => ({
      id: String(r.odiNumber),
      date: isoDate(r.dateComplaintFiled ?? r.dateOfIncident),
      components: (r.components ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      summary: (r.summary ?? '').trim(),
      crash: !!r.crash,
      fire: !!r.fire,
      injuries: r.numberOfInjuries ?? 0,
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, recentLimit);
  return {
    total: data.count ?? rows.length,
    byComponent: [...counts.entries()]
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    recent,
    source: 'NHTSA (quejas de usuarios en EE. UU.)',
  };
}
