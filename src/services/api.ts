import type { MediaResponse, Genre, MediaDetails, Media, MergedGenre } from '../types';
import { config } from '../config';

const TMDB_DIRECT_URL = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'en-US';
const MAX_PAGE_LIMIT = 500;

// Evaluated per request so a tab left open past midnight keeps using the current date
const today = (): string => new Date().toISOString().split('T')[0];

// In production (deployed on Vercel), route through our serverless proxy at /api/tmdb.
// In development (localhost), call TMDB directly so you don't need `vercel dev`.
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

export const discoverRandom = async (
  mediaType: 'movie' | 'tv',
  genreIds: number[],
  genreMode: 'AND' | 'OR',
  minRating: number,
  yearFrom: number | null,
  yearTo: number | null,
  page: number
): Promise<MediaResponse> => {
  const safePage = Math.min(page, MAX_PAGE_LIMIT);
  const separator = genreMode === 'AND' ? ',' : '|';
  const params: QueryParams = {
    page: safePage,
    sort_by: 'popularity.desc',
    with_original_language: 'en',
    'vote_average.gte': minRating,
  };

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

export const fetchWheelCandidates = async (
  mediaType: 'movie' | 'tv' | 'both',
  genreIds: number[],
  genreMode: 'AND' | 'OR',
  minRating: number,
  yearFrom: number | null,
  yearTo: number | null,
  count: number = 12,
  allGenres: MergedGenre[] = [],
  selectedGenreNames: string[] = []
): Promise<Media[]> => {
  const results: Media[] = [];

  const resolveGenreIds = (type: 'movie' | 'tv'): number[] => {
    if (selectedGenreNames.length === 0) return [];
    return selectedGenreNames
      .map(name => {
        const g = allGenres.find(ag => ag.name === name);
        if (!g) return null;
        return type === 'movie' ? g.movieId : g.tvId;
      })
      .filter((id): id is number => id !== null);
  };

  for (let attempt = 0; attempt < 5 && results.length < count; attempt++) {
    const chosenType: 'movie' | 'tv' =
      mediaType === 'both'
        ? (Math.random() < 0.5 ? 'movie' : 'tv')
        : mediaType;

    const resolvedIds = selectedGenreNames.length > 0
      ? resolveGenreIds(chosenType)
      : genreIds;

    // First call to get total_pages
    const firstPage = await discoverRandom(
      chosenType, resolvedIds, genreMode, minRating, yearFrom, yearTo, 1
    );

    if (firstPage.total_pages === 0 || firstPage.total_results === 0) continue;

    const maxPage = Math.min(firstPage.total_pages, 100);
    const randomPage = Math.floor(Math.random() * maxPage) + 1;

    const pageData = randomPage === 1 ? firstPage :
      await discoverRandom(chosenType, resolvedIds, genreMode, minRating, yearFrom, yearTo, randomPage);

    const withPosters = pageData.results
      .filter(m => m.poster_path)
      .filter(m => !results.some(r => r.id === m.id));

    results.push(...withPosters);
  }

  // Shuffle and take desired count
  const shuffled = results.sort(() => Math.random() - 0.5).slice(0, count);

  // If fewer than count, pad with duplicates
  while (shuffled.length > 0 && shuffled.length < count) {
    shuffled.push(shuffled[shuffled.length % results.length]);
  }

  return shuffled;
};
