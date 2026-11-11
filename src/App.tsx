import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMergedGenres } from './services/api';
import { useFilters } from './hooks/useFilters';
import { useWheel } from './hooks/useWheel';
import Wheel from './components/Wheel';
import FilterPanel from './components/FilterPanel';
import ResultModal from './components/ResultModal';
import type { CaseStyle } from './utils/wheelArt';
import { SlidersHorizontal, Loader2 } from 'lucide-react';

const CASE_STYLE_KEY = 'moviewheel_case_style';

const loadCaseStyle = (): CaseStyle => {
  try {
    return localStorage.getItem(CASE_STYLE_KEY) === 'dvd' ? 'dvd' : 'vhs';
  } catch {
    return 'vhs';
  }
};

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target.tagName) || target.isContentEditable);

function App() {
  const filters = useFilters();
  const wheel = useWheel();
  const [showFilters, setShowFilters] = useState(false);
  const [caseStyle, setCaseStyle] = useState<CaseStyle>(loadCaseStyle);

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: getMergedGenres,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const busy = wheel.isSpinning || wheel.isLoading;
  const showResult = wheel.wheelState === 'stopped' && wheel.winnerMedia !== null;
  const activeFilterCount = filters.state.selectedGenres.length + filters.state.selectedCombos.length;

  const chooseCaseStyle = (style: CaseStyle) => {
    setCaseStyle(style);
    try {
      localStorage.setItem(CASE_STYLE_KEY, style);
    } catch {
      // storage unavailable (private mode): the choice just won't persist
    }
  };

  const handleSpin = useCallback(() => {
    if (busy) return;
    wheel.spin(filters.state, genres);
    setShowFilters(false);
  }, [busy, wheel, filters.state, genres]);

  const handleSpinAgain = () => {
    wheel.reset();
    // Small delay so wheel resets visually before spinning again
    setTimeout(() => {
      wheel.spin(filters.state, genres);
    }, 100);
  };

  // Space spins, unless focus is on a control that already uses the key or a dialog is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
      if (showFilters || showResult) return;
      e.preventDefault();
      handleSpin();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSpin, showFilters, showResult]);

  // Escape closes the mobile filter drawer
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFilters(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showFilters]);

  const status = wheel.isLoading
    ? 'Finding titles…'
    : wheel.isSpinning
      ? 'Spinning…'
      : showResult
        ? `The wheel picked ${wheel.winnerMedia?.title}.`
        : '';

  const filterPanelProps = {
    filters: filters.state,
    genres,
    onSetMediaType: filters.setMediaType,
    onToggleGenre: filters.toggleGenre,
    onToggleCombo: filters.toggleCombo,
    onSetGenreMode: filters.setGenreMode,
    onSetMinRating: filters.setMinRating,
    onSetMinVotes: filters.setMinVotes,
    onSetLanguage: filters.setLanguage,
    onSetYearFrom: filters.setYearFrom,
    onSetYearTo: filters.setYearTo,
    onReset: filters.resetFilters,
    disabled: busy,
  };

  return (
    <div className="flex h-screen bg-bg-default overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-80 lg:w-[340px] flex-shrink-0 border-r border-white/10">
        <FilterPanel {...filterPanelProps} />
      </aside>

      {/* Main content: a spotlight on the stage */}
      <main className="stage flex-1 flex flex-col items-center justify-center px-4 py-6 gap-5 overflow-y-auto">
        <h1 className="marquee-title text-3xl md:text-4xl text-center">Movie Wheel</h1>

        <Wheel
          segments={wheel.segments}
          wheelState={wheel.wheelState}
          winnerIndex={wheel.winnerIndex}
          images={wheel.images}
          onSpinComplete={wheel.onSpinComplete}
          caseStyle={caseStyle}
          onHubClick={handleSpin}
          hubDisabled={busy}
        />

        <p className="sr-only" role="status" aria-live="polite">{status}</p>

        {wheel.error && (
          <div role="alert" className="bg-primary/10 border border-primary/40 text-primary-light px-4 py-2 rounded-lg text-sm max-w-md text-center">
            {wheel.error}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleSpin}
            disabled={busy}
            className="flex items-center justify-center gap-2 min-w-[11rem] px-8 py-3 bg-primary hover:bg-primary-dark text-white text-xl font-display tracking-wide rounded-full border-2 border-secondary shadow-[0_0_24px_rgba(230,57,70,0.45)] transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
          >
            {wheel.isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Loading…
              </>
            ) : wheel.isSpinning ? (
              'Spinning…'
            ) : (
              'Spin!'
            )}
          </button>
          <p className="hidden md:block text-xs text-white/40">
            or press <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5 font-mono">Space</kbd>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Case style: how the titles are dressed on the wheel */}
          <div role="group" aria-label="Box style" className="flex gap-1 bg-bg-paper border border-white/10 rounded-full p-1">
            {(['vhs', 'dvd'] as CaseStyle[]).map(style => (
              <button
                key={style}
                onClick={() => chooseCaseStyle(style)}
                aria-pressed={caseStyle === style}
                className={`px-3 py-1 text-xs font-bold tracking-widest rounded-full transition-colors ${
                  caseStyle === style ? 'bg-secondary text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                {style.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowFilters(true)}
            className="md:hidden flex items-center gap-2 px-4 py-1.5 bg-bg-paper border border-white/10 text-white/80 rounded-full hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary/25 text-primary-light text-xs px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] animate-slideUp rounded-t-2xl overflow-hidden flex flex-col">
            <FilterPanel {...filterPanelProps} onClose={() => setShowFilters(false)} />
            <div className="p-3 bg-bg-paper border-t border-white/10">
              <button
                onClick={handleSpin}
                disabled={busy}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white font-display tracking-wide rounded-full disabled:opacity-60"
              >
                Spin with these filters
              </button>
            </div>
          </div>
        </div>
      )}

      {showResult && wheel.winnerMedia && (
        <ResultModal
          media={wheel.winnerMedia}
          caseStyle={caseStyle}
          onClose={wheel.dismiss}
          onSpinAgain={handleSpinAgain}
          disabled={busy}
        />
      )}
    </div>
  );
}

export default App;
