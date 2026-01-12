/**
 * Hook to fetch video titles from YouTube oEmbed API
 *
 * This uses YouTube's public oEmbed endpoint which doesn't require an API key.
 * Titles are cached in localStorage to avoid repeated fetches.
 */

import { useState, useEffect } from 'react';

const CACHE_KEY = 'tamil-mtv-title-cache';
const CACHE_VERSION = 1;

interface TitleCache {
  version: number;
  titles: Record<string, string>;
}

// Load cache from localStorage
function loadCache(): Record<string, string> {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed: TitleCache = JSON.parse(stored);
      if (parsed.version === CACHE_VERSION) {
        return parsed.titles;
      }
    }
  } catch (e) {
    console.error('Failed to load title cache:', e);
  }
  return {};
}

// Save cache to localStorage
function saveCache(titles: Record<string, string>): void {
  try {
    const cache: TitleCache = { version: CACHE_VERSION, titles };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save title cache:', e);
  }
}

// In-memory cache shared across all hook instances
let memoryCache: Record<string, string> = loadCache();
let pendingFetches: Record<string, Promise<string>> = {};

/**
 * Fetch video title from YouTube oEmbed API
 */
async function fetchTitle(videoId: string): Promise<string> {
  // Check memory cache first
  if (memoryCache[videoId]) {
    return memoryCache[videoId];
  }

  // Check if already fetching
  const pending = pendingFetches[videoId];
  if (pending !== undefined) {
    return pending;
  }

  // Start fetch
  pendingFetches[videoId] = (async () => {
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const title = data.title || `Video ${videoId}`;

      // Cache the result
      memoryCache[videoId] = title;
      saveCache(memoryCache);

      return title;
    } catch (e) {
      console.warn(`Failed to fetch title for ${videoId}:`, e);
      return `Video ${videoId}`;
    } finally {
      delete pendingFetches[videoId];
    }
  })();

  return pendingFetches[videoId];
}

/**
 * Hook to get video title with automatic fetching
 */
export function useVideoTitle(videoId: string | null): { title: string; isLoading: boolean } {
  const [title, setTitle] = useState<string>(() => {
    if (!videoId) return '';
    return memoryCache[videoId] || '';
  });
  const [isLoading, setIsLoading] = useState(!memoryCache[videoId || '']);

  useEffect(() => {
    if (!videoId) {
      setTitle('');
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (memoryCache[videoId]) {
      setTitle(memoryCache[videoId]);
      setIsLoading(false);
      return;
    }

    // Fetch title
    setIsLoading(true);
    fetchTitle(videoId).then((fetchedTitle) => {
      setTitle(fetchedTitle);
      setIsLoading(false);
    });
  }, [videoId]);

  return { title, isLoading };
}

/**
 * Prefetch titles for multiple videos
 */
export function prefetchTitles(videoIds: string[]): void {
  // Only fetch first 10 to avoid rate limiting
  const toFetch = videoIds
    .filter(id => !memoryCache[id])
    .slice(0, 10);

  toFetch.forEach(id => fetchTitle(id));
}

export default useVideoTitle;
