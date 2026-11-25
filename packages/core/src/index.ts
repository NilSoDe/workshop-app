export * from './vin';
export * from './plate';
export * from './report';

import { decodeVinLocal } from './vin';
import { parseSpanishPlate } from './plate';

/** Detecta si lo que ha escrito el usuario es un VIN o una matrícula. */
export function detectQuery(input: string): { type: 'vin'; value: string } | { type: 'plate'; value: string } | null {
  const vin = decodeVinLocal(input);
  if (vin.valid) return { type: 'vin', value: vin.vin };
  const plate = parseSpanishPlate(input);
  if (plate.valid) return { type: 'plate', value: plate.normalized };
  return null;
}
