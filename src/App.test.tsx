import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  fetchWheelCandidates,
  getMediaDetails,
  getMergedGenres,
  getWatchProviders,
} from './services/api';
import type { Media, MediaDetails } from './types';

vi.mock('./services/api', () => ({
  fetchWheelCandidates: vi.fn(),
  getMediaDetails: vi.fn(),
  getMergedGenres: vi.fn(),
  getWatchProviders: vi.fn(),
}));

// jsdom has no canvas: every context method is a no-op that returns the context itself.
const fakeContext: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
  get: (target, prop) => (prop in target ? target[prop as keyof typeof target] : () => fakeContext),
  set: () => true,
});

class InstantImage {
  onload: (() => void) | null = null;
  crossOrigin = '';
  complete = true;
  naturalWidth = 1;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const movies: Media[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: `Movie ${i + 1}`,
  poster_path: `/p${i + 1}.jpg`,
  backdrop_path: '',
  vote_average: 7,
  vote_count: 1,
  popularity: 1,
  overview: '',
  genres: [],
  media_type: 'movie',
  release_date: '2001-01-01',
}));

const renderApp = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App />
    </QueryClientProvider>
  );

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as never);
    vi.stubGlobal('Image', InstantImage);
    // Jump every animation frame to the end of the spin.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now() + 10_000), 0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    vi.mocked(getMergedGenres).mockResolvedValue([{ name: 'Drama', movieId: 18, tvId: 18 }]);
    vi.mocked(fetchWheelCandidates).mockResolvedValue(movies);
    vi.mocked(getMediaDetails).mockImplementation(
      async (_type, id) => ({ ...movies[id - 1], overview: `Plot of ${id}` }) as MediaDetails
    );
    vi.mocked(getWatchProviders).mockResolvedValue(null);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
  });

  it('spins the wheel and presents the picked title', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findAllByRole('button', { name: 'Drama' })).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Spin!' }));

    expect(await screen.findByText('Plot of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movie 4' })).toBeInTheDocument();
    expect(fetchWheelCandidates).toHaveBeenCalledOnce();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Plot of 4')).not.toBeInTheDocument();
  });

  it('switches the box style and remembers it', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('button', { name: 'VHS' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'DVD' }));
    expect(screen.getByRole('button', { name: 'DVD' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('moviewheel_case_style')).toBe('dvd');
  });

  it('spins from the hub and the Space key, but not while typing', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Spin the wheel' }));
    expect(await screen.findByRole('dialog', { name: 'Movie 4' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const yearInput = screen.getAllByRole('spinbutton')[0];
    yearInput.focus();
    await user.keyboard(' ');
    expect(fetchWheelCandidates).toHaveBeenCalledOnce();

    yearInput.blur();
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: 'Movie 4' })).toBeInTheDocument();
    expect(fetchWheelCandidates).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('The wheel picked Movie 4.');
  });

  it('opens the mobile filter drawer and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('shows an error when no titles match', async () => {
    vi.mocked(fetchWheelCandidates).mockResolvedValue([]);
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Spin!' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No movies found/);
  });
});
