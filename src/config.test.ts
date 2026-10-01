import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL } from './api/constants';
import { readConfig } from './config';

describe('readConfig', () => {
  it('apiUrl из env: пробелы и хвостовые / обрезаются (Р-1, normalizeApiUrl из api/url)', () => {
    expect(
      readConfig({ VITE_DEFAULT_API_URL: '  https://1101.api.green-api.com///  ' }).defaultApiUrl,
    ).toBe('https://1101.api.green-api.com');
  });

  it('falls back to the default apiUrl and disabled history', () => {
    expect(readConfig({})).toEqual({ defaultApiUrl: DEFAULT_API_URL, featureHistory: false });
    expect(readConfig({ VITE_DEFAULT_API_URL: '   ' }).defaultApiUrl).toBe(DEFAULT_API_URL);
  });

  it('reads overrides from env', () => {
    expect(
      readConfig({
        VITE_DEFAULT_API_URL: 'https://1101.api.green-api.com/',
        VITE_FEATURE_HISTORY: 'TRUE',
      }),
    ).toEqual({ defaultApiUrl: 'https://1101.api.green-api.com', featureHistory: true });
  });

  it('enables history only for the literal "true"', () => {
    expect(readConfig({ VITE_FEATURE_HISTORY: '1' }).featureHistory).toBe(false);
    expect(readConfig({ VITE_FEATURE_HISTORY: 'false' }).featureHistory).toBe(false);
  });
});
