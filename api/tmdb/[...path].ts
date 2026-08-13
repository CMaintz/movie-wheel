import type { VercelRequest, VercelResponse } from '@vercel/node';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_READ_TOKEN = process.env.TMDB_READ_TOKEN || '';

// Rate limiting: simple in-memory sliding window per IP
const requestLog = new Map<string, number[]>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const timestamps = requestLog.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT;
};

// Allowed TMDB paths (prevent abuse of the proxy as a general-purpose TMDB relay)
const ALLOWED_PATH_PREFIXES = [
  '/genre/',
  '/discover/',
  '/movie/',
  '/tv/',
];

const isAllowedPath = (path: string): boolean =>
  ALLOWED_PATH_PREFIXES.some(prefix => path.startsWith(prefix));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS - allow same origin only in production, permissive in dev
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Use-Bearer');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  // Extract TMDB path from catch-all
  const pathSegments = req.query.path;
  if (!pathSegments || !Array.isArray(pathSegments)) {
    return res.status(400).json({ error: 'Missing path' });
  }
  const tmdbPath = '/' + pathSegments.join('/');

  if (!isAllowedPath(tmdbPath)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  // Build TMDB URL, injecting API key server-side
  const url = new URL(`${TMDB_BASE}${tmdbPath}`);

  // Copy query params from the request (except api_key - we inject our own)
  const queryString = req.url?.split('?')[1];
  if (queryString) {
    const params = new URLSearchParams(queryString);
    // Remove catch-all path param that Vercel adds
    params.delete('path');
    for (const [key, value] of params) {
      if (key !== 'api_key') {
        url.searchParams.set(key, value);
      }
    }
  }

  // Decide auth method: bearer token or API key
  const useBearer = req.headers['x-use-bearer'] === 'true' && TMDB_READ_TOKEN;

  if (!useBearer) {
    url.searchParams.set('api_key', TMDB_API_KEY);
  }

  try {
    const headers: Record<string, string> = {};
    if (useBearer) {
      headers['Authorization'] = `Bearer ${TMDB_READ_TOKEN}`;
    }

    const tmdbRes = await fetch(url.toString(), { headers });

    // Pass through TMDB's status code and JSON body
    const data = await tmdbRes.json();

    // Cache successful responses for 5 minutes at the edge
    if (tmdbRes.ok) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    }

    return res.status(tmdbRes.status).json(data);
  } catch (err) {
    console.error('TMDB proxy error:', err);
    return res.status(502).json({ error: 'Failed to reach TMDB' });
  }
}
