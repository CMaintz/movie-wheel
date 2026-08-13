import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMergedGenres } from './services/api';
import { useFilters } from './hooks/useFilters';
import { useWheel } from './hooks/useWheel';
import Wheel from './components/Wheel';
import type { WheelDisplayMode } from './components/Wheel';
import FilterPanel from './components/FilterPanel';
import ResultModal from './components/ResultModal';
import { SlidersHorizontal, Loader2 } from 'lucide-react';

function App() {
  const filters = useFilters();
  const wheel = useWheel();
  const [showFilters, setShowFilters] = useState(false);
  const [displayMode, setDisplayMode] = useState<WheelDisplayMode>('dvd');

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: getMergedGenres,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });

  // Listen for display mode toggle from Wheel component
  useEffect(() => {
    const handler = () => {
      setDisplayMode(m => (m === 'dvd' ? 'fullbleed' : 'dvd'));
    };
    window.addEventListener('toggleDisplayMode', handler);
    return () => window.removeEventListener('toggleDisplayMode', handler);
  }, []);

  const handleSpin = () => {
    wheel.spin(filters.state, genres);
    setShowFilters(false);
  };

  const handleSpinAgain = () => {
    wheel.reset();
    // Small delay so wheel resets visually before spinning again
    setTimeout(() => {
      wheel.spin(filters.state, genres);
    }, 100);
  };

  return (
    <div className="flex h-screen bg-bg-default overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-80 lg:w-[340px] flex-shrink-0 border-r border-white/10">
        <FilterPanel
          filters={filters.state}
          genres={genres}
          onSetMediaType={filters.setMediaType}
          onToggleGenre={filters.toggleGenre}
          onSetGenreMode={filters.setGenreMode}
          onSetMinRating={filters.setMinRating}
          onSetYearFrom={filters.setYearFrom}
          onSetYearTo={filters.setYearTo}
          onReset={filters.resetFilters}
          disabled={wheel.isSpinning || wheel.isLoading}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6 overflow-y-auto">
        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          Movie <span className="text-primary">Wheel</span>
        </h1>

        {/* Wheel */}
        <Wheel
          segments={wheel.segments}
          wheelState={wheel.wheelState}
          winnerIndex={wheel.winnerIndex}
          images={wheel.images}
          onSpinComplete={wheel.onSpinComplete}
          displayMode={displayMode}
        />

        {/* Error message */}
        {wheel.error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm max-w-md text-center">
            {wheel.error}
          </div>
        )}

        {/* Spin button */}
        <button
          onClick={handleSpin}
          disabled={wheel.isSpinning || wheel.isLoading}
          className="flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary-dark text-white text-lg font-semibold rounded-xl shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-primary/25"
        >
          {wheel.isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Loading...
            </>
          ) : wheel.isSpinning ? (
            'Spinning...'
          ) : (
            'Spin!'
          )}
        </button>

        {/* Mobile filter toggle */}
        <button
          onClick={() => setShowFilters(true)}
          className="md:hidden flex items-center gap-2 px-4 py-2 bg-bg-paper border border-white/10 text-white/70 rounded-lg hover:text-white hover:bg-white/5 transition-colors"
        >
          <SlidersHorizontal size={16} />
          Filters
          {filters.state.selectedGenres.length > 0 && (
            <span className="bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full">
              {filters.state.selectedGenres.length}
            </span>
          )}
        </button>
      </main>

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] animate-slideUp rounded-t-2xl overflow-hidden">
            <FilterPanel
              filters={filters.state}
              genres={genres}
              onSetMediaType={filters.setMediaType}
              onToggleGenre={filters.toggleGenre}
              onSetGenreMode={filters.setGenreMode}
              onSetMinRating={filters.setMinRating}
              onSetYearFrom={filters.setYearFrom}
              onSetYearTo={filters.setYearTo}
              onReset={filters.resetFilters}
              disabled={wheel.isSpinning || wheel.isLoading}
              onClose={() => setShowFilters(false)}
            />
          </div>
        </div>
      )}

      {/* Result modal */}
      {wheel.wheelState === 'stopped' && wheel.winnerMedia && (
        <ResultModal
          media={wheel.winnerMedia}
          onClose={wheel.reset}
          onSpinAgain={handleSpinAgain}
          disabled={wheel.isSpinning || wheel.isLoading}
        />
      )}
    </div>
  );
}

export default App;
