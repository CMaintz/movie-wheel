import { describe, expect, it, vi } from 'vitest';
import {
  discoverRandom,
  fetchWheelCandidates,
  getMediaDetails,
  getMergedGenres,
  getWatchProviders,
} from './api';

type Handler = (url: URL) => unknown;

const mockFetch = (handler: Handler) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const calledUrl = (fetchMock: ReturnType<typeof mockFetch>, call = 0) =>
  new URL(String(fetchMock.mock.calls[call][0]));

const rawMovie = (id: number, poster: string | null = `/p${id}.jpg`) => ({
  id,
  title: `Movie ${id}`,
  poster_path: poster,
  vote_average: 7,
});

describe('getMergedGenres', () => {
  it('merges movie and TV genres by name and sorts them', async () => {
    mockFetch(url =>
      url.pathname.endsWith('/genre/movie/list')
        ? { genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drama' }] }
        : { genres: [{ id: 18, name: 'Drama' }, { id: 10765, name: 'Sci-Fi & Fantasy' }] }
    );

    expect(await getMergedGenres()).toEqual([
      { name: 'Action', movieId: 28, tvId: null },
      { name: 'Drama', movieId: 18, tvId: 18 },
      { name: 'Sci-Fi & Fantasy', movieId: null, tvId: 10765 },
    ]);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(getMergedGenres()).rejects.toThrow('TMDB 401');
  });
});

describe('discoverRandom', () => {
  it('builds TMDB discover params and keeps genre pipes unencoded', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));

    await discoverRandom('movie', [28, 12], 'OR', 6.5, 1990, 2000, 3);

    const raw = String(fetchMock.mock.calls[0][0]);
    expect(raw).toContain('with_genres=28|12');
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/3/discover/movie');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('vote_average.gte')).toBe('6.5');
    expect(url.searchParams.get('primary_release_date.gte')).toBe('1990-01-01');
    expect(url.searchParams.get('with_release_type')).toBe('4|5|6');
    expect(url.searchParams.get('language')).toBe('en-US');
  });

  it('uses comma-separated genres for AND mode and TV date fields', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));

    await discoverRandom('tv', [18, 35], 'AND', 0, 2010, null, 1);

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get('with_genres')).toBe('18,35');
    expect(url.searchParams.get('first_air_date.gte')).toBe('2010-01-01');
    expect(url.searchParams.has('with_release_type')).toBe(false);
  });

  it('caps the requested page and reported total_pages at 500', async () => {
    const fetchMock = mockFetch(() => ({ page: 500, results: [], total_pages: 9000, total_results: 1 }));

    const res = await discoverRandom('movie', [], 'OR', 0, null, null, 1000);

    expect(calledUrl(fetchMock).searchParams.get('page')).toBe('500');
    expect(res.total_pages).toBe(500);
  });

  it('normalises TV names into title and tags the media type', async () => {
    mockFetch(() => ({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 1, name: 'Some Show', poster_path: '/x.jpg', vote_average: 8 }],
    }));

    const res = await discoverRandom('tv', [], 'OR', 0, null, null, 1);

    expect(res.results[0]).toMatchObject({ title: 'Some Show', media_type: 'tv' });
  });
});

describe('getMediaDetails', () => {
  it('requests appended credits/videos and normalises TV fields', async () => {
    const fetchMock = mockFetch(() => ({ id: 5, name: 'Show', first_air_date: '2020-02-02' }));

    const details = await getMediaDetails('tv', 5);

    expect(calledUrl(fetchMock).searchParams.get('append_to_response')).toBe(
      'credits,videos,external_ids'
    );
    expect(details).toMatchObject({ title: 'Show', release_date: '2020-02-02', media_type: 'tv' });
  });
});

describe('getWatchProviders', () => {
  it('returns the providers for the requested region', async () => {
    mockFetch(() => ({ results: { DK: { link: 'https://tmdb/dk' }, US: { link: 'https://tmdb/us' } } }));
    expect(await getWatchProviders('movie', 1, 'DK')).toEqual({ link: 'https://tmdb/dk' });
  });

  it('returns null when the region is missing or the request fails', async () => {
    mockFetch(() => ({ results: {} }));
    expect(await getWatchProviders('movie', 1, 'DK')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    expect(await getWatchProviders('movie', 1, 'DK')).toBeNull();
  });
});

describe('fetchWheelCandidates', () => {
  it('returns the requested count, only titles with posters', async () => {
    mockFetch(() => ({
      page: 1,
      total_pages: 1,
      total_results: 20,
      results: Array.from({ length: 20 }, (_, i) => rawMovie(i + 1, i % 4 === 0 ? null : `/p${i}.jpg`)),
    }));

    const res = await fetchWheelCandidates('movie', [], 'OR', 0, null, null, 12);

    expect(res).toHaveLength(12);
    expect(res.every(m => m.poster_path)).toBe(true);
    expect(new Set(res.map(m => m.id)).size).toBe(12);
  });

  it('pads with repeats when fewer unique titles exist', async () => {
    mockFetch(() => ({
      page: 1,
      total_pages: 1,
      total_results: 3,
      results: [rawMovie(1), rawMovie(2), rawMovie(3)],
    }));

    const res = await fetchWheelCandidates('movie', [], 'OR', 0, null, null, 12);

    expect(res).toHaveLength(12);
    expect(new Set(res.map(m => m.id))).toEqual(new Set([1, 2, 3]));
  });

  it('returns nothing when TMDB has no matches', async () => {
    mockFetch(() => ({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    expect(await fetchWheelCandidates('both', [], 'OR', 9.5, null, null, 12)).toEqual([]);
  });

  it('resolves selected genre names to per-media-type ids', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    const genres = [{ name: 'Drama', movieId: 18, tvId: 1818 }];

    await fetchWheelCandidates('tv', [], 'OR', 0, null, null, 12, genres, ['Drama']);

    expect(calledUrl(fetchMock).searchParams.get('with_genres')).toBe('1818');
  });
});
