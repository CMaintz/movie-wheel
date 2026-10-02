import { useState, useCallback, useEffect } from 'react';

export type MediaTypeFilter = 'movie' | 'tv' | 'both';
export type GenreMode = 'AND' | 'OR';

export interface FilterState {
  mediaType: MediaTypeFilter;
  selectedGenres: string[];
  genreMode: GenreMode;
  selectedCombos: string[];
  minRating: number;
  minVotes: number;
  language: string;
  yearFrom: number;
  yearTo: number;
}

const STORAGE_KEY = 'moviewheel_filters';
const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_FILTERS: FilterState = {
  mediaType: 'both',
  selectedGenres: [],
  genreMode: 'OR',
  selectedCombos: [],
  minRating: 6.0,
  minVotes: 100,
  language: 'en',
  yearFrom: 1995,
  yearTo: CURRENT_YEAR,
};

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter(i => i !== item) : [...list, item];

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
    setState(s => ({ ...s, selectedGenres: toggle(s.selectedGenres, genre) }));
  }, []);

  const toggleCombo = useCallback((combo: string) => {
    setState(s => ({ ...s, selectedCombos: toggle(s.selectedCombos, combo) }));
  }, []);

  const setGenreMode = useCallback((genreMode: GenreMode) => {
    setState(s => ({ ...s, genreMode }));
  }, []);

  const setMinRating = useCallback((minRating: number) => {
    setState(s => ({ ...s, minRating }));
  }, []);

  const setMinVotes = useCallback((minVotes: number) => {
    setState(s => ({ ...s, minVotes }));
  }, []);

  const setLanguage = useCallback((language: string) => {
    setState(s => ({ ...s, language }));
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
    toggleCombo,
    setGenreMode,
    setMinRating,
    setMinVotes,
    setLanguage,
    setYearFrom,
    setYearTo,
    resetFilters,
  };
};
