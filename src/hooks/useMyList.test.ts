import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_LIST_SIZE, useMyList } from './useMyList';
import type { Media } from '../types';

const title = (id: number, media_type: 'movie' | 'tv' = 'movie') =>
  ({ id, title: `Title ${id}`, poster_path: `/p${id}.jpg`, media_type, vote_average: 7 }) as Media;

describe('useMyList', () => {
  it('keeps the list across reloads', () => {
    const first = renderHook(() => useMyList());
    act(() => first.result.current.add(title(1)));
    act(() => first.result.current.add(title(2, 'tv')));
    first.unmount();

    const { result } = renderHook(() => useMyList());
    expect(result.current.titles.map(t => t.title)).toEqual(['Title 1', 'Title 2']);
  });

  it('starts empty when the stored list is unreadable, and skips entries that are not titles', () => {
    localStorage.setItem('moviewheel_my_list', '{oops');
    expect(renderHook(() => useMyList()).result.current.titles).toEqual([]);

    localStorage.setItem('moviewheel_my_list', JSON.stringify([title(1), { id: 'x' }, null, title(2)]));
    expect(renderHook(() => useMyList()).result.current.titles.map(t => t.id)).toEqual([1, 2]);
  });

  it('adds a title once and stops at a full wheel', () => {
    const { result } = renderHook(() => useMyList());
    act(() => result.current.add(title(1)));
    act(() => result.current.add(title(1)));
    // Same number, different kind of title: a show is not the movie
    act(() => result.current.add(title(1, 'tv')));
    expect(result.current.titles).toHaveLength(2);

    for (let i = 2; i <= MAX_LIST_SIZE + 3; i++) act(() => result.current.add(title(i)));
    expect(result.current.titles).toHaveLength(MAX_LIST_SIZE);
    expect(result.current.isFull).toBe(true);
  });

  it('knocks picks out of the running until they are brought back, without touching the list', () => {
    const { result } = renderHook(() => useMyList());
    for (const id of [1, 2, 3]) act(() => result.current.add(title(id)));

    act(() => result.current.eliminate(title(2)));
    expect(result.current.remaining.map(t => t.id)).toEqual([1, 3]);
    expect(result.current.titles).toHaveLength(3);

    act(() => result.current.restore());
    expect(result.current.remaining.map(t => t.id)).toEqual([1, 2, 3]);
  });

  it('puts knocked-out titles back in the running when elimination is turned off', () => {
    const { result } = renderHook(() => useMyList());
    for (const id of [1, 2, 3]) act(() => result.current.add(title(id)));
    act(() => result.current.setElimination(true));
    act(() => result.current.eliminate(title(2)));
    act(() => result.current.setElimination(false));
    expect(result.current.remaining.map(t => t.id)).toEqual([1, 2, 3]);
  });

  it('forgets a knocked-out title that is removed, so adding it again puts it back in the running', () => {
    const { result } = renderHook(() => useMyList());
    for (const id of [1, 2]) act(() => result.current.add(title(id)));
    act(() => result.current.eliminate(title(2)));
    act(() => result.current.remove(title(2)));
    act(() => result.current.add(title(2)));
    expect(result.current.remaining.map(t => t.id)).toEqual([1, 2]);
  });
});
