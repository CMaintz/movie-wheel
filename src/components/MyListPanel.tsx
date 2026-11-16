import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchTitles } from '../services/api';
import type { Media } from '../types';
import { mediaKey } from '../utils/mediaKey';
import { MAX_LIST_SIZE } from '../hooks/useMyList';
import { ListPlus, Plus, Check, X, Search, RotateCcw, Film, Tv } from 'lucide-react';

interface MyListPanelProps {
  titles: Media[];
  eliminated: ReadonlySet<string>;
  isFull: boolean;
  has: (m: Media) => boolean;
  onAdd: (m: Media) => void;
  onRemove: (m: Media) => void;
  elimination: boolean;
  onSetElimination: (on: boolean) => void;
  onRestore: () => void;
  disabled: boolean;
  onClose?: () => void;
}

const THUMB = 'https://image.tmdb.org/t/p/w92';
// Wait for a pause in typing, so each keystroke isn't its own request against the proxy's rate limit
const SEARCH_DEBOUNCE = 300;
const MIN_QUERY = 2;
const MAX_RESULTS = 8;

const useDebounced = (value: string, ms: number) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
};

const year = (m: Media) => m.release_date?.split('-')[0] ?? '';

const TitleRow: React.FC<{ media: Media; struck?: boolean; children: React.ReactNode }> = ({ media, struck, children }) => (
  <li className="flex items-center gap-3 py-1.5">
    {media.poster_path ? (
      <img src={`${THUMB}${media.poster_path}`} alt="" className="w-8 h-12 rounded object-cover bg-white/5 flex-shrink-0" />
    ) : (
      <div className="w-8 h-12 rounded bg-white/5 flex items-center justify-center flex-shrink-0 text-white/30">
        {media.media_type === 'movie' ? <Film size={14} /> : <Tv size={14} />}
      </div>
    )}
    <div className={`flex-1 min-w-0 ${struck ? 'line-through text-white/35' : ''}`}>
      <div className="text-sm truncate">{media.title}</div>
      <div className="text-xs text-white/40">
        {[year(media), media.media_type === 'movie' ? 'Movie' : 'TV'].filter(Boolean).join(' · ')}
      </div>
    </div>
    {children}
  </li>
);

const iconButton =
  'p-1.5 rounded-lg transition-colors text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent';

const MyListPanel: React.FC<MyListPanelProps> = ({
  titles,
  eliminated,
  isFull,
  has,
  onAdd,
  onRemove,
  elimination,
  onSetElimination,
  onRestore,
  disabled,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const settled = useDebounced(query.trim(), SEARCH_DEBOUNCE);
  const searching = settled.length >= MIN_QUERY;

  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: ['search', settled],
    queryFn: () => searchTitles(settled),
    enabled: searching,
    staleTime: 1000 * 60 * 10,
  });

  const knockedOut = titles.filter(t => eliminated.has(mediaKey(t))).length;

  return (
    <div className="flex flex-col h-full bg-bg-paper text-white overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ListPlus size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">My list</h2>
          <span className="text-xs text-white/40">
            {titles.length}/{MAX_LIST_SIZE}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className={`${iconButton} md:hidden`} aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-5">
        <div>
          <label htmlFor="title-search" className="text-sm font-medium text-white/70 mb-2 block">
            Add a movie or show
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              id="title-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isFull ? 'Your list is full' : 'Search titles'}
              disabled={isFull}
              autoComplete="off"
              className="w-full bg-bg-default border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none disabled:opacity-40"
            />
          </div>

          {/* Mounted from the start, so screen readers announce its first update */}
          <p className="sr-only" aria-live="polite">
            {!searching || isFull
              ? ''
              : isError
                ? 'Search failed.'
                : isFetching
                  ? 'Searching…'
                  : `${Math.min(results.length, MAX_RESULTS)} results`}
          </p>
          {searching && !isFull && (
            <div className="mt-2">
              {isError ? (
                <p className="text-xs text-primary-light">Search failed. Try again in a moment.</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-white/40">{isFetching ? 'Searching…' : 'Nothing found.'}</p>
              ) : (
                <ul aria-label="Search results" className="divide-y divide-white/5">
                  {results.slice(0, MAX_RESULTS).map(m => {
                    const added = has(m);
                    return (
                      <TitleRow key={mediaKey(m)} media={m}>
                        <button
                          onClick={() => onAdd(m)}
                          disabled={added}
                          className={iconButton}
                          aria-label={added ? `${m.title} is on your list` : `Add ${m.title}`}
                        >
                          {added ? <Check size={16} className="text-secondary" /> : <Plus size={16} />}
                        </button>
                      </TitleRow>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-white/70">On the wheel</span>
            {knockedOut > 0 && (
              <button
                onClick={onRestore}
                disabled={disabled}
                className="flex items-center gap-1 text-xs text-white/50 hover:text-white disabled:opacity-30"
              >
                <RotateCcw size={12} />
                Bring them all back
              </button>
            )}
          </div>
          {titles.length === 0 ? (
            <p className="text-xs text-white/40 py-2">
              Search above and add at least two titles. They'll share the wheel between them.
            </p>
          ) : (
            <ul aria-label="My list" className="divide-y divide-white/5">
              {titles.map(m => {
                const out = eliminated.has(mediaKey(m));
                return (
                  <TitleRow key={mediaKey(m)} media={m} struck={out}>
                    <button
                      onClick={() => onRemove(m)}
                      disabled={disabled}
                      className={iconButton}
                      aria-label={`Remove ${m.title}`}
                    >
                      <X size={16} />
                    </button>
                  </TitleRow>
                );
              })}
            </ul>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={elimination}
            onChange={e => onSetElimination(e.target.checked)}
            disabled={disabled}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="text-sm text-white/80 block">Elimination</span>
            <span className="text-xs text-white/40">Each pick drops off the wheel until one is left standing.</span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default MyListPanel;
