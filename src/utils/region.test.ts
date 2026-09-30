import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_REGIONS, detectRegion, getStoredRegion, setStoredRegion } from './region';

const mockTimeZone = (timeZone: string) => {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone }) }) as Intl.DateTimeFormat
  );
};

describe('detectRegion', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Europe/Copenhagen', 'DK'],
    ['America/Los_Angeles', 'US'],
    ['Asia/Calcutta', 'IN'],
    ['Pacific/Auckland', 'NZ'],
  ])('maps %s to %s', (tz, country) => {
    mockTimeZone(tz);
    expect(detectRegion()).toBe(country);
  });

  it('falls back to US for unknown time zones', () => {
    mockTimeZone('Antarctica/Troll');
    expect(detectRegion()).toBe('US');
  });

  it('falls back to US when Intl throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(detectRegion()).toBe('US');
  });

  it('only ever returns supported regions', () => {
    mockTimeZone('Europe/Berlin');
    expect(SUPPORTED_REGIONS).toContain(detectRegion());
  });
});

describe('stored region', () => {
  it('prefers the stored region over detection', () => {
    setStoredRegion('SE');
    expect(getStoredRegion()).toBe('SE');
  });

  it('detects when nothing is stored', () => {
    mockTimeZone('Europe/Oslo');
    expect(getStoredRegion()).toBe('NO');
  });
});
