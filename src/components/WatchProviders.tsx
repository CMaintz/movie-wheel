import React from 'react';
import type { WatchProvidersResult, WatchProviderEntry } from '../services/api';

interface WatchProvidersProps {
  providers: WatchProvidersResult | null;
  loading?: boolean;
}

const ProviderGroup: React.FC<{ title: string; items: WatchProviderEntry[]; link?: string }> = ({
  title,
  items,
  link,
}) => {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map(p => (
          <a
            key={p.provider_id}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-bg-default hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-lg transition-colors"
            title={p.provider_name}
          >
            <img
              src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
              alt={p.provider_name}
              className="w-6 h-6 rounded object-cover"
            />
            <span className="text-white text-xs font-medium">{p.provider_name}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

const WatchProviders: React.FC<WatchProvidersProps> = ({ providers, loading }) => {
  if (loading) {
    return (
      <div className="text-white/40 text-sm">Loading streaming info...</div>
    );
  }

  if (!providers) return null;

  const hasAny = (providers.flatrate?.length || 0) + (providers.rent?.length || 0) + (providers.buy?.length || 0) > 0;

  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Where to Watch</h3>
      {providers.flatrate && (
        <ProviderGroup title="Stream" items={providers.flatrate} link={providers.link} />
      )}
      {providers.rent && (
        <ProviderGroup title="Rent" items={providers.rent} link={providers.link} />
      )}
      {providers.buy && (
        <ProviderGroup title="Buy" items={providers.buy} link={providers.link} />
      )}
    </div>
  );
};

export default WatchProviders;
