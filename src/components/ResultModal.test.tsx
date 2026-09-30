import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultModal from './ResultModal';
import { getMediaDetails, getWatchProviders } from '../services/api';
import type { Media, MediaDetails } from '../types';

vi.mock('../services/api', () => ({
  getMediaDetails: vi.fn(),
  getWatchProviders: vi.fn(),
}));

const media: Media = {
  id: 603,
  title: 'The Matrix',
  poster_path: '/matrix.jpg',
  backdrop_path: '',
  vote_average: 8.2,
  vote_count: 1,
  popularity: 1,
  overview: '',
  genres: [],
  media_type: 'movie',
  release_date: '1999-03-31',
};

const details = {
  ...media,
  overview: 'A hacker learns the truth.',
  runtime: 136,
  genres: [{ id: 28, name: 'Action' }],
  imdb_id: 'tt0133093',
  credits: {
    cast: [{ id: 1, name: 'Keanu Reeves', character: 'Neo', profile_path: '' }],
    crew: [
      { id: 2, name: 'Lana Wachowski', job: 'Director', profile_path: '', department: 'Directing' },
      { id: 3, name: 'Lilly Wachowski', job: 'Director', profile_path: '', department: 'Directing' },
      { id: 4, name: 'Joel Silver', job: 'Producer', profile_path: '', department: 'Production' },
    ],
  },
  videos: {
    results: [
      { id: 'a', key: 'teaser1', name: 'Teaser', site: 'YouTube', type: 'Teaser' },
      { id: 'b', key: 'vKQi3bBA1y8', name: 'Trailer', site: 'YouTube', type: 'Trailer' },
    ],
  },
  status: 'Released',
} as MediaDetails;

describe('ResultModal', () => {
  beforeEach(() => {
    vi.mocked(getMediaDetails).mockResolvedValue(details);
    vi.mocked(getWatchProviders).mockResolvedValue({
      link: 'https://tmdb.example/watch',
      flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png', display_priority: 1 }],
    });
  });

  it('shows details, cast, runtime and streaming providers', async () => {
    render(<ResultModal media={media} onClose={vi.fn()} onSpinAgain={vi.fn()} />);

    expect(await screen.findByText('A hacker learns the truth.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Matrix' })).toBeInTheDocument();
    expect(screen.getByText('2h 16m')).toBeInTheDocument();
    expect(screen.getByText('Keanu Reeves')).toBeInTheDocument();
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /IMDb/ })).toHaveAttribute(
      'href',
      'https://www.imdb.com/title/tt0133093'
    );
  });

  it('shows the directors and links the YouTube trailer', async () => {
    render(<ResultModal media={media} onClose={vi.fn()} onSpinAgain={vi.fn()} />);

    expect(await screen.findByText('Lana Wachowski, Lilly Wachowski')).toBeInTheDocument();
    expect(screen.getByText(/Directors:/)).toBeInTheDocument();
    expect(screen.queryByText(/Joel Silver/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Trailer/ })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=vKQi3bBA1y8'
    );
  });

  it('shows who created a TV show and no trailer link when there is none', async () => {
    const show: Media = { ...media, media_type: 'tv' };
    vi.mocked(getMediaDetails).mockResolvedValue({
      ...details,
      media_type: 'tv',
      created_by: [{ id: 9, name: 'Vince Gilligan' }],
      videos: { results: [] },
    } as MediaDetails);
    render(<ResultModal media={show} onClose={vi.fn()} onSpinAgain={vi.fn()} />);

    expect(await screen.findByText('Vince Gilligan')).toBeInTheDocument();
    expect(screen.getByText(/Created by:/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Trailer/ })).not.toBeInTheDocument();
  });

  it('closes on Escape and spins again on request', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSpinAgain = vi.fn();
    render(<ResultModal media={media} onClose={onClose} onSpinAgain={onSpinAgain} />);

    await user.click(await screen.findByRole('button', { name: /Spin Again/ }));
    await user.keyboard('{Escape}');

    expect(onSpinAgain).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('still renders the basics when the detail request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getMediaDetails).mockRejectedValue(new Error('boom'));

    render(<ResultModal media={media} onClose={vi.fn()} onSpinAgain={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'The Matrix' })).toBeInTheDocument();
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument();
  });
});
