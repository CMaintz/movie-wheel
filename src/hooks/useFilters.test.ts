import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFilters } from './useFilters';

const STORAGE_KEY = 'moviewheel_filters';

describe('useFilters', () => {
  it('starts from defaults', () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.state).toMatchObject({ mediaType: 'both', selectedGenres: [], genreMode: 'OR' });
  });

  it('toggles genres on and off', () => {
    const { result } = renderHook(() => useFilters());
    act(() => result.current.toggleGenre('Drama'));
    act(() => result.current.toggleGenre('Comedy'));
    act(() => result.current.toggleGenre('Drama'));
    expect(result.current.state.selectedGenres).toEqual(['Comedy']);
  });

  it('persists to and restores from localStorage', () => {
    const first = renderHook(() => useFilters());
    act(() => first.result.current.setMediaType('tv'));
    act(() => first.result.current.setMinRating(7.5));
    first.unmount();

    const second = renderHook(() => useFilters());
    expect(second.result.current.state).toMatchObject({ mediaType: 'tv', minRating: 7.5 });
  });

  it('ignores corrupt stored state', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useFilters());
    expect(result.current.state.mediaType).toBe('both');
  });

  it('resets to defaults', () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setGenreMode('AND');
      result.current.setYearFrom(1970);
      result.current.setYearTo(1980);
    });
    act(() => result.current.resetFilters());
    expect(result.current.state).toMatchObject({ genreMode: 'OR', yearFrom: 1995 });
  });
});
