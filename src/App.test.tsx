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

  it('toggles the wheel display mode', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTitle('Switch to full bleed mode'));
    expect(screen.getByTitle('Switch to DVD case mode')).toBeInTheDocument();
  });
});
