/** Tipos compartidos entre servidor y app para el informe de vehículo. */

import type { VinInfo } from './vin';
import type { PlateInfo } from './plate';

export type SourceStatus = 'ok' | 'empty' | 'error' | 'not_configured' | 'skipped';

export interface SourceResult {
  provider: string;
  label: string;
  status: SourceStatus;
  message?: string;
  /** ms que tardó la consulta */
  ms?: number;
}

export interface SpecItem {
  label: string;
  value: string;
}

export interface SpecSection {
  id: string;
  title: string;
  items: SpecItem[];
  source: string;
}

export interface Recall {
  id: string;
  date?: string;
  component?: string;
  summary: string;
  consequence?: string;
  remedy?: string;
  source: string;
}

export interface Complaint {
  id: string;
  date?: string;
  components: string[];
  summary: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
}

export interface ComplaintsSummary {
  total: number;
  /** Componentes con más quejas, de mayor a menor */
  byComponent: Array<{ component: string; count: number }>;
  /** Las más recientes */
  recent: Complaint[];
  source: string;
  note?: string;
}

export type DocumentKind =
  | 'manual_taller'
  | 'esquema_electrico'
  | 'manual_usuario'
  | 'mantenimiento'
  | 'boletin_tecnico'
  | 'informe_oficial'
  | 'recambios'
  | 'otro';

export interface VehicleDocument {
  title: string;
  kind: DocumentKind;
  url: string;
  source: string;
  /** "oficial" = fuente del fabricante/administración; "licencia" = proveedor de pago; "busqueda" = enlace de búsqueda */
  trust: 'oficial' | 'licencia' | 'busqueda';
  note?: string;
  /** Valor que la app copia al portapapeles antes de abrir (VIN o matrícula) para pegarlo en el portal */
  copyValue?: string;
  /** Orden dentro de su grupo (menor = más arriba) */
  priority?: number;
}

export interface VehicleSummary {
  make?: string;
  model?: string;
  year?: number;
  variant?: string;
  fuel?: string;
  engine?: string;
  body?: string;
  /** Código de motor (p.ej. CJZA) si algún proveedor lo da */
  engineCode?: string;
  /** TecDoc K-Type: clave para enlazar con catálogos de recambios y datos de taller */
  ktype?: string;
  firstRegistration?: string;
  /** Código de plataforma/serie del fabricante (p. ej. "5F", "W205") */
  platform?: string;
}

export interface VehicleReport {
  query: { vin?: string; plate?: string };
  generatedAt: string;
  summary: VehicleSummary;
  vin?: VinInfo;
  plate?: PlateInfo;
  specs: SpecSection[];
  recalls: Recall[];
  complaints?: ComplaintsSummary;
  documents: VehicleDocument[];
  sources: SourceResult[];
  warnings: string[];
}

export interface OcrResponse {
  kind: 'plate' | 'vin';
  text: string;
  candidates: string[];
  provider: string;
}

export interface ProviderStatus {
  id: string;
  label: string;
  kind: 'ocr' | 'vin_decode' | 'plate_lookup' | 'recalls' | 'workshop_data';
  configured: boolean;
  free: boolean;
  description: string;
}
