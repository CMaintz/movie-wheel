import React, { useState } from 'react';
import type { MergedGenre } from '../types';
import type { FilterState, MediaTypeFilter, GenreMode } from '../hooks/useFilters';
import { getStoredRegion, setStoredRegion, SUPPORTED_REGIONS } from '../utils/region';
import { GENRE_COMBOS, resolveCombo } from '../utils/genreCombos';
import { SlidersHorizontal, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface FilterPanelProps {
  filters: FilterState;
  genres: MergedGenre[];
  onSetMediaType: (t: MediaTypeFilter) => void;
  onToggleGenre: (g: string) => void;
  onToggleCombo: (c: string) => void;
  onSetGenreMode: (m: GenreMode) => void;
  onSetMinRating: (r: number) => void;
  onSetMinVotes: (v: number) => void;
  onSetLanguage: (l: string) => void;
  onSetYearFrom: (y: number) => void;
  onSetYearTo: (y: number) => void;
  onReset: () => void;
  disabled: boolean;
  onClose?: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

const MIN_VOTE_OPTIONS = [0, 50, 100, 250, 500, 1000];

const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'da', label: 'Danish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
];

const selectClass =
  'w-full bg-bg-default border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary focus:outline-none disabled:opacity-30';

const chipClass = (isActive: boolean, isApplicable: boolean) =>
  `px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-30 ${
    isActive
      ? 'bg-primary/20 border-primary text-primary-light font-medium'
      : isApplicable
        ? 'border-white/15 text-white/60 hover:border-white/30 hover:text-white/80'
        : 'border-white/5 text-white/20 cursor-not-allowed'
  }`;

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  genres,
  onSetMediaType,
  onToggleGenre,
  onToggleCombo,
  onSetGenreMode,
  onSetMinRating,
  onSetMinVotes,
  onSetLanguage,
  onSetYearFrom,
  onSetYearTo,
  onReset,
  disabled,
  onClose,
}) => {
  const [region, setRegion] = useState(getStoredRegion);
  const [showRegion, setShowRegion] = useState(false);

  const handleRegionChange = (r: string) => {
    setRegion(r);
    setStoredRegion(r);
  };

  const mediaTypes: { label: string; value: MediaTypeFilter }[] = [
    { label: 'Movies', value: 'movie' },
    { label: 'TV Shows', value: 'tv' },
    { label: 'Both', value: 'both' },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-paper text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={disabled}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white disabled:opacity-30"
            title="Reset filters"
          >
            <RotateCcw size={16} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white md:hidden"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Media Type */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Type</label>
          <div className="flex gap-1 bg-bg-default rounded-lg p-1">
            {mediaTypes.map(t => (
              <button
                key={t.value}
                onClick={() => onSetMediaType(t.value)}
                disabled={disabled}
                className={`flex-1 py-1.5 px-2 text-sm rounded-md transition-colors disabled:opacity-30 ${
                  filters.mediaType === t.value
                    ? 'bg-primary text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Genres */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-white/70">Genres</label>
            <div className="flex items-center gap-1 bg-bg-default rounded-md p-0.5">
              {(['OR', 'AND'] as GenreMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => onSetGenreMode(m)}
                  disabled={disabled}
                  className={`px-2 py-0.5 text-xs rounded transition-colors disabled:opacity-30 ${
                    filters.genreMode === m
                      ? 'bg-primary text-white font-medium'
                      : 'text-white/50 hover:text-white'
                  }`}
                  title={m === 'OR' ? 'Match any selected genre' : 'Must match all selected genres'}
                >
                  {m === 'OR' ? 'Any' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genres.map(g => {
              const isActive = filters.selectedGenres.includes(g.name);
              // Grey out genres that don't apply to the selected media type
              const isApplicable =
                filters.mediaType === 'both' ||
                (filters.mediaType === 'movie' && g.movieId !== null) ||
                (filters.mediaType === 'tv' && g.tvId !== null);

              return (
                <button
                  key={g.name}
                  onClick={() => isApplicable && onToggleGenre(g.name)}
                  disabled={disabled || !isApplicable}
                  className={chipClass(isActive, isApplicable)}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
          {filters.selectedGenres.length > 0 && (
            <p className="mt-1.5 text-xs text-white/40">
              {filters.genreMode === 'OR' ? 'Matching any of: ' : 'Must match all: '}
              {filters.selectedGenres.join(', ')}
            </p>
          )}
        </div>

        {/* Genre combos */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Genre Combos</label>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_COMBOS.map(c => {
              const isActive = filters.selectedCombos.includes(c.name);
              const isApplicable =
                (filters.mediaType !== 'tv' && resolveCombo(c, 'movie', genres) !== null) ||
                (filters.mediaType !== 'movie' && resolveCombo(c, 'tv', genres) !== null);

              return (
                <button
                  key={c.name}
                  onClick={() => isApplicable && onToggleCombo(c.name)}
                  disabled={disabled || !isApplicable}
                  className={chipClass(isActive, isApplicable)}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-white/40">
            {filters.selectedCombos.length > 0
              ? `Also spinning: ${filters.selectedCombos.join(', ')}`
              : 'A combo only matches titles that have both genres.'}
          </p>
        </div>

        {/* Min Rating */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-white/70">Min Rating</label>
            <span className="text-sm font-mono text-primary">{filters.minRating.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filters.minRating}
            onChange={e => onSetMinRating(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full disabled:opacity-30"
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        {/* Min votes + language */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="min-votes" className="text-sm font-medium text-white/70 mb-2 block">Min Votes</label>
            <select
              id="min-votes"
              value={filters.minVotes}
              onChange={e => onSetMinVotes(parseInt(e.target.value))}
              disabled={disabled}
              className={selectClass}
            >
              {MIN_VOTE_OPTIONS.map(v => (
                <option key={v} value={v}>{v === 0 ? 'Any' : `${v}+`}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="text-sm font-medium text-white/70 mb-2 block">Language</label>
            <select
              id="language"
              value={filters.language}
              onChange={e => onSetLanguage(e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Year Range */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Year Range</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1900}
              max={CURRENT_YEAR}
              value={filters.yearFrom}
              onChange={e => onSetYearFrom(parseInt(e.target.value) || 1995)}
              disabled={disabled}
              className="flex-1 bg-bg-default border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary focus:outline-none disabled:opacity-30"
            />
            <span className="text-white/30">to</span>
            <input
              type="number"
              min={1900}
              max={CURRENT_YEAR}
              value={filters.yearTo}
              onChange={e => onSetYearTo(parseInt(e.target.value) || CURRENT_YEAR)}
              disabled={disabled}
              className="flex-1 bg-bg-default border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary focus:outline-none disabled:opacity-30"
            />
          </div>
        </div>

        {/* Region */}
        <div>
          <button
            onClick={() => setShowRegion(!showRegion)}
            className="flex items-center justify-between w-full text-sm font-medium text-white/70 hover:text-white/90 transition-colors"
          >
            <span>Watch Region: {region}</span>
            {showRegion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showRegion && (
            <select
              aria-label="Watch region"
              value={region}
              onChange={e => handleRegionChange(e.target.value)}
              className={`mt-2 ${selectClass}`}
            >
              {SUPPORTED_REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
