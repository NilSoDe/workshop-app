/**
 * OCR de matrícula y VIN.
 *
 * - Matrícula: Plate Recognizer (especializado, región "es") si hay token;
 *   si no, OCR.space + extracción por patrón de matrícula española.
 * - VIN: OCR.space (motor 2) + extracción/validación de VIN.
 */
import { extractPlateCandidates, extractVinCandidates, parseSpanishPlate, type OcrResponse } from '@workshop/core';
import { env, fetchJson, HttpError } from '../util';

interface OcrSpaceResponse {
  ParsedResults?: Array<{ ParsedText?: string }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
}

export async function ocrSpaceText(imageBase64: string, mime = 'image/jpeg'): Promise<string> {
  const key = env('OCRSPACE_API_KEY');
  if (!key) throw new HttpError(503, 'OCR no configurado: define OCRSPACE_API_KEY en server/.env');
  const form = new FormData();
  form.set('base64Image', `data:${mime};base64,${imageBase64}`);
  form.set('OCREngine', '2');
  form.set('scale', 'true');
  form.set('detectOrientation', 'true');
  const data = await fetchJson<OcrSpaceResponse>(
    'https://api.ocr.space/parse/image',
    { method: 'POST', headers: { apikey: key }, body: form },
    25_000,
  );
  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : data.ErrorMessage;
    throw new HttpError(502, `OCR.space: ${msg ?? 'error procesando la imagen'}`);
  }
  return (data.ParsedResults ?? []).map((r) => r.ParsedText ?? '').join('\n');
}

interface PlateRecognizerResponse {
  results?: Array<{ plate: string; score: number; candidates?: Array<{ plate: string; score: number }> }>;
}

async function plateRecognizer(imageBase64: string, token: string): Promise<{ text: string; candidates: string[] }> {
  const form = new FormData();
  form.set('upload', imageBase64);
  form.set('regions', 'es');
  const data = await fetchJson<PlateRecognizerResponse>(
    'https://api.platerecognizer.com/v1/plate-reader/',
    { method: 'POST', headers: { Authorization: `Token ${token}` }, body: form },
    20_000,
  );
  const raw = (data.results ?? []).flatMap((r) => [r.plate, ...(r.candidates ?? []).map((c) => c.plate)]);
  const valid = [...new Set(raw.map((p) => parseSpanishPlate(p)).filter((p) => p.valid).map((p) => p.normalized))];
  return { text: raw.join('\n').toUpperCase(), candidates: valid.length ? valid : raw.map((p) => p.toUpperCase()) };
}

export async function runOcr(kind: 'plate' | 'vin', imageBase64: string, mime?: string): Promise<OcrResponse> {
  const b64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
  if (kind === 'plate') {
    const token = env('PLATE_RECOGNIZER_TOKEN');
    if (token) {
      const r = await plateRecognizer(b64, token);
      return { kind, ...r, provider: 'Plate Recognizer' };
    }
    const text = await ocrSpaceText(b64, mime);
    return { kind, text, candidates: extractPlateCandidates(text), provider: 'OCR.space' };
  }
  const text = await ocrSpaceText(b64, mime);
  return { kind, text, candidates: extractVinCandidates(text), provider: 'OCR.space' };
}
