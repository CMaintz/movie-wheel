import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWheel } from './useWheel';
import { fetchWheelCandidates } from '../services/api';
import type { FilterState } from './useFilters';
import type { Media } from '../types';

vi.mock('../services/api', () => ({ fetchWheelCandidates: vi.fn() }));

class InstantImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  set src(url: string) {
    queueMicrotask(() => (url.includes('broken') ? this.onerror?.() : this.onload?.()));
  }
}

const filters: FilterState = {
  mediaType: 'movie',
  selectedGenres: ['Drama'],
  genreMode: 'OR',
  selectedCombos: [],
  minRating: 6,
  minVotes: 100,
  language: 'en',
  yearFrom: 1990,
  yearTo: 2000,
};

const movie = (id: number, poster = `/p${id}.jpg`) =>
  ({ id, title: `Movie ${id}`, poster_path: poster, media_type: 'movie' }) as Media;

describe('useWheel', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', InstantImage);
  });

  it('loads candidates, preloads posters and picks a winner from them', async () => {
    const movies = Array.from({ length: 12 }, (_, i) => movie(i + 1, i === 3 ? '/broken.jpg' : `/p${i}.jpg`));
    vi.mocked(fetchWheelCandidates).mockResolvedValue(movies);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const { result } = renderHook(() => useWheel());
    await act(() => result.current.spin(filters, []));

    expect(fetchWheelCandidates).toHaveBeenCalledWith(filters, [], 12);
    expect(result.current.wheelState).toBe('spinning');
    expect(result.current.isSpinning).toBe(true);
    expect(result.current.winnerIndex).toBe(6);
    expect(result.current.winnerMedia).toBe(movies[6]);
    expect(result.current.segments[0]).toMatchObject({
      id: 1,
      posterUrl: 'https://image.tmdb.org/t/p/w185/p0.jpg',
    });
    expect(result.current.images.current).toHaveLength(12);
    expect(result.current.images.current[3]).toBeNull();

    act(() => result.current.onSpinComplete());
    expect(result.current.wheelState).toBe('stopped');
  });

  it('reports an empty result without spinning', async () => {
    vi.mocked(fetchWheelCandidates).mockResolvedValue([]);

    const { result } = renderHook(() => useWheel());
    await act(() => result.current.spin(filters, []));

    expect(result.current.wheelState).toBe('idle');
    expect(result.current.error).toMatch(/No movies found/);
  });

  it('reports fetch failures and recovers on reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetchWheelCandidates).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useWheel());
    await act(() => result.current.spin(filters, []));
    expect(result.current.error).toMatch(/Something went wrong/);

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(result.current.segments.every(s => s.title === '?')).toBe(true);
  });
});
