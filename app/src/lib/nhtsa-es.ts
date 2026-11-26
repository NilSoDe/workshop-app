/** Traducción de los componentes de NHTSA (vienen en inglés y en mayúsculas). */
const MAP: Record<string, string> = {
  'AIR BAGS': 'Airbags',
  'BACK OVER PREVENTION': 'Cámara / asistente marcha atrás',
  'ELECTRICAL SYSTEM': 'Sistema eléctrico',
  'ELECTRONIC STABILITY CONTROL (ESC)': 'Control de estabilidad (ESP)',
  ENGINE: 'Motor',
  'ENGINE AND ENGINE COOLING': 'Motor y refrigeración',
  EQUIPMENT: 'Equipamiento',
  'EXTERIOR LIGHTING': 'Iluminación exterior',
  'FORWARD COLLISION AVOIDANCE': 'Frenada de emergencia',
  'FUEL/PROPULSION SYSTEM': 'Combustible / propulsión',
  'FUEL SYSTEM, DIESEL': 'Combustible (diésel)',
  'FUEL SYSTEM, GASOLINE': 'Combustible (gasolina)',
  'FUEL SYSTEM, OTHER': 'Combustible (otros)',
  'HYBRID PROPULSION SYSTEM': 'Sistema híbrido',
  'LANE DEPARTURE': 'Aviso de cambio de carril',
  'LATCHES/LOCKS/LINKAGES': 'Cierres y cerraduras',
  'PARKING BRAKE': 'Freno de mano',
  'POWER TRAIN': 'Transmisión',
  'SEAT BELTS': 'Cinturones',
  SEATS: 'Asientos',
  'SERVICE BRAKES': 'Frenos',
  'SERVICE BRAKES, AIR': 'Frenos (neumáticos)',
  'SERVICE BRAKES, HYDRAULIC': 'Frenos (hidráulicos)',
  STEERING: 'Dirección',
  STRUCTURE: 'Estructura / carrocería',
  SUSPENSION: 'Suspensión',
  TIRES: 'Neumáticos',
  'UNKNOWN OR OTHER': 'Otros / sin especificar',
  'VEHICLE SPEED CONTROL': 'Control de velocidad / acelerador',
  VISIBILITY: 'Visibilidad',
  'VISIBILITY/WIPER': 'Visibilidad / limpiaparabrisas',
  WHEELS: 'Ruedas',
};

export function componentEs(c: string): string {
  const [main, sub] = c.split(':').map((x) => x.trim());
  const t = MAP[main] ?? main.charAt(0) + main.slice(1).toLowerCase();
  return sub ? `${t} · ${sub.toLowerCase()}` : t;
}
