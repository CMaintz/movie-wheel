export const config = {
  tmdbApiKey: import.meta.env.VITE_TMDB_API_KEY || '',
  tmdbReadToken: import.meta.env.VITE_TMDB_READ_TOKEN || '',
} as const;
