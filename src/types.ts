export interface MediaBase {
  id: number;
  title: string;
  poster_path: string;
  vote_average: number;
  media_type: 'movie' | 'tv';
}

export interface Media extends MediaBase {
  backdrop_path: string;
  vote_count: number;
  popularity: number;
  overview: string;
  genres: Array<Genre>;
  release_date?: string;
}

export interface MediaResponse {
  page: number;
  results: Media[];
  total_pages: number;
  total_results: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface MergedGenre {
  name: string;
  movieId: number | null;
  tvId: number | null;
}

export interface MediaDetails extends Media {
  credits: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      profile_path: string;
      department: string;
    }>;
  };
  videos: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
    }>;
  };
  status: string;
  imdb_id?: string;
  external_ids?: {
    imdb_id?: string;
  };
}

export interface MovieDetails extends MediaDetails {
  media_type: 'movie';
  runtime: number;
  release_date: string;
}

export interface SeriesDetails extends MediaDetails {
  media_type: 'tv';
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
}

export interface WheelSegmentData {
  id: number;
  title: string;
  posterUrl: string | null;
  mediaType: 'movie' | 'tv';
}
