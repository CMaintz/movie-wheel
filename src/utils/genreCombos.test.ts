import { describe, expect, it } from 'vitest';
import { GENRE_COMBOS, resolveCombo } from './genreCombos';
import type { MergedGenre } from '../types';

// Real TMDB genre names, merged the way getMergedGenres does it
const genres: MergedGenre[] = (
  [
    ['Action', 28, null],
    ['Action & Adventure', null, 10759],
    ['Adventure', 12, null],
    ['Animation', 16, 16],
    ['Comedy', 35, 35],
    ['Crime', 80, 80],
    ['Drama', 18, 18],
    ['Fantasy', 14, null],
    ['Horror', 27, null],
    ['Mystery', 9648, 9648],
    ['Romance', 10749, null],
    ['Sci-Fi & Fantasy', null, 10765],
    ['Science Fiction', 878, null],
    ['Thriller', 53, null],
    ['War', 10752, null],
    ['War & Politics', null, 10768],
  ] as const
).map(([name, movieId, tvId]) => ({ name, movieId, tvId }));

const combo = (name: string) => {
  const found = GENRE_COMBOS.find(c => c.name === name);
  if (!found) throw new Error(`no combo ${name}`);
  return found;
};

describe('resolveCombo', () => {
  it('resolves every combo for movies', () => {
    for (const c of GENRE_COMBOS) {
      expect(resolveCombo(c, 'movie', genres), c.name).toHaveLength(c.parts.length);
    }
  });

  it('falls back to the folded TV genre names', () => {
    expect(resolveCombo(combo('Action Comedy'), 'tv', genres)).toEqual([10759, 35]);
    expect(resolveCombo(combo('War Drama'), 'tv', genres)).toEqual([10768, 18]);
  });

  it('returns null when a part has no genre for the media type', () => {
    expect(resolveCombo(combo('Rom-Com'), 'tv', genres)).toBeNull();
    expect(resolveCombo(combo('Rom-Com'), 'movie', [])).toBeNull();
  });

  it('dedupes when both parts fold into the same TV genre', () => {
    const sciFiFantasy = {
      name: 'Sci-Fi Fantasy',
      parts: [
        ['Science Fiction', 'Sci-Fi & Fantasy'],
        ['Fantasy', 'Sci-Fi & Fantasy'],
      ],
    };
    expect(resolveCombo(sciFiFantasy, 'tv', genres)).toEqual([10765]);
  });
});
