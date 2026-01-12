#!/usr/bin/env node
/**
 * Tamil MTV Catalog CLI
 *
 * A YouTube-first catalog builder for Tamil music videos
 */

import { config } from 'dotenv';
import { Command } from 'commander';
import { closeDb, getStats, getDb } from './db.js';
import resolveChannels from './pipelines/resolveChannels.js';
import fetchUploadsPlaylists from './pipelines/fetchUploadsPlaylists.js';
import crawlUploads from './pipelines/crawlUploads.js';
import fetchVideoDetails from './pipelines/fetchVideoDetails.js';
import exportDataset from './pipelines/exportDataset.js';
import { getQuotaStatus } from './youtube.js';

// Load environment variables
config();

const program = new Command();

program
  .name('tamil-mtv')
  .description('Build a YouTube-first catalog for Tamil music videos')
  .version('1.0.0');

// Stats command
program
  .command('stats')
  .description('Show current database statistics and quota usage')
  .action(async () => {
    console.log('\n📊 TAMIL MTV CATALOG STATS\n');

    // Initialize DB
    getDb();

    const stats = getStats();
    const quota = getQuotaStatus();

    console.log('Seeds:');
    console.log(`  Total: ${stats.totalSeeds}`);
    console.log(`  Resolved: ${stats.resolvedSeeds}`);
    console.log(`  Failed: ${stats.failedSeeds}`);
    console.log(`  Pending: ${stats.pendingSeeds}`);

    console.log('\nChannels:');
    console.log(`  Total: ${stats.totalChannels}`);

    console.log('\nVideos:');
    console.log(`  Total discovered: ${stats.totalVideos}`);
    console.log(`  With metadata: ${stats.fetchedVideos}`);
    console.log(`  Pending metadata: ${stats.pendingVideos}`);

    console.log('\nAPI Quota:');
    console.log(`  Used today: ${quota.used}`);
    console.log(`  Remaining: ${quota.remaining}`);
    console.log(`  Daily limit: ${quota.limit}`);

    closeDb();
  });

// Resolve channels command
program
  .command('resolve-channels')
  .description('Resolve seed channel names to YouTube channel IDs')
  .action(async () => {
    checkApiKey();
    try {
      await resolveChannels();
    } finally {
      closeDb();
    }
  });

// Fetch uploads command
program
  .command('fetch-uploads')
  .description('Fetch uploads playlist IDs for resolved channels')
  .action(async () => {
    checkApiKey();
    try {
      await fetchUploadsPlaylists();
    } finally {
      closeDb();
    }
  });

// Crawl uploads command
program
  .command('crawl-uploads')
  .description('Crawl uploads playlists to discover videos')
  .action(async () => {
    checkApiKey();
    try {
      await crawlUploads();
    } finally {
      closeDb();
    }
  });

// Fetch video details command
program
  .command('fetch-video-details')
  .description('Fetch detailed metadata for discovered videos')
  .option('-n, --max <number>', 'Maximum number of videos to fetch', parseInt)
  .action(async (options) => {
    checkApiKey();
    try {
      await fetchVideoDetails(options.max);
    } finally {
      closeDb();
    }
  });

// Export command
program
  .command('export')
  .description('Export dataset to CSV and JSONL files')
  .action(async () => {
    try {
      await exportDataset();
    } finally {
      closeDb();
    }
  });

// Run all command
program
  .command('run-all')
  .description('Run all pipelines in order (resolve → fetch-uploads → crawl → fetch-details → export)')
  .option('-n, --max-videos <number>', 'Maximum videos to fetch details for', parseInt)
  .action(async (options) => {
    checkApiKey();
    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  🎵 TAMIL MTV CATALOG - FULL PIPELINE');
      console.log('═══════════════════════════════════════════════════════════════');

      // Step 1: Resolve channels
      console.log('\n[1/5] Resolving channels...');
      await resolveChannels();

      // Step 2: Fetch uploads playlists
      console.log('\n[2/5] Fetching uploads playlists...');
      await fetchUploadsPlaylists();

      // Step 3: Crawl uploads
      console.log('\n[3/5] Crawling uploads playlists...');
      await crawlUploads();

      // Step 4: Fetch video details
      console.log('\n[4/5] Fetching video details...');
      await fetchVideoDetails(options.maxVideos);

      // Step 5: Export
      console.log('\n[5/5] Exporting dataset...');
      await exportDataset();

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ PIPELINE COMPLETE');
      console.log('═══════════════════════════════════════════════════════════════');

      const stats = getStats();
      console.log(`\n  Channels resolved: ${stats.resolvedSeeds}`);
      console.log(`  Videos cataloged: ${stats.fetchedVideos}`);
      console.log(`  Output: ./data/videos.jsonl, ./data/videos.csv`);
    } finally {
      closeDb();
    }
  });

// Reset command (dangerous!)
program
  .command('reset')
  .description('Reset all progress (seeds stay, resolution/videos cleared)')
  .option('--confirm', 'Confirm the reset')
  .action(async (options) => {
    if (!options.confirm) {
      console.log('⚠️  This will reset all progress. Add --confirm to proceed.');
      return;
    }

    const db = getDb();

    console.log('Resetting database...');

    db.exec(`
      UPDATE seed_channels SET
        resolved_channel_id = NULL,
        resolved_title = NULL,
        resolved_handle = NULL,
        uploads_playlist_id = NULL,
        resolution_method = NULL,
        confidence_score = NULL,
        chosen_rank = NULL,
        subscriber_count = NULL,
        video_count = NULL,
        is_verified = 0,
        resolution_status = 'pending',
        resolution_error = NULL,
        resolved_at = NULL;

      DELETE FROM channels;
      DELETE FROM videos;
      DELETE FROM playlist_crawl_progress;
      DELETE FROM api_calls;
    `);

    console.log('✓ Database reset complete');
    closeDb();
  });

// Init seeds command
program
  .command('init-seeds')
  .description('Initialize seed channels in database without making API calls')
  .action(async () => {
    const { insertManySeedChannels } = await import('./db.js');
    const { SEED_CHANNELS } = await import('./seeds.js');

    getDb();
    insertManySeedChannels(SEED_CHANNELS);
    console.log(`✓ Initialized ${SEED_CHANNELS.length} seed channels`);
    closeDb();
  });

// Helper to check API key
function checkApiKey(): void {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY not set!');
    console.error('   Create a .env file with your YouTube API key:');
    console.error('   YOUTUBE_API_KEY=your_key_here');
    console.error('\n   Get a key from: https://console.cloud.google.com/apis/credentials');
    process.exit(1);
  }
}

// Parse and execute
program.parse();
