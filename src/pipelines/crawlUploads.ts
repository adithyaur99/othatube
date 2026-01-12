/**
 * Pipeline: Crawl uploads playlists to discover videos
 *
 * For each channel's uploads playlist, paginate through all videos
 * and store video IDs for later metadata fetch.
 *
 * Supports resume: tracks pagination state in playlist_crawl_progress table.
 */

import ora, { type Ora } from 'ora';
import {
  getIncompletePlaylistChannels,
  getPlaylistProgress,
  upsertPlaylistProgress,
  insertManyDiscoveredVideos,
  getStats
} from '../db.js';
import { getPlaylistItems, checkQuota, getQuotaStatus } from '../youtube.js';

/**
 * Crawl a single playlist with resume support
 */
async function crawlPlaylist(
  playlistId: string,
  channelId: string,
  seedSource: string,
  spinner: Ora
): Promise<{ totalVideos: number; newVideos: number }> {
  // Get existing progress
  const progress = getPlaylistProgress(playlistId);

  let nextPageToken = progress?.next_page_token ?? undefined;
  let totalResults = progress?.total_results ?? 0;
  let fetchedCount = progress?.fetched_count ?? 0;
  let newVideosTotal = 0;

  do {
    if (!checkQuota(1)) {
      throw new Error('Quota limit reached');
    }

    spinner.text = `  Crawling ${seedSource} (${fetchedCount}${totalResults ? '/' + totalResults : ''} videos)...`;

    const response = await getPlaylistItems(playlistId, nextPageToken);

    if (response.totalResults && !totalResults) {
      totalResults = response.totalResults;
    }

    // Insert discovered videos
    const videos = response.items
      .filter(item => item.videoId)
      .map(item => ({
        videoId: item.videoId,
        channelId: channelId,
        publishedAt: item.publishedAt ?? null,
        discoveredFrom: 'uploads_playlist',
        seedSource: seedSource
      }));

    const newVideos = insertManyDiscoveredVideos(videos);
    newVideosTotal += newVideos;
    fetchedCount += response.items.length;

    // Update progress
    nextPageToken = response.nextPageToken;
    upsertPlaylistProgress({
      playlist_id: playlistId,
      channel_id: channelId,
      total_results: totalResults,
      fetched_count: fetchedCount,
      next_page_token: nextPageToken,
      is_complete: nextPageToken ? 0 : 1
    });

  } while (nextPageToken);

  return { totalVideos: fetchedCount, newVideos: newVideosTotal };
}

/**
 * Main crawl uploads pipeline
 */
export async function crawlUploads(): Promise<void> {
  console.log('\n🎬 CRAWL UPLOADS PIPELINE\n');

  // Get channels with incomplete playlists
  const channels = getIncompletePlaylistChannels();
  console.log(`Found ${channels.length} channels with playlists to crawl\n`);

  if (channels.length === 0) {
    console.log('All playlists have been crawled!');
    const stats = getStats();
    console.log(`  Total videos discovered: ${stats.totalVideos}`);
    return;
  }

  // Check quota
  const quota = getQuotaStatus();
  console.log(`Quota: ${quota.used}/${quota.limit} used (${quota.remaining} remaining)\n`);

  const spinner = ora().start();

  let totalProcessed = 0;
  let totalVideos = 0;
  let totalNewVideos = 0;

  for (const channel of channels) {
    if (!channel.uploads_playlist_id) continue;

    try {
      spinner.text = `Crawling: ${channel.seed_name}`;

      const { totalVideos: channelVideos, newVideos } = await crawlPlaylist(
        channel.uploads_playlist_id,
        channel.resolved_channel_id!,
        channel.seed_name,
        spinner
      );

      totalVideos += channelVideos;
      totalNewVideos += newVideos;
      totalProcessed++;

      spinner.succeed(`✓ ${channel.seed_name}: ${channelVideos} videos (${newVideos} new)`);
      spinner.start();
    } catch (error) {
      if ((error as Error).message.includes('Quota')) {
        spinner.warn(`⏸ Quota limit reached at ${channel.seed_name}`);
        break;
      }
      spinner.fail(`✗ ${channel.seed_name}: ${error}`);
      spinner.start();
    }
  }

  spinner.stop();

  // Summary
  console.log('\n📊 Crawl Summary:');
  console.log(`  Channels processed: ${totalProcessed}`);
  console.log(`  Total videos found: ${totalVideos}`);
  console.log(`  New videos added: ${totalNewVideos}`);

  const stats = getStats();
  console.log(`\n  Total videos in DB: ${stats.totalVideos}`);
  console.log(`  Pending metadata: ${stats.pendingVideos}`);
  console.log(`  Quota used today: ${stats.quotaUsedToday}`);
}

export default crawlUploads;
