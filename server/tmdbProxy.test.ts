// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  clientKey,
  createMemoryRateLimiter,
  handleTmdbProxy,
  isAllowedPath,
  parseAllowedOrigins,
  type ProxyOptions,
} from './tmdbProxy';

const SELF = 'https://moviewheel.example.dev';

const upstreamOk = () =>
  vi.fn<typeof fetch>(async () =>
    new Response('{"genres":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  );

const setup = (overrides: Partial<ProxyOptions> = {}) => {
  const fetchMock = upstreamOk();
  const options: ProxyOptions = {
    apiKey: 'server-key',
    readToken: 'server-token',
    allowedOrigins: ['http://localhost:5173'],
    isRateLimited: () => false,
    fetch: fetchMock,
    ...overrides,
  };
  const call = (path: string, init: RequestInit = {}) =>
    handleTmdbProxy(new Request(`${SELF}${path}`, init), options);
  const upstreamUrl = () => new URL(String(fetchMock.mock.calls[0][0]));
  return { call, fetchMock, upstreamUrl };
};

describe('isAllowedPath', () => {
  it.each(['/genre/movie/list', '/discover/tv', '/movie/603', '/tv/1399/watch/providers'])(
    'allows %s',
    path => expect(isAllowedPath(path)).toBe(true)
  );

  it.each([
    '/account/123',
    '/search/movie',
    '/movie',
    '/movie/../account',
    '/movie/%2e%2e/account',
    '/movie//603',
    'movie/603',
    '/movie/603?x=1',
  ])('rejects %s', path => expect(isAllowedPath(path)).toBe(false));
});

describe('parseAllowedOrigins', () => {
  it('splits, trims and drops trailing slashes', () => {
    expect(parseAllowedOrigins(' http://localhost:5173/, https://a.dev ,,')).toEqual([
      'http://localhost:5173',
      'https://a.dev',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe('createMemoryRateLimiter', () => {
  it('limits each key within the window and recovers after it', () => {
    let now = 0;
    const limited = createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => now });

    expect([limited('a'), limited('a'), limited('a')]).toEqual([false, false, true]);
    expect(limited('b')).toBe(false);

    now = 1001;
    expect(limited('a')).toBe(false);
  });
});

describe('clientKey', () => {
  it('prefers the Cloudflare client IP, then the first forwarded address', () => {
    const cf = new Request(SELF, { headers: { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } });
    const xff = new Request(SELF, { headers: { 'x-forwarded-for': '2.2.2.2, 10.0.0.1' } });
    expect(clientKey(cf)).toBe('1.1.1.1');
    expect(clientKey(xff)).toBe('2.2.2.2');
    expect(clientKey(new Request(SELF))).toBe('unknown');
  });
});

describe('handleTmdbProxy', () => {
  it('forwards allowed GETs with the server-side key, dropping any client api_key', async () => {
    const { call, upstreamUrl } = setup();

    const res = await call('/api/tmdb/genre/movie/list?language=en-US&api_key=stolen');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ genres: [] });
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');
    const url = upstreamUrl();
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/genre/movie/list');
    expect(url.searchParams.getAll('api_key')).toEqual(['server-key']);
    expect(url.searchParams.get('language')).toBe('en-US');
  });

  it('keeps pipe-separated genre lists intact', async () => {
    const { call, upstreamUrl } = setup();
    await call('/api/tmdb/discover/movie?with_genres=28|12');
    expect(upstreamUrl().searchParams.get('with_genres')).toBe('28|12');
  });

  it('uses the bearer token when asked and one is configured', async () => {
    const { call, fetchMock, upstreamUrl } = setup();

    await call('/api/tmdb/movie/603/watch/providers', { headers: { 'X-Use-Bearer': 'true' } });

    expect(upstreamUrl().searchParams.has('api_key')).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer server-token' });
  });

  it('falls back to the API key when no bearer token is configured', async () => {
    const { call, upstreamUrl } = setup({ readToken: '' });
    await call('/api/tmdb/movie/603/watch/providers', { headers: { 'X-Use-Bearer': 'true' } });
    expect(upstreamUrl().searchParams.get('api_key')).toBe('server-key');
  });

  describe('origin checks', () => {
    it('serves requests without an Origin header (same-origin GET) without CORS headers', async () => {
      const res = await setup().call('/api/tmdb/movie/603');
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it.each([SELF, 'http://localhost:5173'])('echoes the allowed origin %s', async origin => {
      const res = await setup().call('/api/tmdb/movie/603', { headers: { Origin: origin } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('rejects foreign origins before touching TMDB', async () => {
      const { call, fetchMock } = setup();
      const res = await call('/api/tmdb/movie/603', { headers: { Origin: 'https://evil.example' } });
      expect(res.status).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers preflight for allowed origins', async () => {
      const res = await setup().call('/api/tmdb/movie/603', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Use-Bearer');
    });
  });

  it.each([
    ['POST', '/api/tmdb/movie/603', 405],
    ['GET', '/api/tmdb/account/1', 403],
    ['GET', '/api/other', 404],
  ])('%s %s responds %i', async (method, path, status) => {
    const { call, fetchMock } = setup();
    const res = await call(path, { method });
    expect(res.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    const isRateLimited = vi.fn(async () => true);
    const res = await setup({ isRateLimited }).call('/api/tmdb/movie/603', {
      headers: { 'cf-connecting-ip': '3.3.3.3' },
    });
    expect(res.status).toBe(429);
    expect(isRateLimited).toHaveBeenCalledWith('3.3.3.3');
  });

  it('refuses to proxy without credentials', async () => {
    const res = await setup({ apiKey: '' }).call('/api/tmdb/movie/603');
    expect(res.status).toBe(500);
  });

  it('passes through TMDB error statuses without caching them', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"status_code":34}', { status: 404 }));
    const res = await setup({ fetch: fetchMock }).call('/api/tmdb/movie/0');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('maps network failures to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNRESET');
    });
    const res = await setup({ fetch: fetchMock }).call('/api/tmdb/movie/603');
    expect(res.status).toBe(502);
  });
});
