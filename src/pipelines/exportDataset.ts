/**
 * Pipeline: Export dataset to CSV and JSONL files
 *
 * Exports:
 * - data/videos.jsonl - One JSON object per line
 * - data/videos.csv - Flat CSV with key columns
 * - data/channels.csv - Channel resolution data
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stringify } from 'csv-stringify';
import { getExportVideos, getExportChannels, getStats } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

/**
 * Export videos to JSONL format
 */
async function exportVideosJsonl(): Promise<number> {
  const outputPath = join(DATA_DIR, 'videos.jsonl');
  const videos = getExportVideos();

  const stream = createWriteStream(outputPath);

  for (const video of videos) {
    // Parse tags JSON if present
    if (video.tags) {
      try {
        video.tags = JSON.parse(video.tags);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    stream.write(JSON.stringify(video) + '\n');
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`  ✓ ${outputPath} (${videos.length} videos)`);
  return videos.length;
}

/**
 * Export videos to CSV format
 */
async function exportVideosCsv(): Promise<number> {
  const outputPath = join(DATA_DIR, 'videos.csv');
  const videos = getExportVideos();

  const columns = [
    'youtube_id',
    'title',
    'channel_id',
    'channel_title',
    'published_at',
    'duration_seconds',
    'is_embeddable',
    'view_count',
    'like_count',
    'comment_count',
    'is_short',
    'is_music_candidate',
    'non_music_reason',
    'video_status',
    'seed_source',
    'category_id',
    'fetched_at'
  ];

  return new Promise((resolve, reject) => {
    const stringifier = stringify({
      header: true,
      columns
    });

    const stream = createWriteStream(outputPath);
    stringifier.pipe(stream);

    for (const video of videos) {
      stringifier.write(video);
    }

    stringifier.end();

    stream.on('finish', () => {
      console.log(`  ✓ ${outputPath} (${videos.length} videos)`);
      resolve(videos.length);
    });

    stream.on('error', reject);
  });
}

/**
 * Export channels to CSV format
 */
async function exportChannelsCsv(): Promise<number> {
  const outputPath = join(DATA_DIR, 'channels.csv');
  const channels = getExportChannels();

  const columns = [
    'seed',
    'resolved_channel_id',
    'resolved_title',
    'handle',
    'uploads_playlist_id',
    'confidence_score',
    'resolution_method',
    'subscriber_count',
    'video_count',
    'view_count',
    'is_verified',
    'resolved_at'
  ];

  return new Promise((resolve, reject) => {
    const stringifier = stringify({
      header: true,
      columns
    });

    const stream = createWriteStream(outputPath);
    stringifier.pipe(stream);

    for (const channel of channels) {
      stringifier.write(channel);
    }

    stringifier.end();

    stream.on('finish', () => {
      console.log(`  ✓ ${outputPath} (${channels.length} channels)`);
      resolve(channels.length);
    });

    stream.on('error', reject);
  });
}

/**
 * Export music-only videos (filtered dataset)
 */
async function exportMusicOnlyJsonl(): Promise<number> {
  const outputPath = join(DATA_DIR, 'music-videos.jsonl');
  const videos = getExportVideos().filter(v =>
    v.is_music_candidate === 1 &&
    v.is_short === 0 &&
    v.is_embeddable === 1
  );

  const stream = createWriteStream(outputPath);

  for (const video of videos) {
    if (video.tags) {
      try {
        video.tags = JSON.parse(video.tags);
      } catch {
        // Keep as string
      }
    }
    stream.write(JSON.stringify(video) + '\n');
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`  ✓ ${outputPath} (${videos.length} music videos)`);
  return videos.length;
}

/**
 * Main export pipeline
 */
export async function exportDataset(): Promise<void> {
  console.log('\n📤 EXPORT DATASET PIPELINE\n');

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const stats = getStats();
  console.log(`Database contains:`);
  console.log(`  Channels: ${stats.totalChannels}`);
  console.log(`  Videos: ${stats.totalVideos} (${stats.fetchedVideos} with metadata)`);
  console.log();

  if (stats.fetchedVideos === 0) {
    console.log('⚠️  No videos with metadata to export. Run fetch-video-details first.');
    return;
  }

  console.log('Exporting files:');

  const [videosJsonl, videosCsv, channelsCsv, musicJsonl] = await Promise.all([
    exportVideosJsonl(),
    exportVideosCsv(),
    exportChannelsCsv(),
    exportMusicOnlyJsonl()
  ]);

  console.log('\n📊 Export Summary:');
  console.log(`  Total videos exported: ${videosJsonl}`);
  console.log(`  Music-only videos: ${musicJsonl}`);
  console.log(`  Channels exported: ${channelsCsv}`);
  console.log(`\nFiles written to: ${DATA_DIR}`);
}

export default exportDataset;
