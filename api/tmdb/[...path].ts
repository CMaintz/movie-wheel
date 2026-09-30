import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createMemoryRateLimiter,
  handleTmdbProxy,
  parseAllowedOrigins,
} from '../../server/tmdbProxy.js';

const isRateLimited = createMemoryRateLimiter({ limit: 60, windowMs: 60_000 });
const FORWARDED_HEADERS = ['origin', 'x-use-bearer', 'x-forwarded-for'];

// Thin adapter: converts Vercel's Node request into a Fetch Request for the shared proxy core.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);
  url.searchParams.delete('path'); // injected by the [...path] catch-all route

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name];
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  const response = await handleTmdbProxy(new Request(url, { method: req.method, headers }), {
    apiKey: process.env.TMDB_API_KEY ?? '',
    readToken: process.env.TMDB_READ_TOKEN,
    allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    isRateLimited,
  });

  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status).send(await response.text());
}
