import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FilterPanel from './FilterPanel';
import type { FilterState } from '../hooks/useFilters';
import type { MergedGenre } from '../types';

const genres: MergedGenre[] = [
  { name: 'Action', movieId: 28, tvId: null },
  { name: 'Comedy', movieId: 35, tvId: 35 },
  { name: 'Drama', movieId: 18, tvId: 18 },
  { name: 'Kids', movieId: null, tvId: 10762 },
  { name: 'Romance', movieId: 10749, tvId: null },
];

const baseFilters: FilterState = {
  mediaType: 'movie',
  selectedGenres: ['Drama'],
  genreMode: 'OR',
  selectedCombos: [],
  minRating: 6,
  minVotes: 100,
  language: 'en',
  yearFrom: 1995,
  yearTo: 2020,
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof FilterPanel>> = {}) => {
  const props = {
    filters: baseFilters,
    genres,
    onSetMediaType: vi.fn(),
    onToggleGenre: vi.fn(),
    onToggleCombo: vi.fn(),
    onSetGenreMode: vi.fn(),
    onSetMinRating: vi.fn(),
    onSetMinVotes: vi.fn(),
    onSetLanguage: vi.fn(),
    onSetYearFrom: vi.fn(),
    onSetYearTo: vi.fn(),
    onReset: vi.fn(),
    disabled: false,
    ...overrides,
  };
  render(<FilterPanel {...props} />);
  return props;
};

describe('FilterPanel', () => {
  it('disables genres that do not exist for the selected media type', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Kids' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Action' })).toBeEnabled();
  });

  it('forwards user choices to the callbacks', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Action' }));
    await user.click(screen.getByRole('button', { name: 'TV Shows' }));
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(screen.getByTitle('Reset filters'));

    expect(props.onToggleGenre).toHaveBeenCalledWith('Action');
    expect(props.onSetMediaType).toHaveBeenCalledWith('tv');
    expect(props.onSetGenreMode).toHaveBeenCalledWith('AND');
    expect(props.onReset).toHaveBeenCalled();
  });

  it('summarises the selected genres', () => {
    renderPanel();
    expect(screen.getByText(/Matching any of:/)).toHaveTextContent('Drama');
  });

  it('disables every control while the wheel is busy', () => {
    renderPanel({ disabled: true });
    expect(screen.getByRole('button', { name: 'Movies' })).toBeDisabled();
    expect(screen.getByRole('slider')).toBeDisabled();
  });

  it('offers genre combos and disables the ones the media type cannot match', async () => {
    const user = userEvent.setup();
    const props = renderPanel({ filters: { ...baseFilters, mediaType: 'tv' } });

    expect(screen.getByRole('button', { name: 'Rom-Com' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Dramedy' }));

    expect(props.onToggleCombo).toHaveBeenCalledWith('Dramedy');
  });

  it('summarises the selected combos', () => {
    renderPanel({ filters: { ...baseFilters, selectedCombos: ['Rom-Com'] } });
    expect(screen.getByText(/Also spinning:/)).toHaveTextContent('Rom-Com');
  });

  it('forwards the vote floor and language', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.selectOptions(screen.getByLabelText('Min Votes'), '500');
    await user.selectOptions(screen.getByLabelText('Language'), 'Any language');

    expect(props.onSetMinVotes).toHaveBeenCalledWith(500);
    expect(props.onSetLanguage).toHaveBeenCalledWith('');
  });

  it('stores a newly chosen watch region', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Watch Region/ }));
    await user.selectOptions(screen.getByLabelText('Watch region'), 'DK');

    expect(screen.getByRole('button', { name: /Watch Region: DK/ })).toBeInTheDocument();
    expect(localStorage.getItem('moviewheel_region')).toBe('DK');
  });
});
