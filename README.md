# workshop-app

Workshop VIN identificator: una foto de la **matrícula** o del **VIN (bastidor)** y la app reúne todo lo que hay sobre ese vehículo: identificación, especificaciones técnicas, llamadas a revisión, documentación, esquemas eléctricos y manuales.

## Estructura

```
app/            App móvil (Expo SDK 58 + expo-router) — iOS, Android y web
server/         API (Node + Hono): OCR, decodificación VIN, matrícula→VIN, agregador de fuentes
packages/core/  Lógica compartida: VIN (ISO 3779), matrículas españolas, tipos del informe
```

Las claves de los proveedores viven **solo en el servidor**, nunca en la app.

## Arrancar en local

Requisitos: Node 20+ y la app **Expo Go** en el móvil (o un emulador).

```bash
npm install                       # instala todo el monorepo
cp server/.env.example server/.env   # y rellena las claves que tengas
npm run dev:server                # API en http://localhost:8787
npm run dev:app                   # Expo: escanea el QR con el móvil
```

En desarrollo la app usa automáticamente la IP del ordenador (la misma que el servidor de Expo) con el puerto 8787. Si no conecta, pon la URL a mano en **Ajustes** (p. ej. `http://192.168.1.50:8787`).

Tests y comprobaciones:

```bash
npm test          # core + server (vitest)
npm run typecheck # core + server + app
```

## Flujo

1. **Escanear matrícula** → OCR → matrícula española validada → proveedor matrícula→VIN → ficha por VIN.
2. **Escanear VIN** → OCR → extracción y validación del VIN (ISO 3779) → ficha.
3. **A mano** → detecta si es VIN o matrícula.

La ficha tiene 4 pestañas: **Ficha** (especificaciones por sección), **Docs** (esquemas eléctricos, manuales de taller, mantenimiento, boletines, manual de usuario, informes oficiales, recambios), **Revisiones** (recalls) y **Fuentes** (estado de cada proveedor consultado).

## Fuentes de datos

| Fuente | Qué da | Coste | Estado |
|---|---|---|---|
| Decodificador local (ISO 3779) | País, fabricante (WMI), año modelo, planta, nº serie, dígito de control | Gratis | ✅ Funciona sin red |
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Marca, modelo, motor, transmisión, seguridad… (completo en vehículos de EE. UU., parcial en europeos) | Gratis, sin clave | ✅ |
| NHTSA Recalls | Llamadas a revisión (solo mercado EE. UU.) | Gratis | ✅ |
| [OCR.space](https://ocr.space/ocrapi) | Lectura de VIN (y de matrícula si no hay Plate Recognizer) | Plan gratuito | ✅ `OCRSPACE_API_KEY` |
| [Plate Recognizer](https://platerecognizer.com) | Lector especializado de matrículas (región `es`) | Plan gratuito limitado | ✅ `PLATE_RECOGNIZER_TOKEN` |
| [RegCheck](https://www.regcheck.org.uk) (CheckSpain) | Matrícula española → VIN, versión, K-Type… | De pago por consulta | 🔌 `REGCHECK_USERNAME` (verificar formato de respuesta al activar) |
| HaynesPro WorkshopData | Esquemas eléctricos, procedimientos, mantenimiento | Licencia | 🔌 enchufe preparado |
| Autodata | Esquemas, distribución, pares de apriete, códigos de avería | Licencia | 🔌 enchufe preparado |
| TecDoc (TecAlliance) | Recambios por K-Type | Licencia | 🔌 enchufe preparado |
| Enlaces dirigidos | DGT (informe oficial), portales RMI del fabricante, Safety Gate UE, búsquedas de manuales y esquemas | Gratis | ✅ |

**Importante:** la DGT no tiene API pública de matrícula→VIN, y los esquemas eléctricos/manuales de taller completos son datos propietarios. Sin licencia la app identifica el vehículo, da la ficha básica y te lleva a la documentación; con licencia los rellena dentro de la app.

### Activar un proveedor con licencia

1. Rellena sus variables en `server/.env`.
2. Implementa `fetch()` en `server/src/providers/workshop.ts` mapeando su respuesta a `specs` y `documents` (tipos en `packages/core/src/report.ts`).
3. El agregador (`server/src/lookup.ts`) lo incorpora solo; en la app aparece en Docs y en Fuentes.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/vehicle/vin/:vin` | Informe completo por VIN |
| GET | `/api/vehicle/plate/:plate` | Informe por matrícula española |
| GET | `/api/vehicle/search?q=` | Detecta VIN o matrícula |
| POST | `/api/ocr` | `{ kind: "plate" \| "vin", imageBase64 }` → candidatos |
| GET | `/api/providers` | Estado de cada proveedor |

## Próximos pasos

- Contratar proveedor matrícula→VIN (RegCheck u otro) y uno de datos de taller (HaynesPro o Autodata).
- OCR en el dispositivo (ML Kit) con *development build* para no depender de red al leer.
- Visor de esquemas eléctricos dentro de la app (PDF/SVG con zoom).
- Desplegar el servidor (Railway, Fly.io, Render…) y publicar la app con EAS.
