/**
 * YouTube Data API v3 wrapper with rate limiting, caching, and retry logic
 */

import crypto from 'crypto';
import pRetry, { AbortError } from 'p-retry';
import { logApiCall, getApiCallByHash, getQuotaUsedToday } from './db.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DAILY_QUOTA_LIMIT = 10000; // Default YouTube quota limit
const QUOTA_BUFFER = 100; // Stop before hitting limit

// Quota costs per endpoint (approximate)
const QUOTA_COSTS: Record<string, number> = {
  'search.list': 100,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
};

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100; // 100ms between requests

export interface YouTubeApiOptions {
  skipCache?: boolean;
  maxRetries?: number;
}

export interface SearchResult {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  publishedAt?: string;
}

export interface ChannelDetails {
  channelId: string;
  title: string;
  description?: string;
  customUrl?: string;
  handle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  uploadsPlaylistId?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  country?: string;
  isVerified?: boolean;
}

export interface PlaylistItem {
  videoId: string;
  title?: string;
  publishedAt?: string;
  channelId?: string;
  position?: number;
}

export interface PlaylistItemsResponse {
  items: PlaylistItem[];
  nextPageToken?: string;
  totalResults?: number;
}

export interface VideoDetails {
  videoId: string;
  title: string;
  description?: string;
  channelId: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  thumbnailHighUrl?: string;
  durationIso?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  isEmbeddable?: boolean;
  isPublic?: boolean;
  isMadeForKids?: boolean;
  status: 'active' | 'private' | 'deleted' | 'blocked';
}

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set. Please set it in .env file.');
  }
  return key;
}

/**
 * Create a hash of request parameters for caching
 */
function hashParams(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha256').update(`${endpoint}?${sorted}`).digest('hex').slice(0, 32);
}

/**
 * Rate limit requests
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Check if we have quota remaining
 */
export function checkQuota(cost: number): boolean {
  const used = getQuotaUsedToday();
  return (used + cost) <= (DAILY_QUOTA_LIMIT - QUOTA_BUFFER);
}

/**
 * Make an API request with caching and retry logic
 */
async function apiRequest<T>(
  endpoint: string,
  params: Record<string, string>,
  options: YouTubeApiOptions = {}
): Promise<T> {
  const quotaCost = QUOTA_COSTS[endpoint] ?? 1;
  const paramsHash = hashParams(endpoint, params);

  // Check cache first
  if (!options.skipCache) {
    const cached = getApiCallByHash(paramsHash);
    if (cached && cached.request_params) {
      logApiCall({
        endpoint,
        params_hash: paramsHash,
        request_params: JSON.stringify(params),
        response_status: 200,
        quota_cost: 0,
        cached: 1
      });
      return JSON.parse(cached.request_params) as T;
    }
  }

  // Check quota
  if (!checkQuota(quotaCost)) {
    throw new Error(`Daily quota limit reached. Used: ${getQuotaUsedToday()}, Cost: ${quotaCost}`);
  }

  // Rate limit
  await rateLimit();

  const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
  url.searchParams.set('key', getApiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const fetchWithRetry = async () => {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorBody = await response.text();

      // Log failed request
      logApiCall({
        endpoint,
        params_hash: paramsHash,
        request_params: JSON.stringify(params),
        response_status: response.status,
        quota_cost: quotaCost,
        cached: 0,
        error_message: errorBody
      });

      if (response.status === 403 || response.status === 429) {
        throw new Error(`Rate limited (${response.status}): ${errorBody}`);
      }
      if (response.status >= 500) {
        throw new Error(`Server error (${response.status}): ${errorBody}`);
      }
      throw new AbortError(`API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  };

  const data = await pRetry(fetchWithRetry, {
    retries: options.maxRetries ?? 3,
    minTimeout: 1000,
    maxTimeout: 30000,
    factor: 2,
    onFailedAttempt: (error) => {
      console.log(`  Retry attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}: ${error.message}`);
    }
  });

  // Log successful request and cache response
  logApiCall({
    endpoint,
    params_hash: paramsHash,
    request_params: JSON.stringify(data),
    response_status: 200,
    quota_cost: quotaCost,
    cached: 0
  });

  return data as T;
}

/**
 * Search for channels by name
 */
export async function searchChannels(
  query: string,
  maxResults: number = 5,
  options?: YouTubeApiOptions
): Promise<SearchResult[]> {
  const data = await apiRequest<any>('search', {
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: String(maxResults)
  }, options);

  return (data.items || []).map((item: any) => ({
    channelId: item.snippet?.channelId || item.id?.channelId,
    title: item.snippet?.title,
    description: item.snippet?.description,
    thumbnailUrl: item.snippet?.thumbnails?.default?.url,
    publishedAt: item.snippet?.publishedAt
  }));
}

/**
 * Get channel details by ID
 */
export async function getChannelById(
  channelId: string,
  options?: YouTubeApiOptions
): Promise<ChannelDetails | null> {
  const data = await apiRequest<any>('channels', {
    part: 'snippet,contentDetails,statistics,brandingSettings,status',
    id: channelId
  }, options);

  const item = data.items?.[0];
  if (!item) return null;

  return parseChannelItem(item);
}

/**
 * Get channel details by handle (e.g., @SonyMusicSouth)
 */
export async function getChannelByHandle(
  handle: string,
  options?: YouTubeApiOptions
): Promise<ChannelDetails | null> {
  // Remove @ if present
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  const data = await apiRequest<any>('channels', {
    part: 'snippet,contentDetails,statistics,brandingSettings,status',
    forHandle: cleanHandle
  }, options);

  const item = data.items?.[0];
  if (!item) return null;

  return parseChannelItem(item);
}

/**
 * Get multiple channels by IDs (batch)
 */
export async function getChannelsByIds(
  channelIds: string[],
  options?: YouTubeApiOptions
): Promise<ChannelDetails[]> {
  if (channelIds.length === 0) return [];

  // API allows max 50 IDs per request
  const batches: string[][] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    batches.push(channelIds.slice(i, i + 50));
  }

  const results: ChannelDetails[] = [];
  for (const batch of batches) {
    const data = await apiRequest<any>('channels', {
      part: 'snippet,contentDetails,statistics,brandingSettings,status',
      id: batch.join(',')
    }, options);

    for (const item of data.items || []) {
      results.push(parseChannelItem(item));
    }
  }

  return results;
}

/**
 * Parse channel API response item
 */
function parseChannelItem(item: any): ChannelDetails {
  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const contentDetails = item.contentDetails || {};
  const branding = item.brandingSettings || {};

  // Try to extract handle from customUrl
  let handle: string | undefined;
  if (snippet.customUrl) {
    handle = snippet.customUrl.startsWith('@') ? snippet.customUrl : `@${snippet.customUrl}`;
  }

  return {
    channelId: item.id,
    title: snippet.title,
    description: snippet.description,
    customUrl: snippet.customUrl,
    handle,
    publishedAt: snippet.publishedAt,
    thumbnailUrl: snippet.thumbnails?.default?.url,
    bannerUrl: branding.image?.bannerExternalUrl,
    uploadsPlaylistId: contentDetails.relatedPlaylists?.uploads,
    subscriberCount: stats.subscriberCount ? parseInt(stats.subscriberCount) : undefined,
    videoCount: stats.videoCount ? parseInt(stats.videoCount) : undefined,
    viewCount: stats.viewCount ? parseInt(stats.viewCount) : undefined,
    country: snippet.country,
    // Note: Official verification isn't directly available via API
    // We'll use heuristics in the resolution logic
    isVerified: false
  };
}

/**
 * Get playlist items (videos in a playlist)
 */
export async function getPlaylistItems(
  playlistId: string,
  pageToken?: string,
  maxResults: number = 50,
  options?: YouTubeApiOptions
): Promise<PlaylistItemsResponse> {
  const params: Record<string, string> = {
    part: 'contentDetails,snippet',
    playlistId,
    maxResults: String(Math.min(maxResults, 50))
  };

  if (pageToken) {
    params.pageToken = pageToken;
  }

  const data = await apiRequest<any>('playlistItems', params, options);

  return {
    items: (data.items || []).map((item: any) => ({
      videoId: item.contentDetails?.videoId,
      title: item.snippet?.title,
      publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt,
      channelId: item.snippet?.channelId,
      position: item.snippet?.position
    })),
    nextPageToken: data.nextPageToken,
    totalResults: data.pageInfo?.totalResults
  };
}

/**
 * Get video details by IDs (batch)
 */
export async function getVideosByIds(
  videoIds: string[],
  options?: YouTubeApiOptions
): Promise<VideoDetails[]> {
  if (videoIds.length === 0) return [];

  // API allows max 50 IDs per request
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  const results: VideoDetails[] = [];
  const fetchedIds = new Set<string>();

  for (const batch of batches) {
    const data = await apiRequest<any>('videos', {
      part: 'snippet,contentDetails,statistics,status',
      id: batch.join(',')
    }, options);

    for (const item of data.items || []) {
      results.push(parseVideoItem(item));
      fetchedIds.add(item.id);
    }

    // Mark videos that weren't returned as unavailable
    for (const videoId of batch) {
      if (!fetchedIds.has(videoId)) {
        results.push({
          videoId,
          title: '[Unavailable]',
          channelId: '',
          status: 'deleted'
        });
      }
    }
  }

  return results;
}

/**
 * Parse video API response item
 */
function parseVideoItem(item: any): VideoDetails {
  const snippet = item.snippet || {};
  const contentDetails = item.contentDetails || {};
  const stats = item.statistics || {};
  const status = item.status || {};

  // Parse ISO 8601 duration to seconds
  let durationSeconds: number | undefined;
  if (contentDetails.duration) {
    durationSeconds = parseDuration(contentDetails.duration);
  }

  // Determine video status
  let videoStatus: VideoDetails['status'] = 'active';
  if (status.privacyStatus === 'private') {
    videoStatus = 'private';
  } else if (status.uploadStatus === 'rejected' || status.uploadStatus === 'deleted') {
    videoStatus = 'deleted';
  } else if (contentDetails.regionRestriction?.blocked?.includes('US')) {
    videoStatus = 'blocked';
  }

  return {
    videoId: item.id,
    title: snippet.title,
    description: snippet.description,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    thumbnailUrl: snippet.thumbnails?.default?.url,
    thumbnailHighUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.maxres?.url,
    durationIso: contentDetails.duration,
    durationSeconds,
    viewCount: stats.viewCount ? parseInt(stats.viewCount) : undefined,
    likeCount: stats.likeCount ? parseInt(stats.likeCount) : undefined,
    commentCount: stats.commentCount ? parseInt(stats.commentCount) : undefined,
    tags: snippet.tags,
    categoryId: snippet.categoryId,
    defaultLanguage: snippet.defaultLanguage,
    defaultAudioLanguage: snippet.defaultAudioLanguage,
    isEmbeddable: status.embeddable,
    isPublic: status.privacyStatus === 'public',
    isMadeForKids: status.madeForKids,
    status: videoStatus
  };
}

/**
 * Parse ISO 8601 duration (e.g., PT4M13S) to seconds
 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get current quota usage
 */
export function getQuotaStatus(): { used: number; remaining: number; limit: number } {
  const used = getQuotaUsedToday();
  return {
    used,
    remaining: DAILY_QUOTA_LIMIT - used,
    limit: DAILY_QUOTA_LIMIT
  };
}
