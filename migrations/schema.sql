-- Tamil MTV Catalog SQLite Schema
-- Designed for idempotent runs and resume support

-- Seed channels table: tracks original seeds and resolution status
CREATE TABLE IF NOT EXISTS seed_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_name TEXT NOT NULL UNIQUE,
    resolved_channel_id TEXT,
    resolved_title TEXT,
    resolved_handle TEXT,
    uploads_playlist_id TEXT,
    resolution_method TEXT, -- 'handle', 'search', 'manual_override'
    confidence_score REAL, -- 0.0 to 1.0
    chosen_rank INTEGER, -- which search result was chosen (1-based)
    subscriber_count INTEGER,
    video_count INTEGER,
    is_verified INTEGER DEFAULT 0,
    resolution_status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'failed', 'skipped'
    resolution_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Channel details table: full channel metadata
CREATE TABLE IF NOT EXISTS channels (
    channel_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    custom_url TEXT,
    handle TEXT,
    published_at TEXT,
    thumbnail_url TEXT,
    banner_url TEXT,
    uploads_playlist_id TEXT,
    subscriber_count INTEGER,
    video_count INTEGER,
    view_count INTEGER,
    country TEXT,
    is_verified INTEGER DEFAULT 0,
    fetched_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Videos table: all discovered videos
CREATE TABLE IF NOT EXISTS videos (
    youtube_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    published_at TEXT,
    thumbnail_url TEXT,
    thumbnail_high_url TEXT,
    duration_iso TEXT, -- ISO 8601 duration
    duration_seconds INTEGER,
    view_count INTEGER,
    like_count INTEGER,
    comment_count INTEGER,
    tags TEXT, -- JSON array
    category_id TEXT,
    default_language TEXT,
    default_audio_language TEXT,
    is_embeddable INTEGER DEFAULT 1,
    is_public INTEGER DEFAULT 1,
    is_made_for_kids INTEGER DEFAULT 0,
    is_short INTEGER DEFAULT 0, -- flagged as Short
    is_music_candidate INTEGER DEFAULT 1, -- likely music content
    non_music_reason TEXT, -- why flagged as non-music
    video_status TEXT DEFAULT 'active', -- 'active', 'private', 'deleted', 'blocked'
    discovered_from TEXT, -- 'uploads_playlist', 'search', etc.
    seed_source TEXT, -- which seed this came from
    metadata_status TEXT DEFAULT 'pending', -- 'pending', 'fetched', 'failed'
    metadata_error TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    fetched_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

-- Playlist crawl progress: tracks pagination state for resume
CREATE TABLE IF NOT EXISTS playlist_crawl_progress (
    playlist_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    total_results INTEGER,
    fetched_count INTEGER DEFAULT 0,
    next_page_token TEXT,
    is_complete INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- API call log: tracks quota usage and caching
CREATE TABLE IF NOT EXISTS api_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL, -- 'channels.list', 'search.list', etc.
    params_hash TEXT NOT NULL, -- hash of request params for deduplication
    request_params TEXT, -- JSON of request params
    response_status INTEGER,
    quota_cost INTEGER DEFAULT 1,
    cached INTEGER DEFAULT 0,
    error_message TEXT,
    called_at TEXT DEFAULT (datetime('now'))
);

-- Manual overrides for channel resolution
CREATE TABLE IF NOT EXISTS channel_overrides (
    seed_name TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(metadata_status);
CREATE INDEX IF NOT EXISTS idx_videos_music ON videos(is_music_candidate);
CREATE INDEX IF NOT EXISTS idx_seed_status ON seed_channels(resolution_status);
CREATE INDEX IF NOT EXISTS idx_api_calls_hash ON api_calls(params_hash);
CREATE INDEX IF NOT EXISTS idx_api_calls_endpoint ON api_calls(endpoint, called_at);

-- View for export-ready video data
CREATE VIEW IF NOT EXISTS v_export_videos AS
SELECT
    v.youtube_id,
    v.title,
    v.channel_id,
    c.title as channel_title,
    v.published_at,
    v.duration_seconds,
    v.is_embeddable,
    v.view_count,
    v.like_count,
    v.comment_count,
    v.tags,
    v.is_short,
    v.is_music_candidate,
    v.non_music_reason,
    v.video_status,
    v.seed_source,
    v.thumbnail_url,
    v.thumbnail_high_url,
    v.description,
    v.category_id,
    v.fetched_at
FROM videos v
LEFT JOIN channels c ON v.channel_id = c.channel_id
WHERE v.metadata_status = 'fetched'
  AND v.video_status = 'active';

-- View for channel export
CREATE VIEW IF NOT EXISTS v_export_channels AS
SELECT
    s.seed_name as seed,
    s.resolved_channel_id,
    c.title as resolved_title,
    c.handle,
    c.uploads_playlist_id,
    s.confidence_score,
    s.resolution_method,
    c.subscriber_count,
    c.video_count,
    c.view_count,
    c.is_verified,
    s.resolved_at
FROM seed_channels s
LEFT JOIN channels c ON s.resolved_channel_id = c.channel_id
WHERE s.resolution_status = 'resolved';
