import type { MediaResponse, Genre, MediaDetails, Media, MergedGenre } from '../types';
import { config } from '../config';
import type { FilterState, GenreMode } from '../hooks/useFilters';
import { GENRE_COMBOS, resolveCombo } from '../utils/genreCombos';

const TMDB_DIRECT_URL = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'en-US';
const MAX_PAGE_LIMIT = 500;

// Evaluated per request so a tab left open past midnight keeps using the current date
const today = (): string => new Date().toISOString().split('T')[0];

// In production, route through the Worker proxy at /api/tmdb.
// In development (localhost), call TMDB directly so you don't need `wrangler dev`.
const USE_PROXY = import.meta.env.PROD;
const BASE_URL = USE_PROXY ? '/api/tmdb' : TMDB_DIRECT_URL;

// --- Fetch helpers ---

// URLSearchParams encodes | as %7C; TMDB expects literal pipes
type QueryParams = Record<string, string | number | null | undefined>;

// Raw TMDB list/detail items: movies carry title/release_date, TV carries name/first_air_date
type RawMedia = Omit<Media, 'title' | 'media_type'> & {
  title?: string;
  name?: string;
  first_air_date?: string;
};

type RawMediaDetails = Omit<MediaDetails, 'title' | 'media_type'> & {
  title?: string;
  name?: string;
  first_air_date?: string;
};

const serializeParams = (p: URLSearchParams): string => p.toString().replace(/%7C/gi, '|');

const buildParams = (extra: QueryParams = {}): string => {
  const p = new URLSearchParams();
  // Only include api_key when calling TMDB directly (dev mode).
  // In production the proxy injects it server-side.
  if (!USE_PROXY) {
    p.set('api_key', config.tmdbApiKey);
  }
  p.set('language', DEFAULT_LANGUAGE);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  return serializeParams(p);
};

const tmdbGet = async <T>(path: string, params: QueryParams = {}): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}?${buildParams(params)}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
};

const tmdbGetBearer = async <T>(path: string, params: QueryParams = {}): Promise<T> => {
  const p = new URLSearchParams({ language: DEFAULT_LANGUAGE });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }

  if (USE_PROXY) {
    // Tell our proxy to use the bearer token instead of API key
    const res = await fetch(`${BASE_URL}${path}?${serializeParams(p)}`, {
      headers: { 'X-Use-Bearer': 'true' },
    });
    if (!res.ok) throw new Error(`TMDB Bearer ${res.status}: ${path}`);
    return res.json();
  }

  // Dev mode: call TMDB directly with bearer token
  const res = await fetch(`${TMDB_DIRECT_URL}${path}?${serializeParams(p)}`, {
    headers: { Authorization: `Bearer ${config.tmdbReadToken}` },
  });
  if (!res.ok) throw new Error(`TMDB Bearer ${res.status}: ${path}`);
  return res.json();
};

// --- Genres ---

export const getGenres = async (mediaType: 'movie' | 'tv'): Promise<Genre[]> => {
  const data = await tmdbGet<{ genres: Genre[] }>(`/genre/${mediaType}/list`);
  return data.genres;
};

export const getMergedGenres = async (): Promise<MergedGenre[]> => {
  const [movieGenres, tvGenres] = await Promise.all([
    getGenres('movie'),
    getGenres('tv'),
  ]);

  const map = new Map<string, MergedGenre>();

  for (const g of movieGenres) {
    map.set(g.name, { name: g.name, movieId: g.id, tvId: null });
  }
  for (const g of tvGenres) {
    const existing = map.get(g.name);
    if (existing) {
      existing.tvId = g.id;
    } else {
      map.set(g.name, { name: g.name, movieId: null, tvId: g.id });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

// --- Media details ---

export const getMediaDetails = async (
  mediaType: 'movie' | 'tv',
  id: number
): Promise<MediaDetails> => {
  const data = await tmdbGet<RawMediaDetails>(`/${mediaType}/${id}`, {
    append_to_response: 'credits,videos,external_ids',
  });

  return {
    ...data,
    media_type: mediaType,
    title: data.title ?? data.name ?? '',
    release_date: data.release_date || data.first_air_date,
  };
};

// --- Watch providers ---

export interface WatchProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface WatchProvidersResult {
  flatrate?: WatchProviderEntry[];
  buy?: WatchProviderEntry[];
  rent?: WatchProviderEntry[];
  link?: string;
}

export const getWatchProviders = async (
  mediaType: 'movie' | 'tv',
  id: number,
  region: string = 'US'
): Promise<WatchProvidersResult | null> => {
  if (!USE_PROXY && !config.tmdbReadToken) {
    // Dev mode without a read token: fall back to API key method
    try {
      const data = await tmdbGet<{ results: Record<string, WatchProvidersResult> }>(
        `/${mediaType}/${id}/watch/providers`
      );
      return data.results?.[region] ?? null;
    } catch {
      return null;
    }
  }
  try {
    const data = await tmdbGetBearer<{ results: Record<string, WatchProvidersResult> }>(
      `/${mediaType}/${id}/watch/providers`
    );
    return data.results?.[region] ?? null;
  } catch {
    return null;
  }
};

// --- Discover / Random ---

export interface DiscoverQuery {
  genreIds: number[];
  genreMode: GenreMode;
  minRating: number;
  minVotes: number;
  language: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export const discoverRandom = async (
  mediaType: 'movie' | 'tv',
  query: DiscoverQuery,
  page: number
): Promise<MediaResponse> => {
  const { genreIds, genreMode, minRating, minVotes, language, yearFrom, yearTo } = query;
  const safePage = Math.min(page, MAX_PAGE_LIMIT);
  const separator = genreMode === 'AND' ? ',' : '|';
  const params: QueryParams = {
    page: safePage,
    sort_by: 'popularity.desc',
    'vote_average.gte': minRating,
  };

  if (minVotes > 0) params['vote_count.gte'] = minVotes;
  if (language) params.with_original_language = language;

  if (genreIds.length > 0) {
    params.with_genres = genreIds.join(separator);
  }

  const dateGte = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const dateLte = mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';

  const todayIso = today();
  if (yearFrom) params[dateGte] = `${yearFrom}-01-01`;

  const yearToCap = yearTo ? `${yearTo}-12-31` : todayIso;
  params[dateLte] = yearToCap < todayIso ? yearToCap : todayIso;

  // Movies: only digital/physical/TV releases, i.e. watchable at home rather than in cinemas
  if (mediaType === 'movie') params.with_release_type = '4|5|6';

  const data = await tmdbGet<Omit<MediaResponse, 'results'> & { results: RawMedia[] }>(
    `/discover/${mediaType}`,
    params
  );

  if (data.total_pages > MAX_PAGE_LIMIT) data.total_pages = MAX_PAGE_LIMIT;

  const results: Media[] = data.results.map(item => ({
    ...item,
    media_type: mediaType,
    title: item.title ?? item.name ?? '',
  }));

  return { ...data, results };
};

// --- Fetch wheel candidates ---

interface GenreClause {
  genreIds: number[];
  genreMode: GenreMode;
}

// Selected single genres form one clause and each combo forms its own AND clause.
// A title qualifies if it matches any clause. Clauses TMDB can't express for this
// media type are dropped; an empty result means nothing can match.
export const buildGenreClauses = (
  type: 'movie' | 'tv',
  filters: Pick<FilterState, 'selectedGenres' | 'selectedCombos' | 'genreMode'>,
  allGenres: MergedGenre[]
): GenreClause[] => {
  const { selectedGenres, selectedCombos, genreMode } = filters;
  if (selectedGenres.length === 0 && selectedCombos.length === 0) {
    return [{ genreIds: [], genreMode: 'OR' }];
  }

  const clauses: GenreClause[] = [];

  if (selectedGenres.length > 0) {
    const ids = selectedGenres.map(name => {
      const g = allGenres.find(ag => ag.name === name);
      return g ? (type === 'movie' ? g.movieId : g.tvId) : null;
    });
    const resolved = ids.filter((id): id is number => id !== null);
    const satisfiable = genreMode === 'OR' ? resolved.length > 0 : resolved.length === ids.length;
    if (satisfiable) clauses.push({ genreIds: resolved, genreMode });
  }

  for (const name of selectedCombos) {
    const combo = GENRE_COMBOS.find(c => c.name === name);
    const ids = combo ? resolveCombo(combo, type, allGenres) : null;
    if (ids) clauses.push({ genreIds: ids, genreMode: 'AND' });
  }

  return clauses;
};

const MAX_SELECTIONS_PER_SPIN = 6;

const shuffle = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const fetchWheelCandidates = async (
  filters: FilterState,
  allGenres: MergedGenre[] = [],
  count: number = 12
): Promise<Media[]> => {
  const types: Array<'movie' | 'tv'> = filters.mediaType === 'both' ? ['movie', 'tv'] : [filters.mediaType];
  const options = types.flatMap(type =>
    buildGenreClauses(type, filters, allGenres).map(clause => ({ type, clause }))
  );
  if (options.length === 0) return [];

  const results: Media[] = [];

  // Visit every selection (up to a cap) before stopping, otherwise the first page fills the
  // wheel and multiple combos or "both" media types never actually mix
  const order = shuffle(options);
  const mustVisit = Math.min(order.length, MAX_SELECTIONS_PER_SPIN);
  const maxAttempts = Math.max(5, mustVisit);

  for (let attempt = 0; attempt < maxAttempts && (attempt < mustVisit || results.length < count); attempt++) {
    const { type, clause } = order[attempt % order.length];
    const query: DiscoverQuery = {
      ...clause,
      minRating: filters.minRating,
      minVotes: filters.minVotes,
      language: filters.language,
      yearFrom: filters.yearFrom,
      yearTo: filters.yearTo,
    };

    // First call to get total_pages
    const firstPage = await discoverRandom(type, query, 1);

    if (firstPage.total_pages === 0 || firstPage.total_results === 0) continue;

    const maxPage = Math.min(firstPage.total_pages, 100);
    const randomPage = Math.floor(Math.random() * maxPage) + 1;

    const pageData = randomPage === 1 ? firstPage : await discoverRandom(type, query, randomPage);

    const withPosters = pageData.results
      .filter(m => m.poster_path)
      .filter(m => !results.some(r => r.id === m.id));

    results.push(...withPosters);
  }

  const picked = shuffle(results).slice(0, count);

  // If fewer than count, pad with repeats
  const unique = picked.length;
  while (unique > 0 && picked.length < count) {
    picked.push(picked[picked.length % unique]);
  }

  return picked;
};
