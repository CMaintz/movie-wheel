import {
  createMemoryRateLimiter,
  handleTmdbProxy,
  parseAllowedOrigins,
  type RateLimiter,
} from '../server/tmdbProxy';

export interface Env {
  ASSETS: Fetcher;
  TMDB_API_KEY?: string;
  TMDB_READ_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  CANONICAL_HOST?: string;
  TMDB_RATE_LIMITER?: RateLimit;
}

const memoryLimiter = createMemoryRateLimiter({ limit: 60, windowMs: 60_000 });

// Cloudflare's rate-limit binding counts per location rather than per isolate; fall back to memory without it.
const rateLimiterFor = (env: Env): RateLimiter => {
  const binding = env.TMDB_RATE_LIMITER;
  if (!binding) return memoryLimiter;
  return async key => !(await binding.limit({ key })).success;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The old *.workers.dev address keeps working by redirecting to the custom domain.
    if (env.CANONICAL_HOST && url.hostname.endsWith('.workers.dev')) {
      url.hostname = env.CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    const { pathname } = url;
    if (pathname.startsWith('/api/')) {
      return handleTmdbProxy(request, {
        apiKey: env.TMDB_API_KEY ?? '',
        readToken: env.TMDB_READ_TOKEN,
        allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
        isRateLimited: rateLimiterFor(env),
      });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
