import { useState, useRef, useCallback } from 'react';
import type { Media, WheelSegmentData, MergedGenre } from '../types';
import { fetchWheelCandidates } from '../services/api';
import type { FilterState } from './useFilters';

export type WheelState = 'idle' | 'loading' | 'spinning' | 'stopped';
const SEGMENT_COUNT = 12;
const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

const createEmptySegments = (): WheelSegmentData[] =>
  Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
    id: i,
    title: '?',
    posterUrl: null,
    mediaType: 'movie' as const,
  }));

const preloadImages = (urls: (string | null)[]): Promise<(HTMLImageElement | null)[]> =>
  Promise.all(
    urls.map(url => {
      if (!url) return Promise.resolve(null);
      return new Promise<HTMLImageElement | null>(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    })
  );

export const useWheel = () => {
  const [wheelState, setWheelState] = useState<WheelState>('idle');
  const [segments, setSegments] = useState<WheelSegmentData[]>(createEmptySegments);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [winnerMedia, setWinnerMedia] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const mediaListRef = useRef<Media[]>([]);

  const spin = useCallback(async (
    filters: FilterState,
    allGenres: MergedGenre[]
  ) => {
    setError(null);
    setWheelState('loading');
    setWinnerIndex(null);
    setWinnerMedia(null);

    try {
      const movies = await fetchWheelCandidates(
        filters.mediaType,
        [],
        filters.genreMode,
        filters.minRating,
        filters.yearFrom,
        filters.yearTo,
        SEGMENT_COUNT,
        allGenres,
        filters.selectedGenres
      );

      if (movies.length === 0) {
        setError('No movies found matching your filters. Try broadening your criteria.');
        setWheelState('idle');
        return;
      }

      mediaListRef.current = movies;

      const newSegments: WheelSegmentData[] = movies.map(m => ({
        id: m.id,
        title: m.title,
        posterUrl: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
        mediaType: m.media_type,
      }));
      setSegments(newSegments);

      // Preload images
      const images = await preloadImages(newSegments.map(s => s.posterUrl));
      imagesRef.current = images;

      // Pick winner
      const winner = Math.floor(Math.random() * movies.length);
      setWinnerIndex(winner);
      setWinnerMedia(movies[winner]);
      setWheelState('spinning');
    } catch (err) {
      console.error('Wheel spin error:', err);
      setError('Something went wrong fetching movies. Please try again.');
      setWheelState('idle');
    }
  }, []);

  const onSpinComplete = useCallback(() => {
    setWheelState('stopped');
  }, []);

  const reset = useCallback(() => {
    setWheelState('idle');
    setSegments(createEmptySegments());
    setWinnerIndex(null);
    setWinnerMedia(null);
    setError(null);
    imagesRef.current = [];
    mediaListRef.current = [];
  }, []);

  return {
    wheelState,
    segments,
    winnerIndex,
    winnerMedia,
    error,
    images: imagesRef,
    spin,
    onSpinComplete,
    reset,
    isSpinning: wheelState === 'spinning',
    isLoading: wheelState === 'loading',
  };
};
