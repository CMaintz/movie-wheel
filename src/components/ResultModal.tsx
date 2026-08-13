import React, { useEffect, useState } from 'react';
import type { Media, MediaDetails, MovieDetails, SeriesDetails } from '../types';
import { getMediaDetails, getWatchProviders } from '../services/api';
import type { WatchProvidersResult } from '../services/api';
import { getStoredRegion } from '../utils/region';
import WatchProviders from './WatchProviders';
import { X, Star, Clock, Calendar, Film, Tv, ExternalLink, RotateCw } from 'lucide-react';

interface ResultModalProps {
  media: Media;
  onClose: () => void;
  onSpinAgain: () => void;
  disabled?: boolean;
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

const ResultModal: React.FC<ResultModalProps> = ({ media, onClose, onSpinAgain, disabled }) => {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [providers, setProviders] = useState<WatchProvidersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const [det, prov] = await Promise.all([
          getMediaDetails(media.media_type, media.id),
          getWatchProviders(media.media_type, media.id, getStoredRegion()),
        ]);
        setDetails(det);
        setProviders(prov);
      } catch (err) {
        console.error('Failed to fetch details:', err);
      } finally {
        setLoading(false);
        setProvidersLoading(false);
      }
    };
    fetchDetails();
  }, [media]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isMovie = media.media_type === 'movie';
  const year = media.release_date?.split('-')[0] || '';
  const runtime = details && isMovie ? (details as MovieDetails).runtime : null;
  const seasons = details && !isMovie ? (details as SeriesDetails).number_of_seasons : null;
  const imdbId = details?.imdb_id || details?.external_ids?.imdb_id;
  const cast = details?.credits?.cast?.slice(0, 6) || [];
  const genreNames = details?.genres?.map(g => g.name) || [];

  const formatRuntime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative bg-bg-paper rounded-xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white z-10"
        >
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Poster */}
              <div className="flex-shrink-0 mx-auto sm:mx-0">
                {media.poster_path ? (
                  <img
                    src={`${TMDB_IMG}${media.poster_path}`}
                    alt={media.title}
                    className="w-40 rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-40 h-60 bg-bg-default rounded-lg flex items-center justify-center">
                    <Film size={40} className="text-white/20" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1">
                  {isMovie ? <Film size={16} className="text-primary mt-1 flex-shrink-0" /> : <Tv size={16} className="text-primary mt-1 flex-shrink-0" />}
                  <h2 className="text-xl font-bold text-white leading-tight">{media.title}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-white/60 mt-2 mb-3">
                  {year && (
                    <span className="flex items-center gap-1">
                      <Calendar size={13} />
                      {year}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Star size={13} className="text-secondary" />
                    {media.vote_average.toFixed(1)}
                  </span>
                  {runtime && (
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {formatRuntime(runtime)}
                    </span>
                  )}
                  {seasons !== null && (
                    <span>{seasons} season{seasons !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Genre tags */}
                {genreNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {genreNames.map(g => (
                      <span key={g} className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/70">
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Overview */}
                {details?.overview && (
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    {details.overview}
                  </p>
                )}

                {/* Cast */}
                {cast.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white mb-1.5">Cast</h3>
                    <div className="text-sm text-white/60">
                      {cast.map((c, i) => (
                        <span key={c.id}>
                          <span className="text-white/80">{c.name}</span>
                          {c.character && <span className="text-white/40"> as {c.character}</span>}
                          {i < cast.length - 1 && <span className="text-white/20"> &middot; </span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Watch Providers */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <WatchProviders providers={providers} loading={providersLoading} />
            </div>

            {/* Links + Actions */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
              <a
                href={`https://www.themoviedb.org/${media.media_type}/${media.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-light transition-colors"
              >
                TMDB <ExternalLink size={13} />
              </a>
              {imdbId && (
                <a
                  href={`https://www.imdb.com/title/${imdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-secondary hover:text-secondary-light transition-colors"
                >
                  IMDb <ExternalLink size={13} />
                </a>
              )}
              <div className="flex-1" />
              <button
                onClick={onSpinAgain}
                disabled={disabled}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCw size={16} />
                Spin Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultModal;
