/**
 * Tamil MTV Catalog - Visualization Server
 * Local web server to browse and visualize the database
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb, closeDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(join(__dirname, '..', 'public')));

// API: Get overall stats
app.get('/api/stats', (req, res) => {
  const db = getDb();

  const seeds = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN resolution_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN resolution_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN resolution_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM seed_channels
  `).get() as any;

  const channels = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(subscriber_count) as total_subscribers,
      SUM(video_count) as total_channel_videos,
      SUM(view_count) as total_views
    FROM channels
  `).get() as any;

  const videos = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN metadata_status = 'fetched' THEN 1 ELSE 0 END) as fetched,
      SUM(CASE WHEN metadata_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN is_short = 1 THEN 1 ELSE 0 END) as shorts,
      SUM(CASE WHEN is_music_candidate = 0 THEN 1 ELSE 0 END) as non_music
    FROM videos
  `).get() as any;

  const playlists = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) as complete,
      SUM(fetched_count) as total_fetched
    FROM playlist_crawl_progress
  `).get() as any;

  res.json({
    seeds,
    channels,
    videos,
    playlists
  });
});

// API: Get all channels with video counts
app.get('/api/channels', (req, res) => {
  const db = getDb();

  const channels = db.prepare(`
    SELECT
      s.seed_name,
      s.resolved_channel_id,
      s.resolved_title,
      s.resolution_status,
      s.confidence_score,
      s.resolution_method,
      c.subscriber_count,
      c.video_count as channel_video_count,
      c.view_count,
      c.handle,
      c.thumbnail_url,
      COUNT(v.youtube_id) as discovered_videos,
      SUM(CASE WHEN v.metadata_status = 'fetched' THEN 1 ELSE 0 END) as fetched_videos,
      p.is_complete as crawl_complete,
      p.fetched_count as crawl_progress,
      p.total_results as crawl_total
    FROM seed_channels s
    LEFT JOIN channels c ON s.resolved_channel_id = c.channel_id
    LEFT JOIN videos v ON s.resolved_channel_id = v.channel_id
    LEFT JOIN playlist_crawl_progress p ON s.uploads_playlist_id = p.playlist_id
    GROUP BY s.id
    ORDER BY c.subscriber_count DESC NULLS LAST
  `).all();

  res.json(channels);
});

// API: Get top channels by metric
app.get('/api/channels/top/:metric', (req, res) => {
  const db = getDb();
  const { metric } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  const validMetrics = ['subscriber_count', 'video_count', 'view_count', 'discovered_videos'];
  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: 'Invalid metric' });
  }

  let orderBy = metric;
  if (metric === 'discovered_videos') {
    orderBy = 'COUNT(v.youtube_id)';
  }

  const channels = db.prepare(`
    SELECT
      s.seed_name,
      s.resolved_title,
      c.subscriber_count,
      c.video_count,
      c.view_count,
      c.handle,
      COUNT(v.youtube_id) as discovered_videos
    FROM seed_channels s
    LEFT JOIN channels c ON s.resolved_channel_id = c.channel_id
    LEFT JOIN videos v ON s.resolved_channel_id = v.channel_id
    WHERE s.resolution_status = 'resolved'
    GROUP BY s.id
    ORDER BY ${orderBy} DESC
    LIMIT ?
  `).all(limit);

  res.json(channels);
});

// API: Get videos for a channel
app.get('/api/channels/:channelId/videos', (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  const videos = db.prepare(`
    SELECT
      youtube_id,
      title,
      published_at,
      duration_seconds,
      view_count,
      like_count,
      is_short,
      is_music_candidate,
      metadata_status,
      thumbnail_url
    FROM videos
    WHERE channel_id = ?
    ORDER BY published_at DESC
    LIMIT ? OFFSET ?
  `).all(channelId, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM videos WHERE channel_id = ?
  `).get(channelId) as { count: number };

  res.json({ videos, total: total.count });
});

// API: Get video timeline (videos per month)
app.get('/api/analytics/timeline', (req, res) => {
  const db = getDb();

  const timeline = db.prepare(`
    SELECT
      strftime('%Y-%m', published_at) as month,
      COUNT(*) as video_count
    FROM videos
    WHERE published_at IS NOT NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT 60
  `).all();

  res.json(timeline.reverse());
});

// API: Get channel distribution by subscriber ranges
app.get('/api/analytics/subscriber-distribution', (req, res) => {
  const db = getDb();

  const distribution = db.prepare(`
    SELECT
      CASE
        WHEN subscriber_count >= 10000000 THEN '10M+'
        WHEN subscriber_count >= 1000000 THEN '1M-10M'
        WHEN subscriber_count >= 100000 THEN '100K-1M'
        WHEN subscriber_count >= 10000 THEN '10K-100K'
        ELSE '<10K'
      END as range,
      COUNT(*) as count
    FROM channels
    WHERE subscriber_count IS NOT NULL
    GROUP BY range
    ORDER BY
      CASE range
        WHEN '10M+' THEN 1
        WHEN '1M-10M' THEN 2
        WHEN '100K-1M' THEN 3
        WHEN '10K-100K' THEN 4
        ELSE 5
      END
  `).all();

  res.json(distribution);
});

// API: Get resolution method breakdown
app.get('/api/analytics/resolution-methods', (req, res) => {
  const db = getDb();

  const methods = db.prepare(`
    SELECT
      resolution_method,
      COUNT(*) as count,
      AVG(confidence_score) as avg_confidence
    FROM seed_channels
    WHERE resolution_status = 'resolved'
    GROUP BY resolution_method
  `).all();

  res.json(methods);
});

// API: Search videos
app.get('/api/search/videos', (req, res) => {
  const db = getDb();
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 50;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const videos = db.prepare(`
    SELECT
      v.youtube_id,
      v.title,
      v.channel_id,
      c.title as channel_title,
      v.published_at,
      v.duration_seconds,
      v.view_count,
      v.thumbnail_url
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.channel_id
    WHERE v.title LIKE ?
    ORDER BY v.view_count DESC NULLS LAST
    LIMIT ?
  `).all(`%${query}%`, limit);

  res.json(videos);
});

// API: Get failed resolutions
app.get('/api/failed-seeds', (req, res) => {
  const db = getDb();

  const failed = db.prepare(`
    SELECT seed_name, resolution_error
    FROM seed_channels
    WHERE resolution_status = 'failed'
  `).all();

  res.json(failed);
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🎵 Tamil MTV Catalog - Dashboard                             ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                     ║
║  Press Ctrl+C to stop                                         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});
