import type { MergedGenre } from '../types';

// Each part lists the TMDB genre names that satisfy it; TV folds some genres together
// (e.g. "Action & Adventure"), so the TV name is listed as an alternative.
export interface GenreCombo {
  name: string;
  parts: string[][];
}

const ACTION = ['Action', 'Action & Adventure'];
const ADVENTURE = ['Adventure', 'Action & Adventure'];
const SCI_FI = ['Science Fiction', 'Sci-Fi & Fantasy'];
const FANTASY = ['Fantasy', 'Sci-Fi & Fantasy'];
const WAR = ['War', 'War & Politics'];

export const GENRE_COMBOS: GenreCombo[] = [
  { name: 'Rom-Com', parts: [['Romance'], ['Comedy']] },
  { name: 'Romantic Drama', parts: [['Romance'], ['Drama']] },
  { name: 'Dramedy', parts: [['Comedy'], ['Drama']] },
  { name: 'Horror Comedy', parts: [['Horror'], ['Comedy']] },
  { name: 'Action Comedy', parts: [ACTION, ['Comedy']] },
  { name: 'Crime Comedy', parts: [['Crime'], ['Comedy']] },
  { name: 'Animated Comedy', parts: [['Animation'], ['Comedy']] },
  { name: 'Action Thriller', parts: [ACTION, ['Thriller']] },
  { name: 'Mystery Thriller', parts: [['Mystery'], ['Thriller']] },
  { name: 'Crime Thriller', parts: [['Crime'], ['Thriller']] },
  { name: 'Crime Drama', parts: [['Crime'], ['Drama']] },
  { name: 'Sci-Fi Action', parts: [SCI_FI, ACTION] },
  { name: 'Sci-Fi Horror', parts: [SCI_FI, ['Horror']] },
  { name: 'Fantasy Adventure', parts: [FANTASY, ADVENTURE] },
  { name: 'War Drama', parts: [WAR, ['Drama']] },
];

const idFor = (genre: MergedGenre, type: 'movie' | 'tv') =>
  type === 'movie' ? genre.movieId : genre.tvId;

// Returns the genre ids a title must all have, or null if TMDB has no such genres for this media type
export const resolveCombo = (
  combo: GenreCombo,
  type: 'movie' | 'tv',
  allGenres: MergedGenre[]
): number[] | null => {
  const ids = new Set<number>();
  for (const alternatives of combo.parts) {
    const id = alternatives
      .map(name => allGenres.find(g => g.name === name))
      .map(g => (g ? idFor(g, type) : null))
      .find((i): i is number => i !== null);
    if (id === undefined) return null;
    ids.add(id);
  }
  return [...ids];
};
