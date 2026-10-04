import React, { useEffect, useRef, useState } from 'react';
import type { Media, MediaDetails, MovieDetails, SeriesDetails } from '../types';
import { getMediaDetails, getWatchProviders } from '../services/api';
import type { WatchProvidersResult } from '../services/api';
import { getStoredRegion } from '../utils/region';
import WatchProviders from './WatchProviders';
import type { CaseStyle } from '../utils/wheelArt';
import { X, Star, Clock, Calendar, Film, Tv, ExternalLink, RotateCw, Play } from 'lucide-react';

interface ResultModalProps {
  media: Media;
  caseStyle?: CaseStyle;
  onClose: () => void;
  onSpinAgain: () => void;
  disabled?: boolean;
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

const ResultModal: React.FC<ResultModalProps> = ({ media, caseStyle = 'vhs', onClose, onSpinAgain, disabled }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
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

  // Move focus into the dialog, and hand it back to whatever had it on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

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
  const makers = isMovie
    ? details?.credits?.crew?.filter(c => c.job === 'Director').map(c => c.name) || []
    : (details as SeriesDetails | null)?.created_by?.map(c => c.name) || [];
  const makersLabel = isMovie ? (makers.length > 1 ? 'Directors' : 'Director') : 'Created by';
  const trailer = details?.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        tabIndex={-1}
        className="relative bg-bg-paper rounded-2xl border-2 border-secondary/60 shadow-[0_0_60px_rgba(232,154,0,0.25)] max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fadeIn focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-[5] bg-secondary text-black text-center font-display text-sm tracking-[0.3em] py-1.5">
          Tonight&rsquo;s feature
          {/* Close button lives in the sticky bar so it stays reachable while scrolling */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-0.5 right-2 p-1 hover:bg-black/10 rounded-lg transition-colors text-black/70 hover:text-black"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Poster */}
              <div className="flex-shrink-0 mx-auto sm:mx-0">
                <div className={`case-box case-${caseStyle}`}>
                  {media.poster_path ? (
                    <img src={`${TMDB_IMG}${media.poster_path}`} alt={`${media.title} poster`} />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-bg-default">
                      <Film size={40} className="text-white/20" />
                    </div>
                  )}
                  <span className="case-badge" aria-hidden="true">{caseStyle.toUpperCase()}</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1">
                  {isMovie ? <Film size={16} className="text-primary mt-1 flex-shrink-0" /> : <Tv size={16} className="text-primary mt-1 flex-shrink-0" />}
                  <h2 id="result-title" className="text-xl font-bold text-white leading-tight">{media.title}</h2>
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

                {makers.length > 0 && (
                  <p className="text-sm text-white/60 mb-3">
                    <span className="font-semibold text-white">{makersLabel}: </span>
                    <span className="text-white/80">{makers.join(', ')}</span>
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
              {trailer && (
                <a
                  href={`https://www.youtube.com/watch?v=${trailer.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors"
                >
                  <Play size={13} /> Trailer
                </a>
              )}
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
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-dark text-white font-display tracking-wide rounded-full border-2 border-secondary transition-colors disabled:opacity-50"
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
