import { useState, useCallback, useEffect } from 'react';

export type MediaTypeFilter = 'movie' | 'tv' | 'both';
export type GenreMode = 'AND' | 'OR';

export interface FilterState {
  mediaType: MediaTypeFilter;
  selectedGenres: string[];
  genreMode: GenreMode;
  minRating: number;
  yearFrom: number;
  yearTo: number;
}

const STORAGE_KEY = 'moviewheel_filters';
const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_FILTERS: FilterState = {
  mediaType: 'both',
  selectedGenres: [],
  genreMode: 'OR',
  minRating: 6.0,
  yearFrom: 1995,
  yearTo: CURRENT_YEAR,
};

const loadFilters = (): FilterState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_FILTERS;
};

export const useFilters = () => {
  const [state, setState] = useState<FilterState>(loadFilters);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setMediaType = useCallback((mediaType: MediaTypeFilter) => {
    setState(s => ({ ...s, mediaType }));
  }, []);

  const toggleGenre = useCallback((genre: string) => {
    setState(s => ({
      ...s,
      selectedGenres: s.selectedGenres.includes(genre)
        ? s.selectedGenres.filter(g => g !== genre)
        : [...s.selectedGenres, genre],
    }));
  }, []);

  const setGenreMode = useCallback((genreMode: GenreMode) => {
    setState(s => ({ ...s, genreMode }));
  }, []);

  const setMinRating = useCallback((minRating: number) => {
    setState(s => ({ ...s, minRating }));
  }, []);

  const setYearFrom = useCallback((yearFrom: number) => {
    setState(s => ({ ...s, yearFrom }));
  }, []);

  const setYearTo = useCallback((yearTo: number) => {
    setState(s => ({ ...s, yearTo }));
  }, []);

  const resetFilters = useCallback(() => {
    setState(DEFAULT_FILTERS);
  }, []);

  return {
    state,
    setMediaType,
    toggleGenre,
    setGenreMode,
    setMinRating,
    setYearFrom,
    setYearTo,
    resetFilters,
  };
};
