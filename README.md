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

La ficha tiene 5 pestañas: **Ficha** (especificaciones por sección), **Esquemas** (esquemas eléctricos, se buscan con el VIN), **Docs** (manuales de taller, mantenimiento y aceites, boletines, manual de usuario, informes oficiales, recambios), **Recalls** y **Fuentes** (estado de cada proveedor consultado).

## Esquemas eléctricos (por VIN)

Se buscan **después de tener el VIN**, porque el esquema depende de la unidad exacta. Autodata y Alldata no se usan.

1. **Portal oficial del fabricante** (RMI, Reglamento UE 2018/858): identifica el coche por VIN y da el esquema de esa unidad. Acceso de pago por horas o días para talleres independientes. Al abrirlo, la app copia el VIN para pegarlo.

   | Marcas | Portal |
   |---|---|
   | VW, Audi, SEAT/CUPRA, Škoda | erWin |
   | Peugeot, Citroën, DS, Opel (base PSA) | Service Box |
   | Fiat, Alfa Romeo, Lancia, Abarth, Jeep | Stellantis Technical Information |
   | Renault, Dacia | NewDialogys (acceso vía ASOS) |
   | BMW, MINI | AOS |
   | Mercedes-Benz, smart | B2B Connect (Dynamic Wiring Diagram por VIN) |
   | Toyota, Lexus | Toyota-tech.eu (EWD) |
   | Hyundai | Portal RMI para independientes |
   | Resto | Búsqueda del portal RMI de la marca |

2. **Búsquedas dirigidas** con el código de plataforma que sale del VIN (VAG posiciones 7-8, p. ej. `5F` = León III; Mercedes posiciones 4-6, p. ej. `W205`), el código de motor y el idioma original de la documentación (`Stromlaufplan`, `schéma électrique`…).

Para añadir una marca: `server/src/providers/wiring.ts` → `OEM_PORTALS`.

## Fuentes de datos

| Fuente | Qué da | Coste | Estado |
|---|---|---|---|
| Decodificador local (ISO 3779) | País, fabricante (WMI), año modelo, planta, nº serie, dígito de control | Gratis | ✅ Funciona sin red |
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Marca, modelo, motor, transmisión, seguridad… (completo en vehículos de EE. UU., parcial en europeos) | Gratis, sin clave | ✅ |
| NHTSA Recalls | Llamadas a revisión (solo mercado EE. UU.) | Gratis | ✅ |
| [OCR.space](https://ocr.space/ocrapi) | Lectura de VIN (y de matrícula si no hay Plate Recognizer) | Plan gratuito | ✅ `OCRSPACE_API_KEY` |
| [Plate Recognizer](https://platerecognizer.com) | Lector especializado de matrículas (región `es`) | Plan gratuito limitado | ✅ `PLATE_RECOGNIZER_TOKEN` |
| [RegCheck](https://www.regcheck.org.uk) (CheckSpain) | Matrícula española → VIN, versión, K-Type… | De pago por consulta | 🔌 `REGCHECK_USERNAME` (verificar formato de respuesta al activar) |
| Portales oficiales del fabricante | Esquemas eléctricos y manuales por VIN | Pago por horas/días | ✅ Enlace directo con el VIN copiado |
| Castrol (buscador de productos) | Aceites y líquidos por matrícula | Gratis | ✅ Enlace con la matrícula copiada (sin integración automática: su API interna está protegida con reCAPTCHA) |
| HaynesPro WorkshopData | Procedimientos, mantenimiento | Licencia | 🔌 enchufe preparado |
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

- Contratar proveedor matrícula→VIN (RegCheck u otro).
- OCR en el dispositivo (ML Kit) con *development build* para no depender de red al leer.
- Visor de esquemas eléctricos dentro de la app (PDF/SVG con zoom).
- Desplegar el servidor (Railway, Fly.io, Render…) y publicar la app con EAS.
