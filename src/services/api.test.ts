import { describe, expect, it, vi } from 'vitest';
import {
  buildGenreClauses,
  discoverRandom,
  fetchWheelCandidates,
  getMediaDetails,
  getMergedGenres,
  getWatchProviders,
} from './api';
import type { DiscoverQuery } from './api';
import type { FilterState } from '../hooks/useFilters';

type Handler = (url: URL) => unknown;

const mockFetch = (handler: Handler) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const query = (overrides: Partial<DiscoverQuery> = {}): DiscoverQuery => ({
  genreIds: [],
  genreMode: 'OR',
  minRating: 0,
  minVotes: 0,
  language: '',
  yearFrom: null,
  yearTo: null,
  ...overrides,
});

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({
  mediaType: 'movie',
  selectedGenres: [],
  genreMode: 'OR',
  selectedCombos: [],
  minRating: 0,
  minVotes: 0,
  language: '',
  yearFrom: 1995,
  yearTo: 2020,
  ...overrides,
});

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

    await discoverRandom('movie', query({ genreIds: [28, 12], minRating: 6.5, yearFrom: 1990, yearTo: 2000 }), 3);

    const raw = String(fetchMock.mock.calls[0][0]);
    expect(raw).toContain('with_genres=28|12');
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/3/discover/movie');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('vote_average.gte')).toBe('6.5');
    expect(url.searchParams.get('primary_release_date.gte')).toBe('1990-01-01');
    expect(url.searchParams.get('primary_release_date.lte')).toBe('2000-12-31');
    expect(url.searchParams.get('with_release_type')).toBe('4|5|6');
    expect(url.searchParams.get('language')).toBe('en-US');
  });

  it('adds the vote-count floor and original language only when set', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));

    await discoverRandom('movie', query({ minVotes: 250, language: 'da' }), 1);
    await discoverRandom('movie', query(), 1);

    expect(calledUrl(fetchMock, 0).searchParams.get('vote_count.gte')).toBe('250');
    expect(calledUrl(fetchMock, 0).searchParams.get('with_original_language')).toBe('da');
    expect(calledUrl(fetchMock, 1).searchParams.has('vote_count.gte')).toBe(false);
    expect(calledUrl(fetchMock, 1).searchParams.has('with_original_language')).toBe(false);
  });

  it('uses comma-separated genres for AND mode and TV date fields', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));

    await discoverRandom('tv', query({ genreIds: [18, 35], genreMode: 'AND', yearFrom: 2010 }), 1);

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get('with_genres')).toBe('18,35');
    expect(url.searchParams.get('first_air_date.gte')).toBe('2010-01-01');
    expect(url.searchParams.has('with_release_type')).toBe(false);
  });

  it('uses the current date for the release cut-off, not the date the module loaded', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
      await discoverRandom('movie', query(), 1);
      vi.setSystemTime(new Date('2030-01-02T12:00:00Z'));
      await discoverRandom('movie', query(), 1);
    } finally {
      vi.useRealTimers();
    }

    expect(calledUrl(fetchMock, 0).searchParams.get('primary_release_date.lte')).toBe('2030-01-01');
    expect(calledUrl(fetchMock, 1).searchParams.get('primary_release_date.lte')).toBe('2030-01-02');
  });

  it('never asks for releases after today, even with a future year filter', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, results: [], total_pages: 1, total_results: 0 }));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2030-06-15T12:00:00Z'));
      await discoverRandom('tv', query({ yearTo: 2031 }), 1);
      await discoverRandom('tv', query({ yearTo: 2020 }), 1);
    } finally {
      vi.useRealTimers();
    }

    expect(calledUrl(fetchMock, 0).searchParams.get('first_air_date.lte')).toBe('2030-06-15');
    expect(calledUrl(fetchMock, 1).searchParams.get('first_air_date.lte')).toBe('2020-12-31');
  });

  it('caps the requested page and reported total_pages at 500', async () => {
    const fetchMock = mockFetch(() => ({ page: 500, results: [], total_pages: 9000, total_results: 1 }));

    const res = await discoverRandom('movie', query(), 1000);

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

    const res = await discoverRandom('tv', query(), 1);

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

    const res = await fetchWheelCandidates(filters(), [], 12);

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

    const res = await fetchWheelCandidates(filters(), [], 12);

    expect(res).toHaveLength(12);
    expect(new Set(res.map(m => m.id))).toEqual(new Set([1, 2, 3]));
  });

  it('returns nothing when TMDB has no matches', async () => {
    mockFetch(() => ({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    expect(await fetchWheelCandidates(filters({ mediaType: 'both', minRating: 9.5 }), [], 12)).toEqual([]);
  });

  it('resolves selected genre names to per-media-type ids', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    const genres = [{ name: 'Drama', movieId: 18, tvId: 1818 }];

    await fetchWheelCandidates(filters({ mediaType: 'tv', selectedGenres: ['Drama'] }), genres, 12);

    expect(calledUrl(fetchMock).searchParams.get('with_genres')).toBe('1818');
  });
});

describe('buildGenreClauses', () => {
  const genres = [
    { name: 'Action', movieId: 28, tvId: null },
    { name: 'Action & Adventure', movieId: null, tvId: 10759 },
    { name: 'Comedy', movieId: 35, tvId: 35 },
    { name: 'Drama', movieId: 18, tvId: 18 },
    { name: 'Romance', movieId: 10749, tvId: null },
  ];

  it('matches any genre when nothing is selected', () => {
    expect(buildGenreClauses('movie', filters(), genres)).toEqual([{ genreIds: [], genreMode: 'OR' }]);
  });

  it('turns singles into one clause and each combo into its own AND clause', () => {
    const clauses = buildGenreClauses(
      'movie',
      filters({ selectedGenres: ['Drama'], selectedCombos: ['Rom-Com', 'Action Comedy'] }),
      genres
    );
    expect(clauses).toEqual([
      { genreIds: [18], genreMode: 'OR' },
      { genreIds: [10749, 35], genreMode: 'AND' },
      { genreIds: [28, 35], genreMode: 'AND' },
    ]);
  });

  it('uses the TV genre name for combos and drops combos TV has no genres for', () => {
    const clauses = buildGenreClauses('tv', filters({ selectedCombos: ['Rom-Com', 'Action Comedy'] }), genres);
    expect(clauses).toEqual([{ genreIds: [10759, 35], genreMode: 'AND' }]);
  });

  it('drops an AND clause when one of its genres is missing for the media type', () => {
    const f = filters({ selectedGenres: ['Romance', 'Comedy'], genreMode: 'AND' });
    expect(buildGenreClauses('tv', f, genres)).toEqual([]);
    expect(buildGenreClauses('tv', { ...f, genreMode: 'OR' }, genres)).toEqual([
      { genreIds: [35], genreMode: 'OR' },
    ]);
  });
});

describe('fetchWheelCandidates with combos', () => {
  it('queries a combo as an AND of both genres', async () => {
    const fetchMock = mockFetch(() => ({ page: 1, total_pages: 0, total_results: 0, results: [] }));
    const genres = [
      { name: 'Horror', movieId: 27, tvId: null },
      { name: 'Comedy', movieId: 35, tvId: 35 },
    ];

    await fetchWheelCandidates(filters({ selectedCombos: ['Horror Comedy'] }), genres, 12);

    expect(calledUrl(fetchMock).searchParams.get('with_genres')).toBe('27,35');
  });

  it('skips fetching when no selection can match the media type', async () => {
    const fetchMock = mockFetch(() => ({}));
    const genres = [{ name: 'Romance', movieId: 10749, tvId: null }];

    const res = await fetchWheelCandidates(filters({ mediaType: 'tv', selectedGenres: ['Romance'] }), genres, 12);

    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
