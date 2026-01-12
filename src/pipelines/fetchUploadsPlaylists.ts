/**
 * Pipeline: Fetch uploads playlist IDs for resolved channels
 *
 * For each resolved channel, get the "uploads" playlist ID from contentDetails
 */

import ora from 'ora';
import {
  getSeedChannelsNeedingUploadsPlaylist,
  updateSeedChannelUploadsPlaylist,
  upsertChannel,
  getStats
} from '../db.js';
import { getChannelsByIds, checkQuota, getQuotaStatus } from '../youtube.js';

/**
 * Main fetch uploads playlists pipeline
 */
export async function fetchUploadsPlaylists(): Promise<void> {
  console.log('\n📋 FETCH UPLOADS PLAYLISTS PIPELINE\n');

  // Get channels needing uploads playlist
  const channels = getSeedChannelsNeedingUploadsPlaylist();
  console.log(`Found ${channels.length} channels needing uploads playlist\n`);

  if (channels.length === 0) {
    console.log('All channels have uploads playlists!');
    return;
  }

  // Check quota
  const quota = getQuotaStatus();
  console.log(`Quota: ${quota.used}/${quota.limit} used (${quota.remaining} remaining)\n`);

  // Process in batches of 50 (API limit)
  const batchSize = 50;
  const spinner = ora().start();

  let processed = 0;
  let found = 0;
  let notFound = 0;

  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const channelIds = batch.map(c => c.resolved_channel_id!).filter(Boolean);

    if (channelIds.length === 0) continue;

    if (!checkQuota(1)) {
      spinner.warn('Quota limit approaching, stopping...');
      break;
    }

    spinner.text = `Fetching uploads playlists... (${i + 1}-${Math.min(i + batchSize, channels.length)} of ${channels.length})`;

    try {
      const details = await getChannelsByIds(channelIds);

      for (const channel of details) {
        const seed = batch.find(s => s.resolved_channel_id === channel.channelId);
        if (!seed) continue;

        // Update channel details
        upsertChannel({
          channel_id: channel.channelId,
          title: channel.title,
          description: channel.description,
          custom_url: channel.customUrl,
          handle: channel.handle,
          published_at: channel.publishedAt,
          thumbnail_url: channel.thumbnailUrl,
          banner_url: channel.bannerUrl,
          uploads_playlist_id: channel.uploadsPlaylistId,
          subscriber_count: channel.subscriberCount,
          video_count: channel.videoCount,
          view_count: channel.viewCount,
          country: channel.country,
          is_verified: channel.isVerified ? 1 : 0
        });

        if (channel.uploadsPlaylistId) {
          updateSeedChannelUploadsPlaylist(seed.seed_name, channel.uploadsPlaylistId);
          found++;
        } else {
          notFound++;
        }

        processed++;
      }

      // Handle channels not returned (may be terminated/deleted)
      for (const seed of batch) {
        if (!details.find(d => d.channelId === seed.resolved_channel_id)) {
          console.log(`\n  ⚠️  Channel not found: ${seed.seed_name} (${seed.resolved_channel_id})`);
          notFound++;
          processed++;
        }
      }
    } catch (error) {
      spinner.fail(`Error fetching batch: ${error}`);
    }
  }

  spinner.stop();

  // Summary
  console.log('\n📊 Fetch Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Found playlist: ${found}`);
  console.log(`  No playlist: ${notFound}`);

  const stats = getStats();
  console.log(`\n  Total channels in DB: ${stats.totalChannels}`);
  console.log(`  Quota used today: ${stats.quotaUsedToday}`);
}

export default fetchUploadsPlaylists;
