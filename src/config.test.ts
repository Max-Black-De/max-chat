import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL } from './api/constants';
import { normalizeApiUrl, readConfig } from './config';

describe('normalizeApiUrl', () => {
  it('strips whitespace and trailing slashes (Р-1)', () => {
    expect(normalizeApiUrl('  https://1101.api.green-api.com///  ')).toBe(
      'https://1101.api.green-api.com',
    );
  });

  it('keeps a url without trailing slash unchanged', () => {
    expect(normalizeApiUrl('https://api.green-api.com')).toBe('https://api.green-api.com');
  });
});

describe('readConfig', () => {
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
