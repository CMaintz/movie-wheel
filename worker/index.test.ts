// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const ORIGIN = 'https://movie-wheel.example.workers.dev';

const makeEnv = (overrides: Partial<Env> = {}) => {
  const assets = vi.fn(async () => new Response('<html>app</html>', { status: 200 }));
  const env = {
    ASSETS: { fetch: assets },
    TMDB_API_KEY: 'server-key',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ...overrides,
  } as unknown as Env;
  return { env, assets };
};

const call = (path: string, env: Env, init: RequestInit = {}) =>
  worker.fetch(new Request(`${ORIGIN}${path}`, init) as never, env, {} as never);

describe('worker', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200 })));
  });

  it('serves the SPA from static assets for non-API paths', async () => {
    const { env, assets } = makeEnv();
    const res = await call('/some/route', env);
    expect(await res.text()).toBe('<html>app</html>');
    expect(assets).toHaveBeenCalledOnce();
  });

  it('proxies /api/tmdb with the secret key', async () => {
    const { env, assets } = makeEnv();
    const res = await call('/api/tmdb/genre/movie/list', env);
    expect(res.status).toBe(200);
    expect(assets).not.toHaveBeenCalled();
    const upstream = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(upstream.searchParams.get('api_key')).toBe('server-key');
  });

  it('uses the rate-limit binding when configured', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const { env } = makeEnv({ TMDB_RATE_LIMITER: { limit } as unknown as RateLimit });
    const res = await call('/api/tmdb/movie/603', env, { headers: { 'cf-connecting-ip': '4.4.4.4' } });
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '4.4.4.4' });
  });

  it('allows configured dev origins and rejects others', async () => {
    const { env } = makeEnv();
    const dev = await call('/api/tmdb/movie/603', env, { headers: { Origin: 'http://localhost:5173' } });
    const evil = await call('/api/tmdb/movie/603', env, { headers: { Origin: 'https://evil.example' } });
    expect(dev.status).toBe(200);
    expect(evil.status).toBe(403);
  });

  it('redirects the workers.dev host to the canonical host, keeping path and query', async () => {
    const { env, assets } = makeEnv({ CANONICAL_HOST: 'moviewheel.example' });
    const res = await call('/api/tmdb/movie/603?x=1', env);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://moviewheel.example/api/tmdb/movie/603?x=1');
    expect(assets).not.toHaveBeenCalled();
  });
});
