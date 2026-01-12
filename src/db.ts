/**
 * Database module for Tamil MTV Catalog
 * Uses better-sqlite3 for synchronous, fast SQLite operations
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Types
export interface SeedChannel {
  id?: number;
  seed_name: string;
  resolved_channel_id?: string;
  resolved_title?: string;
  resolved_handle?: string;
  uploads_playlist_id?: string;
  resolution_method?: string;
  confidence_score?: number;
  chosen_rank?: number;
  subscriber_count?: number;
  video_count?: number;
  is_verified?: number;
  resolution_status: 'pending' | 'resolved' | 'failed' | 'skipped';
  resolution_error?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface Channel {
  channel_id: string;
  title: string;
  description?: string;
  custom_url?: string;
  handle?: string;
  published_at?: string;
  thumbnail_url?: string;
  banner_url?: string;
  uploads_playlist_id?: string;
  subscriber_count?: number;
  video_count?: number;
  view_count?: number;
  country?: string;
  is_verified?: number;
  fetched_at?: string;
}

export interface Video {
  youtube_id: string;
  channel_id: string;
  title?: string;
  description?: string;
  published_at?: string;
  thumbnail_url?: string;
  thumbnail_high_url?: string;
  duration_iso?: string;
  duration_seconds?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  tags?: string;
  category_id?: string;
  default_language?: string;
  default_audio_language?: string;
  is_embeddable?: number;
  is_public?: number;
  is_made_for_kids?: number;
  is_short?: number;
  is_music_candidate?: number;
  non_music_reason?: string;
  video_status?: string;
  discovered_from?: string;
  seed_source?: string;
  metadata_status: 'pending' | 'fetched' | 'failed';
  metadata_error?: string;
  discovered_at?: string;
  fetched_at?: string;
}

export interface PlaylistProgress {
  playlist_id: string;
  channel_id: string;
  total_results?: number;
  fetched_count: number;
  next_page_token?: string;
  is_complete: number;
}

export interface ApiCall {
  endpoint: string;
  params_hash: string;
  request_params?: string;
  response_status?: number;
  quota_cost?: number;
  cached?: number;
  error_message?: string;
}

export interface ChannelOverride {
  seed_name: string;
  channel_id: string;
  notes?: string;
}

let db: Database.Database | null = null;

/**
 * Get database instance, creating if necessary
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || './data/tamil-mtv.db';

  // Ensure directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initSchema(db);

  return db;
}

/**
 * Initialize database schema
 */
function initSchema(database: Database.Database): void {
  const schemaPath = join(__dirname, '..', 'migrations', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ==================== SEED CHANNELS ====================

export function insertSeedChannel(seed: string): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO seed_channels (seed_name, resolution_status)
    VALUES (?, 'pending')
  `);
  stmt.run(seed);
}

export function insertManySeedChannels(seeds: string[]): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO seed_channels (seed_name, resolution_status)
    VALUES (?, 'pending')
  `);
  const insertMany = getDb().transaction((items: string[]) => {
    for (const seed of items) {
      stmt.run(seed);
    }
  });
  insertMany(seeds);
}

export function getPendingSeedChannels(): SeedChannel[] {
  return getDb().prepare(`
    SELECT * FROM seed_channels
    WHERE resolution_status = 'pending'
    ORDER BY id
  `).all() as SeedChannel[];
}

export function getAllSeedChannels(): SeedChannel[] {
  return getDb().prepare(`
    SELECT * FROM seed_channels ORDER BY id
  `).all() as SeedChannel[];
}

export function updateSeedChannelResolved(
  seedName: string,
  channelId: string,
  title: string,
  handle: string | null,
  method: string,
  confidence: number,
  rank: number,
  subscriberCount?: number,
  videoCount?: number,
  isVerified?: boolean
): void {
  getDb().prepare(`
    UPDATE seed_channels SET
      resolved_channel_id = ?,
      resolved_title = ?,
      resolved_handle = ?,
      resolution_method = ?,
      confidence_score = ?,
      chosen_rank = ?,
      subscriber_count = ?,
      video_count = ?,
      is_verified = ?,
      resolution_status = 'resolved',
      resolved_at = datetime('now'),
      updated_at = datetime('now')
    WHERE seed_name = ?
  `).run(
    channelId, title, handle, method, confidence, rank,
    subscriberCount ?? null, videoCount ?? null, isVerified ? 1 : 0,
    seedName
  );
}

export function updateSeedChannelFailed(seedName: string, error: string): void {
  getDb().prepare(`
    UPDATE seed_channels SET
      resolution_status = 'failed',
      resolution_error = ?,
      updated_at = datetime('now')
    WHERE seed_name = ?
  `).run(error, seedName);
}

export function updateSeedChannelUploadsPlaylist(seedName: string, playlistId: string): void {
  getDb().prepare(`
    UPDATE seed_channels SET
      uploads_playlist_id = ?,
      updated_at = datetime('now')
    WHERE seed_name = ?
  `).run(playlistId, seedName);
}

export function getResolvedSeedChannels(): SeedChannel[] {
  return getDb().prepare(`
    SELECT * FROM seed_channels
    WHERE resolution_status = 'resolved'
    ORDER BY id
  `).all() as SeedChannel[];
}

export function getSeedChannelsNeedingUploadsPlaylist(): SeedChannel[] {
  return getDb().prepare(`
    SELECT * FROM seed_channels
    WHERE resolution_status = 'resolved'
      AND uploads_playlist_id IS NULL
      AND resolved_channel_id IS NOT NULL
    ORDER BY id
  `).all() as SeedChannel[];
}

// ==================== CHANNELS ====================

export function upsertChannel(channel: Channel): void {
  getDb().prepare(`
    INSERT INTO channels (
      channel_id, title, description, custom_url, handle,
      published_at, thumbnail_url, banner_url, uploads_playlist_id,
      subscriber_count, video_count, view_count, country, is_verified,
      fetched_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(channel_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      custom_url = excluded.custom_url,
      handle = excluded.handle,
      thumbnail_url = excluded.thumbnail_url,
      banner_url = excluded.banner_url,
      uploads_playlist_id = excluded.uploads_playlist_id,
      subscriber_count = excluded.subscriber_count,
      video_count = excluded.video_count,
      view_count = excluded.view_count,
      country = excluded.country,
      is_verified = excluded.is_verified,
      updated_at = datetime('now')
  `).run(
    channel.channel_id, channel.title, channel.description ?? null,
    channel.custom_url ?? null, channel.handle ?? null,
    channel.published_at ?? null, channel.thumbnail_url ?? null,
    channel.banner_url ?? null, channel.uploads_playlist_id ?? null,
    channel.subscriber_count ?? null, channel.video_count ?? null,
    channel.view_count ?? null, channel.country ?? null,
    channel.is_verified ?? 0
  );
}

export function getChannel(channelId: string): Channel | undefined {
  return getDb().prepare(`
    SELECT * FROM channels WHERE channel_id = ?
  `).get(channelId) as Channel | undefined;
}

// ==================== VIDEOS ====================

export function insertDiscoveredVideo(
  videoId: string,
  channelId: string,
  publishedAt: string | null,
  discoveredFrom: string,
  seedSource: string
): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO videos (
      youtube_id, channel_id, published_at, discovered_from, seed_source,
      metadata_status, discovered_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).run(videoId, channelId, publishedAt, discoveredFrom, seedSource);
}

export function insertManyDiscoveredVideos(
  videos: Array<{
    videoId: string;
    channelId: string;
    publishedAt: string | null;
    discoveredFrom: string;
    seedSource: string;
  }>
): number {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO videos (
      youtube_id, channel_id, published_at, discovered_from, seed_source,
      metadata_status, discovered_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
  `);

  let inserted = 0;
  const insertMany = getDb().transaction((items) => {
    for (const v of items) {
      const result = stmt.run(v.videoId, v.channelId, v.publishedAt, v.discoveredFrom, v.seedSource);
      if (result.changes > 0) inserted++;
    }
  });
  insertMany(videos);
  return inserted;
}

export function getPendingVideos(limit: number = 50): Video[] {
  return getDb().prepare(`
    SELECT * FROM videos
    WHERE metadata_status = 'pending'
    ORDER BY discovered_at
    LIMIT ?
  `).all(limit) as Video[];
}

export function getPendingVideoCount(): number {
  const result = getDb().prepare(`
    SELECT COUNT(*) as count FROM videos WHERE metadata_status = 'pending'
  `).get() as { count: number };
  return result.count;
}

export function updateVideoMetadata(video: Video): void {
  // Detect if video is a Short (< 60 seconds or title contains "shorts")
  const isShort = (video.duration_seconds !== undefined && video.duration_seconds < 60) ||
    (video.title?.toLowerCase().includes('#shorts') || video.title?.toLowerCase().includes('shorts'));

  // Detect non-music content
  let isMusicCandidate = 1;
  let nonMusicReason: string | null = null;

  if (video.title) {
    const lowerTitle = video.title.toLowerCase();
    const nonMusicKeywords = ['trailer', 'teaser', 'interview', 'promo', 'making', 'behind the scenes', 'bts'];
    for (const keyword of nonMusicKeywords) {
      if (lowerTitle.includes(keyword)) {
        isMusicCandidate = 0;
        nonMusicReason = `Title contains "${keyword}"`;
        break;
      }
    }
  }

  getDb().prepare(`
    UPDATE videos SET
      title = ?,
      description = ?,
      thumbnail_url = ?,
      thumbnail_high_url = ?,
      duration_iso = ?,
      duration_seconds = ?,
      view_count = ?,
      like_count = ?,
      comment_count = ?,
      tags = ?,
      category_id = ?,
      default_language = ?,
      default_audio_language = ?,
      is_embeddable = ?,
      is_public = ?,
      is_made_for_kids = ?,
      is_short = ?,
      is_music_candidate = ?,
      non_music_reason = ?,
      video_status = ?,
      metadata_status = 'fetched',
      fetched_at = datetime('now'),
      updated_at = datetime('now')
    WHERE youtube_id = ?
  `).run(
    video.title, video.description,
    video.thumbnail_url, video.thumbnail_high_url,
    video.duration_iso, video.duration_seconds,
    video.view_count, video.like_count, video.comment_count,
    video.tags, video.category_id,
    video.default_language, video.default_audio_language,
    video.is_embeddable ?? 1, video.is_public ?? 1, video.is_made_for_kids ?? 0,
    isShort ? 1 : 0, isMusicCandidate, nonMusicReason,
    video.video_status ?? 'active',
    video.youtube_id
  );
}

export function updateVideoFailed(videoId: string, error: string, status: string = 'failed'): void {
  getDb().prepare(`
    UPDATE videos SET
      metadata_status = ?,
      metadata_error = ?,
      video_status = CASE WHEN ? = 'failed' THEN video_status ELSE ? END,
      updated_at = datetime('now')
    WHERE youtube_id = ?
  `).run(status, error, status, status, videoId);
}

// ==================== PLAYLIST PROGRESS ====================

export function getPlaylistProgress(playlistId: string): PlaylistProgress | undefined {
  return getDb().prepare(`
    SELECT * FROM playlist_crawl_progress WHERE playlist_id = ?
  `).get(playlistId) as PlaylistProgress | undefined;
}

export function upsertPlaylistProgress(progress: PlaylistProgress): void {
  getDb().prepare(`
    INSERT INTO playlist_crawl_progress (
      playlist_id, channel_id, total_results, fetched_count,
      next_page_token, is_complete, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(playlist_id) DO UPDATE SET
      total_results = excluded.total_results,
      fetched_count = excluded.fetched_count,
      next_page_token = excluded.next_page_token,
      is_complete = excluded.is_complete,
      updated_at = datetime('now'),
      completed_at = CASE WHEN excluded.is_complete = 1 THEN datetime('now') ELSE completed_at END
  `).run(
    progress.playlist_id, progress.channel_id,
    progress.total_results ?? null, progress.fetched_count,
    progress.next_page_token ?? null, progress.is_complete
  );
}

export function getIncompletePlaylistChannels(): SeedChannel[] {
  return getDb().prepare(`
    SELECT s.* FROM seed_channels s
    LEFT JOIN playlist_crawl_progress p ON s.uploads_playlist_id = p.playlist_id
    WHERE s.resolution_status = 'resolved'
      AND s.uploads_playlist_id IS NOT NULL
      AND (p.is_complete IS NULL OR p.is_complete = 0)
    ORDER BY s.id
  `).all() as SeedChannel[];
}

// ==================== API CALLS (CACHING) ====================

export function logApiCall(call: ApiCall): void {
  getDb().prepare(`
    INSERT INTO api_calls (
      endpoint, params_hash, request_params, response_status,
      quota_cost, cached, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    call.endpoint, call.params_hash, call.request_params,
    call.response_status, call.quota_cost ?? 1, call.cached ?? 0,
    call.error_message ?? null
  );
}

export function getApiCallByHash(hash: string): ApiCall | undefined {
  return getDb().prepare(`
    SELECT * FROM api_calls
    WHERE params_hash = ? AND response_status = 200
    ORDER BY called_at DESC
    LIMIT 1
  `).get(hash) as ApiCall | undefined;
}

export function getQuotaUsedToday(): number {
  const result = getDb().prepare(`
    SELECT COALESCE(SUM(quota_cost), 0) as total
    FROM api_calls
    WHERE cached = 0
      AND date(called_at) = date('now')
  `).get() as { total: number };
  return result.total;
}

// ==================== OVERRIDES ====================

export function getOverride(seedName: string): ChannelOverride | undefined {
  return getDb().prepare(`
    SELECT * FROM channel_overrides WHERE seed_name = ?
  `).get(seedName) as ChannelOverride | undefined;
}

export function insertOverride(override: ChannelOverride): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO channel_overrides (seed_name, channel_id, notes)
    VALUES (?, ?, ?)
  `).run(override.seed_name, override.channel_id, override.notes ?? null);
}

export function loadOverridesFromJson(filepath: string): void {
  if (!existsSync(filepath)) return;

  const overrides = JSON.parse(readFileSync(filepath, 'utf-8')) as Record<string, string | { channel_id: string; notes?: string }>;

  const insertStmt = getDb().prepare(`
    INSERT OR REPLACE INTO channel_overrides (seed_name, channel_id, notes)
    VALUES (?, ?, ?)
  `);

  const insertAll = getDb().transaction(() => {
    for (const [seedName, value] of Object.entries(overrides)) {
      if (typeof value === 'string') {
        insertStmt.run(seedName, value, null);
      } else {
        insertStmt.run(seedName, value.channel_id, value.notes ?? null);
      }
    }
  });
  insertAll();
}

// ==================== EXPORT QUERIES ====================

export function getExportVideos(): any[] {
  return getDb().prepare(`SELECT * FROM v_export_videos`).all();
}

export function getExportChannels(): any[] {
  return getDb().prepare(`SELECT * FROM v_export_channels`).all();
}

// ==================== STATS ====================

export function getStats(): {
  totalSeeds: number;
  resolvedSeeds: number;
  failedSeeds: number;
  pendingSeeds: number;
  totalChannels: number;
  totalVideos: number;
  fetchedVideos: number;
  pendingVideos: number;
  quotaUsedToday: number;
} {
  const seeds = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN resolution_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN resolution_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN resolution_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM seed_channels
  `).get() as any;

  const channels = getDb().prepare(`SELECT COUNT(*) as count FROM channels`).get() as { count: number };

  const videos = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN metadata_status = 'fetched' THEN 1 ELSE 0 END) as fetched,
      SUM(CASE WHEN metadata_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM videos
  `).get() as any;

  return {
    totalSeeds: seeds.total,
    resolvedSeeds: seeds.resolved,
    failedSeeds: seeds.failed,
    pendingSeeds: seeds.pending,
    totalChannels: channels.count,
    totalVideos: videos.total,
    fetchedVideos: videos.fetched,
    pendingVideos: videos.pending,
    quotaUsedToday: getQuotaUsedToday()
  };
}
