/**
 * Now Playing Component - Retro MTV Style
 *
 * Displays current video info with gold accents
 */

import type { Video, Station } from '../types';
import { useVideoTitle } from '../hooks/useVideoTitle';
import { getYouTubeThumbnail } from '../utils/thumbnail';

interface NowPlayingProps {
  video: Video | null;
  station: Station | null;
  isPlaying: boolean;
  queuePosition?: number;
  queueTotal?: number;
}

export function NowPlaying({
  video,
  station,
  isPlaying,
  queuePosition = 1,
  queueTotal = 0,
}: NowPlayingProps) {
  const { title, isLoading } = useVideoTitle(video?.youtube_id || null);

  if (!video) {
    return (
      <div className="now-playing">
        <div className="now-playing-label">NOW PLAYING</div>
        <div className="text-gray-500">Select a channel to start...</div>
      </div>
    );
  }

  // Parse title to extract song name and movie (common format: "Song - Movie | Artist")
  const displayTitle = isLoading ? 'Loading...' : title;

  return (
    <div className="now-playing">
      {/* Station & Position */}
      <div className="flex items-center justify-between mb-3">
        <div className="now-playing-label flex items-center gap-2">
          {isPlaying && (
            <span className="flex gap-0.5 h-3 items-end">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="equalizer-bar" style={{ width: '2px' }} />
              ))}
            </span>
          )}
          NOW PLAYING
        </div>
        {station && (
          <div className="text-sm text-gray-500">
            {station.icon} {station.name}
          </div>
        )}
      </div>

      {/* Video Info */}
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="w-32 h-24 flex-shrink-0 rounded overflow-hidden border border-gray-700">
          <img
            src={getYouTubeThumbnail(video.youtube_id, 'mq')}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="now-playing-title truncate" title={displayTitle}>
            {displayTitle}
          </div>
          <div className="now-playing-channel">
            {video.channel_title}
          </div>
          {video.year && video.year > 0 && (
            <div className="text-sm text-gray-600 mt-1">
              📅 {video.year}
            </div>
          )}
        </div>
      </div>

      {/* Queue Position */}
      {queueTotal > 0 && (
        <div className="mt-3 text-sm text-gray-500">
          Video {queuePosition} of {queueTotal.toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default NowPlaying;
