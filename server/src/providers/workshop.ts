/**
 * Datos de taller con licencia: esquemas eléctricos, manuales de reparación,
 * tiempos, pares de apriete, planes de mantenimiento, boletines técnicos…
 *
 * Estos datos son propietarios. Cada proveedor es un "enchufe": mientras no
 * haya credenciales aparece como "no configurado" en la app. Para activarlo:
 *   1. Contratar el acceso API y rellenar las variables en server/.env
 *   2. Implementar `fetch()` del proveedor (mapear su respuesta a specs/documents)
 *
 * Proveedores habituales en Europa:
 *   - HaynesPro WorkshopData  → esquemas eléctricos, procedimientos, mantenimiento (identifica por VIN o TecDoc K-Type)
 *   - Autodata                → esquemas, distribución, pares, códigos de avería
 *   - TecDoc (TecAlliance)    → catálogo de recambios y vínculos por K-Type / VIN
 *   - Portales RMI de cada fabricante (Reglamento UE 2018/858) → información oficial, acceso por suscripción
 */
import type { SpecSection, VehicleDocument, VehicleSummary } from '@workshop/core';
import { env } from '../util';

export interface WorkshopContext {
  vin?: string;
  plate?: string;
  summary: VehicleSummary;
}

export interface WorkshopData {
  specs?: SpecSection[];
  documents?: VehicleDocument[];
}

export interface WorkshopProvider {
  id: string;
  label: string;
  description: string;
  configured(): boolean;
  fetch(ctx: WorkshopContext): Promise<WorkshopData>;
}

class NotImplementedError extends Error {
  constructor(provider: string) {
    super(`Credenciales detectadas pero la integración de ${provider} aún no está implementada (server/src/providers/workshop.ts).`);
  }
}

export const workshopProviders: WorkshopProvider[] = [
  {
    id: 'haynespro',
    label: 'HaynesPro WorkshopData',
    description: 'Esquemas eléctricos, manuales de reparación, mantenimiento, boletines',
    configured: () => !!(env('HAYNESPRO_DISTRIBUTOR') && env('HAYNESPRO_PASSWORD')),
    async fetch() {
      // TODO: autenticar (distributor + password → token), identificar vehículo por VIN o K-Type
      // y mapear: esquemas eléctricos → documents(kind 'esquema_electrico'), mantenimiento → specs…
      throw new NotImplementedError('HaynesPro');
    },
  },
  {
    id: 'autodata',
    label: 'Autodata',
    description: 'Esquemas eléctricos, correas de distribución, pares de apriete, códigos de avería',
    configured: () => !!(env('AUTODATA_CLIENT_ID') && env('AUTODATA_CLIENT_SECRET')),
    async fetch() {
      throw new NotImplementedError('Autodata');
    },
  },
  {
    id: 'tecdoc',
    label: 'TecDoc (TecAlliance)',
    description: 'Catálogo de recambios y datos técnicos por K-Type',
    configured: () => !!(env('TECDOC_PROVIDER_ID') && env('TECDOC_API_KEY')),
    async fetch() {
      throw new NotImplementedError('TecDoc');
    },
  },
];
