/**
 * Station Selector Component - Retro MTV Style
 *
 * Channel buttons with gradient backgrounds and glow effects
 */

import type { Station } from '../types';

interface StationSelectorProps {
  stations: Station[];
  currentStation: Station | null;
  onSelect: (station: Station) => void;
  isLoading: boolean;
  videoCounts?: Record<string, number>;
}

export function StationSelector({
  stations,
  currentStation,
  onSelect,
  isLoading,
  videoCounts = {},
}: StationSelectorProps) {
  if (stations.length === 0) {
    return (
      <div className="retro-panel p-6">
        <div className="text-center text-gray-500">
          <span className="loading-dot">.</span>
          <span className="loading-dot">.</span>
          <span className="loading-dot">.</span>
          <span className="ml-2">LOADING CHANNELS</span>
        </div>
      </div>
    );
  }

  return (
    <div className="retro-panel p-4">
      <h2 className="text-lg mb-4 mtv-subtitle tracking-widest flex items-center justify-between">
        <span>📺 SELECT CHANNEL</span>
        <span className="text-xs text-gray-500 font-normal">{stations.length} channels</span>
      </h2>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
        {stations.map((station) => {
          const isActive = currentStation?.slug === station.slug;
          const count = videoCounts[station.slug] || 0;

          return (
            <button
              key={station.slug}
              onClick={() => onSelect(station)}
              disabled={isLoading}
              className={`channel-btn ${isActive ? 'active' : ''} ${
                isLoading ? 'opacity-50 cursor-wait' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{station.icon}</span>
                  <div>
                    <div className="font-bold">{station.name}</div>
                    <div className="text-sm text-gray-400">
                      {station.description}
                    </div>
                  </div>
                </div>

                {count > 0 && (
                  <span className="count">{count.toLocaleString()} videos</span>
                )}
              </div>

              {isActive && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="flex gap-0.5 h-4 items-end">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="equalizer-bar" />
                    ))}
                  </span>
                  <span>NOW PLAYING</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StationSelector;
