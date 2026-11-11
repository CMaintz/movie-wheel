import type { Media } from '../types';

/** Identifies a title across media types: TMDB movie and TV ids overlap. */
export const mediaKey = (m: Pick<Media, 'media_type' | 'id'>): string => `${m.media_type}:${m.id}`;
