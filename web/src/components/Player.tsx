/**
 * YouTube Player Component
 *
 * Wraps the YouTube IFrame Player API with controls
 * and integrates with the app store.
 */

import { useEffect, useRef } from 'react';
import type { Video } from '../types';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';

interface PlayerProps {
  currentVideo: Video | null;
  onVideoEnd: () => void;
  onVideoError: (videoId: string) => void;
  onPlayStateChange: (playing: boolean) => void;
  volume: number;
}

export function Player({
  currentVideo,
  onVideoEnd,
  onVideoError,
  onPlayStateChange,
  volume,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastVideoRef = useRef<string | null>(null);

  const {
    isReady,
    loadVideo,
    setVolume,
  } = useYouTubePlayer({
    containerId: 'youtube-player',
    onReady: () => {
      console.log('YouTube Player Ready');
      if (currentVideo) {
        loadVideo(currentVideo);
      }
    },
    onEnd: () => {
      onVideoEnd();
    },
    onError: (errorCode) => {
      console.error('YouTube Error:', errorCode);
      // Error codes: 2 (invalid param), 5 (HTML5 error), 100 (not found),
      // 101/150 (embedding disabled)
      if (currentVideo && [100, 101, 150].includes(errorCode)) {
        onVideoError(currentVideo.youtube_id);
      }
      // Auto-skip on any error
      onVideoEnd();
    },
    onStateChange: (state) => {
      // 1 = playing, 2 = paused
      onPlayStateChange(state === 1);
    },
  });

  // Load new video when currentVideo changes
  useEffect(() => {
    if (isReady && currentVideo && currentVideo.youtube_id !== lastVideoRef.current) {
      lastVideoRef.current = currentVideo.youtube_id;
      loadVideo(currentVideo);
    }
  }, [isReady, currentVideo, loadVideo]);

  // Update volume
  useEffect(() => {
    if (isReady) {
      setVolume(volume);
    }
  }, [isReady, volume, setVolume]);

  return (
    <div className="relative">
      {/* Player Container */}
      <div className="player-container shadow-2xl">
        <div id="youtube-player" ref={containerRef} />

        {/* Loading overlay */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-mtv-pink border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading player...</p>
            </div>
          </div>
        )}

        {/* No video selected overlay */}
        {isReady && !currentVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📻</span>
              <p className="text-xl text-gray-400">Select a station to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Player;
