/**
 * YouTube IFrame Player API Hook
 *
 * This hook manages the YouTube player lifecycle and provides
 * a clean interface for controlling video playback.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Video, YTPlayer } from '../types';
import { PlayerStates } from '../types';

// Duration filter constants
const MIN_DURATION = 100;  // 1:40 - skip shorts
const MAX_DURATION = 480;  // 8:00 - skip compilations

interface UseYouTubePlayerOptions {
  containerId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (errorCode: number) => void;
  onEnd?: () => void;
}

interface UseYouTubePlayerReturn {
  player: YTPlayer | null;
  isReady: boolean;
  isPlaying: boolean;
  loadVideo: (video: Video) => void;
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  toggleMute: () => void;
  isMuted: boolean;
}

// Load YouTube IFrame API script
let apiLoaded = false;
let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();

  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';

    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      resolve();
    };

    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  });

  return apiLoadPromise;
}

export function useYouTubePlayer({
  containerId,
  onReady,
  onStateChange,
  onError,
  onEnd,
}: UseYouTubePlayerOptions): UseYouTubePlayerReturn {
  const playerRef = useRef<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Initialize player
  useEffect(() => {
    let mounted = true;

    loadYouTubeAPI().then(() => {
      if (!mounted) return;

      // Create player instance using youtube-nocookie.com for privacy/fewer ads
      const player = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          disablekb: 0,
          iv_load_policy: 3,  // Hide annotations
        },
        events: {
          onReady: () => {
            if (!mounted) return;
            setIsReady(true);
            onReady?.();
          },
          onStateChange: (event: { data: number }) => {
            if (!mounted) return;

            const state = event.data;
            setIsPlaying(state === PlayerStates.PLAYING);

            // Check duration when video starts playing
            if (state === PlayerStates.PLAYING && playerRef.current) {
              // Wait for duration to be available, then check
              const checkDuration = (attempt: number) => {
                if (!playerRef.current || attempt > 10) return;  // Max 10 attempts (5 seconds)

                const duration = playerRef.current.getDuration();
                console.log(`🔍 Duration check attempt ${attempt}: ${duration}s`);

                if (duration > 0) {
                  if (duration < MIN_DURATION) {
                    console.log(`⏭️ SKIPPING: Video too short (${Math.round(duration)}s < ${MIN_DURATION}s)`);
                    onEnd?.();
                  } else if (duration > MAX_DURATION) {
                    console.log(`⏭️ SKIPPING: Video too long (${Math.round(duration)}s > ${MAX_DURATION}s)`);
                    onEnd?.();
                  } else {
                    console.log(`✅ Video OK: ${Math.round(duration)}s (within ${MIN_DURATION}s-${MAX_DURATION}s)`);
                  }
                } else {
                  // Duration not ready yet, retry in 500ms
                  setTimeout(() => checkDuration(attempt + 1), 500);
                }
              };

              // Start checking after 1 second
              setTimeout(() => checkDuration(1), 1000);
            }

            if (state === PlayerStates.ENDED) {
              onEnd?.();
            }

            onStateChange?.(state);
          },
          onError: (event: { data: number }) => {
            if (!mounted) return;
            console.error('YouTube Player Error:', event.data);
            onError?.(event.data);
          },
        },
      }) as unknown as YTPlayer;

      playerRef.current = player;
    });

    return () => {
      mounted = false;
      playerRef.current?.destroy();
    };
  }, [containerId]); // Only re-init if container changes

  // Load a video
  const loadVideo = useCallback((video: Video) => {
    if (playerRef.current && isReady) {
      playerRef.current.loadVideoById(video.youtube_id);
    }
  }, [isReady]);

  // Playback controls
  const play = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const setVolume = useCallback((volume: number) => {
    playerRef.current?.setVolume(Math.max(0, Math.min(100, volume)));
  }, []);

  const getVolume = useCallback(() => {
    return playerRef.current?.getVolume() ?? 100;
  }, []);

  const toggleMute = useCallback(() => {
    if (playerRef.current) {
      if (playerRef.current.isMuted()) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    }
  }, []);

  return {
    player: playerRef.current,
    isReady,
    isPlaying,
    loadVideo,
    play,
    pause,
    setVolume,
    getVolume,
    toggleMute,
    isMuted,
  };
}

export default useYouTubePlayer;
