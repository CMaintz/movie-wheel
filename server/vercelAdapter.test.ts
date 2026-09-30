// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/tmdb/[...path]';

const fakeRes = () => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(body: string) {
      res.body = body;
      return res;
    },
  };
  return res;
};

const fakeReq = (url: string, headers: Record<string, string> = {}) =>
  ({
    method: 'GET',
    url,
    headers: { host: 'moviewheel.vercel.app', 'x-forwarded-proto': 'https', ...headers },
  }) as unknown as VercelRequest;

describe('Vercel adapter', () => {
  beforeEach(() => {
    vi.stubEnv('TMDB_API_KEY', 'server-key');
    vi.stubEnv('ALLOWED_ORIGINS', 'http://localhost:5173');
  });

  it('bridges the Node request/response to the proxy core', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = fakeRes();

    await handler(
      fakeReq('/api/tmdb/movie/603?path=movie&path=603&language=en-US', {
        origin: 'https://moviewheel.vercel.app',
      }),
      res as unknown as VercelResponse
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"ok":true}');
    expect(res.headers['access-control-allow-origin']).toBe('https://moviewheel.vercel.app');
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.pathname).toBe('/3/movie/603');
    expect(upstream.searchParams.has('path')).toBe(false);
    expect(upstream.searchParams.get('api_key')).toBe('server-key');
  });

  it('rejects foreign origins', async () => {
    const res = fakeRes();
    await handler(
      fakeReq('/api/tmdb/movie/603', { origin: 'https://evil.example' }),
      res as unknown as VercelResponse
    );
    expect(res.statusCode).toBe(403);
  });
});
