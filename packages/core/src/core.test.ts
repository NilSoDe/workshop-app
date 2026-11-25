import { describe, expect, it } from 'vitest';
import {
  computeCheckDigit,
  decodeVinLocal,
  detectQuery,
  extractPlateCandidates,
  extractVinCandidates,
  hasValidCheckDigit,
  normalizeVin,
  parseSpanishPlate,
} from './index';

describe('VIN', () => {
  it('valida el dígito de control (ejemplo oficial 49 CFR 565)', () => {
    expect(computeCheckDigit('1M8GDM9AXKP042788')).toBe('X');
    expect(hasValidCheckDigit('1M8GDM9AXKP042788')).toBe(true);
    expect(hasValidCheckDigit('1M8GDM9A1KP042788')).toBe(false);
  });

  it('normaliza confusiones de OCR', () => {
    expect(normalizeVin('vss zzz 5f-zkr o12345')).toBe('VSSZZZ5FZKR012345');
  });

  it('decodifica un VIN europeo sin exigir dígito de control', () => {
    const info = decodeVinLocal('VSSZZZ5FZKR123456');
    expect(info.valid).toBe(true);
    expect(info.country).toBe('España');
    expect(info.manufacturer).toBe('SEAT / CUPRA');
    expect(info.region).toBe('Europa');
    expect(info.checkDigitRequired).toBe(false);
    expect(info.modelYearCandidates).toContain(2019);
    expect(info.serialNumber).toBe('123456');
  });

  it('exige dígito de control en Norteamérica', () => {
    expect(decodeVinLocal('1M8GDM9AXKP042788').valid).toBe(true);
    expect(decodeVinLocal('1M8GDM9A1KP042788').valid).toBe(false);
    expect(decodeVinLocal('1M8GDM9AXKP042788').modelYearCandidates).toEqual([1989]);
  });

  it('rechaza longitudes incorrectas', () => {
    const info = decodeVinLocal('WVWZZZ1JZ');
    expect(info.valid).toBe(false);
    expect(info.warnings[0]).toMatch(/17 caracteres/);
  });

  it('extrae VIN de texto OCR con ruido', () => {
    const text = 'REPUBLICA ESPAÑOLA\nN° bastidor: WVW ZZZ 1KZ 8W 123456\nOtro: 12';
    expect(extractVinCandidates(text)[0]).toBe('WVWZZZ1KZ8W123456');
  });
});

describe('Matrícula española', () => {
  it('formato actual', () => {
    const p = parseSpanishPlate('1234 bcd');
    expect(p).toMatchObject({ valid: true, type: 'actual', normalized: '1234BCD', display: '1234 BCD' });
  });

  it('rechaza vocales en el formato actual', () => {
    expect(parseSpanishPlate('1234 ABC').valid).toBe(false);
  });

  it('formato provincial', () => {
    expect(parseSpanishPlate('M-1234-AB')).toMatchObject({ valid: true, type: 'provincial', province: 'Madrid' });
  });

  it('ciclomotor e histórico', () => {
    expect(parseSpanishPlate('C1234BCD').type).toBe('ciclomotor');
    expect(parseSpanishPlate('H 1234 BCD').type).toBe('historico');
  });

  it('extrae de texto OCR y corrige confusiones', () => {
    expect(extractPlateCandidates('E\nI234 BCD')).toContain('1234BCD');
    expect(extractPlateCandidates('foo\nE 9876 KLM\nbar')[0]).toBe('9876KLM');
  });
});

describe('detectQuery', () => {
  it('distingue VIN de matrícula', () => {
    expect(detectQuery('VSSZZZ5FZKR123456')).toEqual({ type: 'vin', value: 'VSSZZZ5FZKR123456' });
    expect(detectQuery('1234-BCD')).toEqual({ type: 'plate', value: '1234BCD' });
    expect(detectQuery('hola')).toBeNull();
  });
});
