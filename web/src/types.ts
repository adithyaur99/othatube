/**
 * TypeScript types for Tamil MTV static app
 */

export interface Video {
  youtube_id: string;
  title?: string;
  // Optional fields (not in minimal export)
  channel_id?: string;
  channel_title?: string;
  published_at?: string;
  year?: number;
  decade?: number;
  duration_sec?: number;
  thumb_url?: string;
  embeddable?: boolean;
  is_music_candidate?: boolean;
}

export interface Station {
  slug: string;
  name: string;
  description: string;
  videoFile: string;  // Changed from dataFile
  icon: string;
  filterFn?: string;
}

export interface PlayerState {
  isPlaying: boolean;
  isReady: boolean;
  currentVideo: Video | null;
  queue: Video[];
  history: Video[];
  badVideos: Set<string>;
}

export type PlayerAction =
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_READY'; payload: boolean }
  | { type: 'SET_CURRENT'; payload: Video | null }
  | { type: 'SET_QUEUE'; payload: Video[] }
  | { type: 'ADD_TO_HISTORY'; payload: Video }
  | { type: 'MARK_BAD'; payload: string }
  | { type: 'SKIP_TO_NEXT' }
  | { type: 'SHUFFLE_QUEUE' };

// YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: {
        height?: string | number;
        width?: string | number;
        videoId?: string;
        host?: string;  // For youtube-nocookie.com (fewer ads)
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: number }) => void;
          onError?: (event: { data: number }) => void;
        };
      }) => YTPlayer;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoUrl: () => string;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

export const PlayerStates = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;
