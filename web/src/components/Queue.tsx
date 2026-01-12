/**
 * Queue Component - Retro MTV Style
 *
 * Shows upcoming videos with title fetching
 */

import type { Video } from '../types';
import { useVideoTitle } from '../hooks/useVideoTitle';
import { useEffect } from 'react';
import { prefetchTitles } from '../hooks/useVideoTitle';
import { getYouTubeThumbnail } from '../utils/thumbnail';

interface QueueProps {
  queue: Video[];
  history: Video[];
  onJumpToVideo?: (index: number) => void;
}

function QueueItem({
  video,
  index,
  onClick,
}: {
  video: Video;
  index: number;
  onClick?: () => void;
}) {
  const { title, isLoading } = useVideoTitle(video.youtube_id);

  return (
    <div
      className="queue-item cursor-pointer hover:bg-gray-800/50 transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <span className="w-6 text-center text-gray-600">{index + 1}</span>
      <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-black">
        <img
          src={getYouTubeThumbnail(video.youtube_id, 'mq')}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {isLoading ? (
            <span className="text-gray-500">Loading...</span>
          ) : (
            title
          )}
        </p>
        <p className="text-xs text-gray-600 truncate">{video.channel_title}</p>
      </div>
      <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100">
        Play
      </span>
    </div>
  );
}

export function Queue({ queue, history, onJumpToVideo }: QueueProps) {
  const displayQueue = queue.slice(0, 5);

  // Prefetch titles for visible queue items
  useEffect(() => {
    const ids = displayQueue.map((v) => v.youtube_id);
    prefetchTitles(ids);
  }, [displayQueue.map(v => v.youtube_id).join(',')]);

  return (
    <div className="retro-panel p-4 h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="mtv-subtitle tracking-widest">⏭ UP NEXT</h3>
        <span className="text-sm text-gray-600">{queue.length} in queue</span>
      </div>

      {displayQueue.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <p>Queue is empty</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {displayQueue.map((video, index) => (
            <QueueItem
              key={`${video.youtube_id}-${index}`}
              video={video}
              index={index}
              onClick={onJumpToVideo ? () => onJumpToVideo(index) : undefined}
            />
          ))}

          {queue.length > 5 && (
            <div className="text-center text-sm text-gray-600 py-2">
              + {queue.length - 5} more videos
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h4 className="text-sm text-gray-600 mb-2 tracking-wider">
            ⏮ RECENTLY PLAYED
          </h4>
          <div className="space-y-1">
            {history.slice(0, 3).map((video, index) => (
              <div
                key={`history-${video.youtube_id}-${index}`}
                className="flex items-center gap-2 text-sm text-gray-600 opacity-60"
              >
                <div className="w-10 h-8 rounded overflow-hidden">
                  <img
                    src={getYouTubeThumbnail(video.youtube_id, 'default')}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="truncate flex-1">{video.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Queue;
