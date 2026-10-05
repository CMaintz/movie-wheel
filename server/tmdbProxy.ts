// Platform-neutral TMDB proxy: uses only the Fetch API (Request/Response), so it runs behind
// the Cloudflare Worker entry and is testable under Node.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const PROXY_PREFIX = '/api/tmdb';

const ALLOWED_ROOTS = new Set(['genre', 'discover', 'movie', 'tv']);
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface RateLimiter {
  (key: string): boolean | Promise<boolean>;
}

export interface ProxyOptions {
  apiKey: string;
  readToken?: string;
  /** Cross-origin callers allowed in addition to the proxy's own origin (e.g. the Vite dev server). */
  allowedOrigins?: readonly string[];
  isRateLimited: RateLimiter;
  fetch?: typeof fetch;
}

/** Only read-only TMDB resources the app uses; each segment must be a plain token (no `..`, no encoding tricks). */
export const isAllowedPath = (path: string): boolean => {
  if (!path.startsWith('/')) return false;
  const segments = path.slice(1).split('/');
  return (
    segments.length >= 2 &&
    ALLOWED_ROOTS.has(segments[0]) &&
    segments.every(segment => SAFE_SEGMENT.test(segment))
  );
};

export const parseAllowedOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

/**
 * Sliding-window limiter held in memory. State is per process/isolate: on serverless platforms each
 * instance counts separately, so this bounds abuse per instance rather than globally.
 */
export const createMemoryRateLimiter = ({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter => {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  return (key: string) => {
    const t = now();
    if (t - lastSweep > windowMs) {
      for (const [k, stamps] of hits) {
        if (stamps.every(s => t - s >= windowMs)) hits.delete(k);
      }
      lastSweep = t;
    }
    const recent = (hits.get(key) ?? []).filter(s => t - s < windowMs);
    recent.push(t);
    hits.set(key, recent);
    return recent.length > limit;
  };
};

export const clientKey = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const handleTmdbProxy = async (request: Request, options: ProxyOptions): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  // Same-origin GETs usually carry no Origin header; any Origin present must be ours or allow-listed.
  const originAllowed =
    origin === null || origin === url.origin || (options.allowedOrigins ?? []).includes(origin);
  if (!originAllowed) {
    return json(403, { error: 'Origin not allowed' }, { Vary: 'Origin' });
  }

  const cors: Record<string, string> = { Vary: 'Origin' };
  if (origin !== null) {
    cors['Access-Control-Allow-Origin'] = origin;
    cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    cors['Access-Control-Allow-Headers'] = 'Content-Type, X-Use-Bearer';
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed' }, { ...cors, Allow: 'GET, OPTIONS' });
  }

  if (await options.isRateLimited(clientKey(request))) {
    return json(429, { error: 'Too many requests. Try again in a minute.' }, { ...cors, 'Retry-After': '60' });
  }

  if (!url.pathname.startsWith(`${PROXY_PREFIX}/`)) {
    return json(404, { error: 'Not found' }, cors);
  }
  const tmdbPath = url.pathname.slice(PROXY_PREFIX.length);
  if (!isAllowedPath(tmdbPath)) {
    return json(403, { error: 'Path not allowed' }, cors);
  }

  if (!options.apiKey) {
    return json(500, { error: 'Proxy is missing its TMDB credentials' }, cors);
  }

  const upstream = new URL(`${TMDB_BASE}${tmdbPath}`);
  for (const [key, value] of url.searchParams) {
    if (key !== 'api_key') upstream.searchParams.append(key, value);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const useBearer = request.headers.get('X-Use-Bearer') === 'true' && Boolean(options.readToken);
  if (useBearer) {
    headers.Authorization = `Bearer ${options.readToken}`;
  } else {
    upstream.searchParams.set('api_key', options.apiKey);
  }

  try {
    const doFetch = options.fetch ?? fetch;
    const res = await doFetch(upstream.toString(), { headers });
    const responseHeaders: Record<string, string> = {
      ...cors,
      'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
    };
    if (res.ok) {
      responseHeaders['Cache-Control'] = 'public, max-age=300, s-maxage=300, stale-while-revalidate=600';
    }
    return new Response(await res.text(), { status: res.status, headers: responseHeaders });
  } catch (err) {
    console.error('TMDB proxy error:', err);
    return json(502, { error: 'Failed to reach TMDB' }, cors);
  }
};
