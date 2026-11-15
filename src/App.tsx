import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMergedGenres } from './services/api';
import { useFilters } from './hooks/useFilters';
import { useWheel } from './hooks/useWheel';
import { useMyList } from './hooks/useMyList';
import Wheel from './components/Wheel';
import FilterPanel from './components/FilterPanel';
import ResultModal from './components/ResultModal';
import MyListPanel from './components/MyListPanel';
import type { CaseStyle, WheelSkin } from './utils/wheelArt';
import type { Media } from './types';
import { REVEAL_DELAY } from './timing';
import { prefersReducedMotion } from './utils/motion';
import { celebrate } from './utils/celebrate';
import { mediaKey } from './utils/mediaKey';
import { SlidersHorizontal, ListPlus, Loader2, RotateCcw } from 'lucide-react';

const CASE_STYLE_KEY = 'moviewheel_case_style';
const SKIN_KEY = 'moviewheel_skin';
const SKIN_LABELS: Record<WheelSkin, string> = { cel: 'Cartoon', real: 'Classic' };
const SOURCE_KEY = 'moviewheel_source';
/** Where the wheel's titles come from: TMDB under the filters, or the viewer's own list */
type Source = 'discover' | 'list';
const SOURCE_LABELS: Record<Source, string> = { discover: 'Discover', list: 'My list' };

/** Reads a stored choice, falling back when it's missing, unknown or storage is unavailable. */
const loadChoice = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return options.find(o => o === stored) ?? fallback;
  } catch {
    return fallback;
  }
};

const storeChoice = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the choice just won't persist
  }
};


const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target.tagName) || target.isContentEditable);

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  text: (value: T) => string;
  disabled?: boolean;
}

const ChoiceGroup = <T extends string>({ label, options, value, onChange, text, disabled }: ChoiceGroupProps<T>) => (
  <div role="group" aria-label={label} className="flex gap-1 bg-bg-paper border border-white/10 rounded-full p-1">
    {options.map(option => (
      <button
        key={option}
        onClick={() => onChange(option)}
        aria-pressed={value === option}
        disabled={disabled}
        className={`px-3 py-1 text-xs font-bold tracking-widest rounded-full transition-colors ${
          value === option ? 'bg-secondary text-black' : 'text-white/60 hover:text-white'
        } disabled:opacity-40`}
      >
        {text(option)}
      </button>
    ))}
  </div>
);

function App() {
  const filters = useFilters();
  const wheel = useWheel();
  const myList = useMyList();
  const [source, setSource] = useState<Source>(() => loadChoice(SOURCE_KEY, ['discover', 'list'], 'discover'));
  // The source the current pick came from, which the switch may no longer show
  const [spunFrom, setSpunFrom] = useState<Source>(source);
  const [showFilters, setShowFilters] = useState(false);
  const [caseStyle, setCaseStyle] = useState<CaseStyle>(() => loadChoice(CASE_STYLE_KEY, ['vhs', 'dvd'], 'vhs'));
  const [skin, setSkin] = useState<WheelSkin>(() => loadChoice(SKIN_KEY, ['cel', 'real'], 'cel'));
  const [revealedPick, setRevealedPick] = useState<Media | null>(null);

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: getMergedGenres,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const busy = wheel.isSpinning || wheel.isLoading;
  const listMode = source === 'list';
  const listReady = myList.remaining.length >= 2;
  const lastStanding = listMode && myList.elimination && myList.titles.length >= 2 && myList.remaining.length === 1
    ? myList.remaining[0]
    : null;
  const canSpin = !listMode || listReady;
  // A reduced-motion spin is already short, so there's nothing to skip
  const canSkip = wheel.isSpinning && !wheel.skipRequested && !prefersReducedMotion();
  const stopped = wheel.wheelState === 'stopped' && wheel.winnerMedia !== null;
  const showResult = stopped && revealedPick === wheel.winnerMedia;
  const activeFilterCount = listMode
    ? myList.titles.length
    : filters.state.selectedGenres.length + filters.state.selectedCombos.length;

  useEffect(() => {
    if (!stopped) return;
    celebrate();
    const pick = wheel.winnerMedia;
    const id = window.setTimeout(() => setRevealedPick(pick), REVEAL_DELAY);
    return () => window.clearTimeout(id);
  }, [stopped, wheel.winnerMedia]);

  const chooseCaseStyle = (style: CaseStyle) => {
    setCaseStyle(style);
    storeChoice(CASE_STYLE_KEY, style);
  };

  const chooseSkin = (next: WheelSkin) => {
    setSkin(next);
    storeChoice(SKIN_KEY, next);
  };

  const chooseSource = (next: Source) => {
    setSource(next);
    storeChoice(SOURCE_KEY, next);
  };

  const spinFrom = useCallback((titles: Media[]) => {
    if (busy) return;
    if (!listMode) wheel.spin(filters.state, genres);
    else if (titles.length >= 2) wheel.spinList(titles);
    else return;
    setSpunFrom(source);
    setShowFilters(false);
  }, [busy, listMode, source, wheel, filters.state, genres]);

  const handleSpin = useCallback(() => spinFrom(myList.remaining), [spinFrom, myList.remaining]);

  // In elimination, the pick leaves the running once the viewer has seen it
  const knockOut = spunFrom === 'list' && myList.elimination ? wheel.winnerMedia : null;
  const remainingAfterPick = knockOut
    ? myList.remaining.filter(m => mediaKey(m) !== mediaKey(knockOut))
    : myList.remaining;

  const closeResult = () => {
    if (knockOut) myList.eliminate(knockOut);
    wheel.dismiss();
  };

  // Spinning again keeps the last titles on the wheel until the new ones arrive
  const handleSpinAgain = () => {
    if (knockOut) myList.eliminate(knockOut);
    if (listMode && remainingAfterPick.length < 2) wheel.dismiss();
    else spinFrom(remainingAfterPick);
  };

  // Space spins, or skips ahead mid-spin, unless focus is on a control that already uses the key
  // or a dialog is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
      if (showFilters || stopped) return;
      e.preventDefault();
      if (canSkip) wheel.skip();
      else handleSpin();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSpin, showFilters, stopped, wheel, canSkip]);

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
      : stopped
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

  // The source switch heads the sidebar and the mobile drawer, above whichever panel it picks
  const renderPanel = (onClose?: () => void) => (
    // min-h-0 lets the panel shrink inside the height-capped mobile drawer, so it scrolls there
    <div className="flex flex-col flex-1 min-h-0 w-full h-full bg-bg-paper">
      <div className="px-4 pt-4 flex">
        <ChoiceGroup
          label="Wheel source"
          options={['discover', 'list'] as Source[]}
          value={source}
          onChange={chooseSource}
          text={s => SOURCE_LABELS[s]}
          disabled={busy}
        />
      </div>
      <div className="flex-1 min-h-0">
        {listMode ? (
          <MyListPanel
            titles={myList.titles}
            eliminated={myList.eliminated}
            isFull={myList.isFull}
            has={myList.has}
            onAdd={myList.add}
            onRemove={myList.remove}
            elimination={myList.elimination}
            onSetElimination={myList.setElimination}
            onRestore={myList.restore}
            disabled={busy}
            onClose={onClose}
          />
        ) : (
          <FilterPanel {...filterPanelProps} onClose={onClose} />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-bg-default overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-80 lg:w-[340px] flex-shrink-0 border-r border-white/10">
        {renderPanel()}
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
          skin={skin}
          onHubClick={handleSpin}
          hubDisabled={busy || !canSpin}
          skipRequested={wheel.skipRequested}
        />

        <p className="sr-only" role="status" aria-live="polite">{status}</p>

        {wheel.error && (
          <div role="alert" className="bg-primary/10 border border-primary/40 text-primary-light px-4 py-2 rounded-lg text-sm max-w-md text-center">
            {wheel.error}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={canSkip ? wheel.skip : handleSpin}
            disabled={(busy || !canSpin) && !canSkip}
            className="flex items-center justify-center gap-2 min-w-[11rem] px-8 py-3 bg-primary hover:bg-primary-dark text-white text-xl font-display tracking-wide rounded-full border-2 border-secondary shadow-[0_0_24px_rgba(230,57,70,0.45)] transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
          >
            {wheel.isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Loading…
              </>
            ) : wheel.isSpinning ? (
              canSkip ? 'Skip' : 'Spinning…'
            ) : (
              'Spin!'
            )}
          </button>
          {listMode && !listReady && !busy && (
            lastStanding ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm text-white/80">
                  <span className="text-secondary font-semibold">{lastStanding.title}</span> is the last one standing.
                </p>
                <button
                  onClick={myList.restore}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
                >
                  <RotateCcw size={12} />
                  Start over
                </button>
              </div>
            ) : (
              <p className="text-sm text-white/50 text-center">Add at least two titles to your list to spin.</p>
            )
          )}
          <p className="hidden md:block text-xs text-white/40">
            or press <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/5 font-mono">Space</kbd>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <ChoiceGroup
            label="Wheel look"
            options={['cel', 'real'] as WheelSkin[]}
            value={skin}
            onChange={chooseSkin}
            text={s => SKIN_LABELS[s]}
          />
          {/* Case style: how the titles are dressed on the wheel */}
          <ChoiceGroup
            label="Box style"
            options={['vhs', 'dvd'] as CaseStyle[]}
            value={caseStyle}
            onChange={chooseCaseStyle}
            text={s => s.toUpperCase()}
          />

          {/* Mobile filter toggle */}
          <button
            onClick={() => setShowFilters(true)}
            className="md:hidden flex items-center gap-2 px-4 py-1.5 bg-bg-paper border border-white/10 text-white/80 rounded-full hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            {listMode ? <ListPlus size={15} /> : <SlidersHorizontal size={15} />}
            {listMode ? 'Edit list' : 'Filters'}
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
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={listMode ? 'My list' : 'Filters'}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] animate-slideUp rounded-t-2xl overflow-hidden flex flex-col">
            {renderPanel(() => setShowFilters(false))}
            <div className="p-3 bg-bg-paper border-t border-white/10">
              <button
                onClick={handleSpin}
                disabled={busy || !canSpin}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white font-display tracking-wide rounded-full disabled:opacity-60"
              >
                {listMode ? 'Spin my list' : 'Spin with these filters'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResult && wheel.winnerMedia && (
        <ResultModal
          media={wheel.winnerMedia}
          caseStyle={caseStyle}
          onClose={closeResult}
          onSpinAgain={handleSpinAgain}
          disabled={busy}
          spinAgainLabel={knockOut ? (remainingAfterPick.length >= 2 ? 'Knock it out and spin again' : 'Knock it out') : undefined}
        />
      )}
    </div>
  );
}

export default App;
