/**
 * Global Store using Zustand-like pattern with React hooks
 * Manages stations, videos, queue, and playback state
 */

import { useState, useCallback } from 'react';
import type { Video, Station } from '../types';

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Local storage keys
const STORAGE_KEYS = {
  BAD_VIDEOS: 'tamil-mtv-bad-videos',
  LAST_STATION: 'tamil-mtv-last-station',
  VOLUME: 'tamil-mtv-volume',
};

// Load bad videos from localStorage
function loadBadVideos(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.BAD_VIDEOS);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to load bad videos:', e);
  }
  return new Set();
}

// Save bad videos to localStorage
function saveBadVideos(badVideos: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BAD_VIDEOS, JSON.stringify([...badVideos]));
  } catch (e) {
    console.error('Failed to save bad videos:', e);
  }
}

export interface AppState {
  // Stations
  stations: Station[];
  currentStation: Station | null;
  isLoadingStation: boolean;

  // Videos
  videos: Video[];
  queue: Video[];
  currentVideo: Video | null;
  history: Video[];
  badVideos: Set<string>;

  // Playback
  isPlaying: boolean;
  volume: number;

  // Actions
  loadStations: () => Promise<void>;
  selectStation: (station: Station) => Promise<void>;
  playNext: () => void;
  playPrevious: () => void;
  jumpToVideo: (queueIndex: number) => void;
  markBadVideo: (videoId: string) => void;
  shuffleQueue: () => void;
  setIsPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
}

export function useAppStore(): AppState {
  const [stations, setStations] = useState<Station[]>([]);
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [isLoadingStation, setIsLoadingStation] = useState(false);

  const [videos, setVideos] = useState<Video[]>([]);
  const [queue, setQueue] = useState<Video[]>([]);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [history, setHistory] = useState<Video[]>([]);
  const [badVideos, setBadVideos] = useState<Set<string>>(loadBadVideos);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.VOLUME);
    return stored ? parseInt(stored, 10) : 80;
  });

  // Load stations on mount
  const loadStations = useCallback(async () => {
    try {
      const response = await fetch('/data/stations.json');
      const data = await response.json();
      setStations(data);

      // Try to restore last station
      const lastStationSlug = localStorage.getItem(STORAGE_KEYS.LAST_STATION);
      if (lastStationSlug) {
        const lastStation = data.find((s: Station) => s.slug === lastStationSlug);
        if (lastStation) {
          // Don't auto-select, just store for reference
        }
      }
    } catch (e) {
      console.error('Failed to load stations:', e);
    }
  }, []);

  // Select a station and load its videos
  const selectStation = useCallback(async (station: Station) => {
    setIsLoadingStation(true);
    setCurrentStation(station);
    localStorage.setItem(STORAGE_KEYS.LAST_STATION, station.slug);

    try {
      const response = await fetch(`/data/${station.videoFile}`);
      const data: Video[] = await response.json();

      // Filter out bad videos and non-embeddable
      const validVideos = data.filter(
        (v) => !badVideos.has(v.youtube_id) && v.embeddable !== false
      );

      setVideos(validVideos);

      // Shuffle and create queue
      const shuffled = shuffleArray(validVideos);
      setQueue(shuffled.slice(1)); // All except first
      setCurrentVideo(shuffled[0] || null); // First video
      setHistory([]);
      setIsPlaying(true);
    } catch (e) {
      console.error('Failed to load station videos:', e);
    } finally {
      setIsLoadingStation(false);
    }
  }, [badVideos]);

  // Play next video in queue
  const playNext = useCallback(() => {
    if (queue.length === 0) {
      // Reshuffle from videos if queue is empty
      if (videos.length > 0) {
        const shuffled = shuffleArray(videos.filter(v => !badVideos.has(v.youtube_id)));
        setQueue(shuffled.slice(1));
        setCurrentVideo(shuffled[0] || null);
      }
      return;
    }

    // Add current to history
    if (currentVideo) {
      setHistory((prev) => [currentVideo, ...prev].slice(0, 50)); // Keep last 50
    }

    // Pop from queue
    const [next, ...rest] = queue;
    setCurrentVideo(next);
    setQueue(rest);
  }, [queue, currentVideo, videos, badVideos]);

  // Play previous video from history
  const playPrevious = useCallback(() => {
    if (history.length === 0) return;

    // Put current back in queue
    if (currentVideo) {
      setQueue((prev) => [currentVideo, ...prev]);
    }

    // Pop from history
    const [prev, ...rest] = history;
    setCurrentVideo(prev);
    setHistory(rest);
  }, [history, currentVideo]);

  // Jump to a specific video in the queue
  const jumpToVideo = useCallback((queueIndex: number) => {
    if (queueIndex < 0 || queueIndex >= queue.length) return;

    // Add current to history
    if (currentVideo) {
      setHistory((prev) => [currentVideo, ...prev].slice(0, 50));
    }

    // Get the target video and remove it from queue
    const targetVideo = queue[queueIndex];
    const newQueue = [...queue.slice(0, queueIndex), ...queue.slice(queueIndex + 1)];

    setCurrentVideo(targetVideo);
    setQueue(newQueue);
  }, [queue, currentVideo]);

  // Mark a video as bad (won't play again)
  const markBadVideo = useCallback((videoId: string) => {
    setBadVideos((prev) => {
      const next = new Set(prev);
      next.add(videoId);
      saveBadVideos(next);
      return next;
    });

    // Skip to next if current video was marked bad
    if (currentVideo?.youtube_id === videoId) {
      playNext();
    }
  }, [currentVideo, playNext]);

  // Shuffle the current queue
  const shuffleQueue = useCallback(() => {
    setQueue((prev) => shuffleArray(prev));
  }, []);

  // Set volume with persistence
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, v));
    setVolumeState(clamped);
    localStorage.setItem(STORAGE_KEYS.VOLUME, String(clamped));
  }, []);

  return {
    stations,
    currentStation,
    isLoadingStation,
    videos,
    queue,
    currentVideo,
    history,
    badVideos,
    isPlaying,
    volume,
    loadStations,
    selectStation,
    playNext,
    playPrevious,
    jumpToVideo,
    markBadVideo,
    shuffleQueue,
    setIsPlaying,
    setVolume,
  };
}

export default useAppStore;
