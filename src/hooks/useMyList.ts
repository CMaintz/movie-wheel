import { useCallback, useMemo, useState } from 'react';
import type { Media } from '../types';
import { mediaKey } from '../utils/mediaKey';

const STORAGE_KEY = 'moviewheel_my_list';
const ELIMINATION_KEY = 'moviewheel_elimination';
/** One title per slot: past this, titles would share the wheel unevenly with nothing gained. */
export const MAX_LIST_SIZE = 12;

const isTitle = (v: unknown): v is Media => {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Partial<Media>;
  return typeof m.id === 'number' && typeof m.title === 'string' && (m.media_type === 'movie' || m.media_type === 'tv');
};

const load = (): Media[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isTitle).slice(0, MAX_LIST_SIZE) : [];
  } catch {
    return [];
  }
};

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the list lasts until the tab closes
  }
};

/**
 * The viewer's own titles for the wheel, kept in localStorage. Elimination knocks picks out of
 * the running for this visit only; the saved list itself is untouched.
 */
export const useMyList = () => {
  const [titles, setTitles] = useState<Media[]>(load);
  const [eliminated, setEliminated] = useState<ReadonlySet<string>>(new Set());
  const [elimination, setEliminationState] = useState(() => {
    try {
      return localStorage.getItem(ELIMINATION_KEY) === 'on';
    } catch {
      return false;
    }
  });

  const save = (next: Media[]) => {
    store(STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const add = useCallback((m: Media) => {
    setTitles(prev =>
      prev.length >= MAX_LIST_SIZE || prev.some(t => mediaKey(t) === mediaKey(m)) ? prev : save([...prev, m])
    );
  }, []);

  const remove = useCallback((m: Media) => {
    setTitles(prev => save(prev.filter(t => mediaKey(t) !== mediaKey(m))));
    setEliminated(prev => {
      const next = new Set(prev);
      next.delete(mediaKey(m));
      return next;
    });
  }, []);

  const eliminate = useCallback((m: Media) => {
    setEliminated(prev => new Set(prev).add(mediaKey(m)));
  }, []);

  const restore = useCallback(() => setEliminated(new Set()), []);

  const setElimination = useCallback((on: boolean) => {
    setEliminationState(on);
    // Knock-outs only mean something inside an elimination round
    if (!on) setEliminated(new Set());
    store(ELIMINATION_KEY, on ? 'on' : 'off');
  }, []);

  const remaining = useMemo(() => titles.filter(t => !eliminated.has(mediaKey(t))), [titles, eliminated]);

  return {
    titles,
    remaining,
    eliminated,
    isFull: titles.length >= MAX_LIST_SIZE,
    has: (m: Media) => titles.some(t => mediaKey(t) === mediaKey(m)),
    add,
    remove,
    elimination,
    setElimination,
    eliminate,
    restore,
  };
};
