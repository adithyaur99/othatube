/**
 * Pipeline: Fetch detailed metadata for discovered videos
 *
 * Fetches video details in batches of 50 (API limit) and stores:
 * - Duration, view count, likes, comments
 * - Tags, category, language info
 * - Embed status, made for kids flag
 *
 * Also applies content filters:
 * - Marks Shorts (duration < 60s or title contains shorts)
 * - Flags non-music content (trailers, interviews, etc.)
 */

import ora from 'ora';
import {
  getPendingVideos,
  getPendingVideoCount,
  updateVideoMetadata,
  updateVideoFailed,
  getStats
} from '../db.js';
import { getVideosByIds, checkQuota, getQuotaStatus } from '../youtube.js';

const BATCH_SIZE = 50;

/**
 * Main fetch video details pipeline
 */
export async function fetchVideoDetails(maxVideos?: number): Promise<void> {
  console.log('\n📹 FETCH VIDEO DETAILS PIPELINE\n');

  const totalPending = getPendingVideoCount();
  const limit = maxVideos ?? totalPending;

  console.log(`Found ${totalPending} videos pending metadata`);
  if (maxVideos) {
    console.log(`Limiting to ${maxVideos} videos this run`);
  }
  console.log();

  if (totalPending === 0) {
    console.log('All videos have metadata!');
    return;
  }

  // Check quota
  const quota = getQuotaStatus();
  console.log(`Quota: ${quota.used}/${quota.limit} used (${quota.remaining} remaining)`);

  // Estimate batches needed
  const batchesNeeded = Math.ceil(Math.min(limit, totalPending) / BATCH_SIZE);
  console.log(`Estimated API calls: ${batchesNeeded}\n`);

  const spinner = ora().start();

  let processed = 0;
  let fetched = 0;
  let failed = 0;
  let shorts = 0;
  let nonMusic = 0;

  while (processed < limit) {
    if (!checkQuota(1)) {
      spinner.warn('Quota limit approaching, stopping...');
      break;
    }

    const videos = getPendingVideos(BATCH_SIZE);
    if (videos.length === 0) break;

    const videoIds = videos.map(v => v.youtube_id);

    spinner.text = `Fetching video details... (${processed + 1}-${processed + videos.length} of ${Math.min(limit, totalPending)})`;

    try {
      const details = await getVideosByIds(videoIds);

      // Create lookup map
      const detailsMap = new Map(details.map(d => [d.videoId, d]));

      for (const video of videos) {
        const detail = detailsMap.get(video.youtube_id);

        if (!detail) {
          updateVideoFailed(video.youtube_id, 'Video not found in API response', 'deleted');
          failed++;
        } else if (detail.status === 'deleted' || detail.status === 'private' || detail.status === 'blocked') {
          updateVideoFailed(video.youtube_id, `Video ${detail.status}`, detail.status);
          failed++;
        } else {
          updateVideoMetadata({
            youtube_id: detail.videoId,
            channel_id: detail.channelId,
            title: detail.title,
            description: detail.description,
            published_at: detail.publishedAt,
            thumbnail_url: detail.thumbnailUrl,
            thumbnail_high_url: detail.thumbnailHighUrl,
            duration_iso: detail.durationIso,
            duration_seconds: detail.durationSeconds,
            view_count: detail.viewCount,
            like_count: detail.likeCount,
            comment_count: detail.commentCount,
            tags: detail.tags ? JSON.stringify(detail.tags) : undefined,
            category_id: detail.categoryId,
            default_language: detail.defaultLanguage,
            default_audio_language: detail.defaultAudioLanguage,
            is_embeddable: detail.isEmbeddable ? 1 : 0,
            is_public: detail.isPublic ? 1 : 0,
            is_made_for_kids: detail.isMadeForKids ? 1 : 0,
            video_status: detail.status,
            metadata_status: 'fetched'
          });
          fetched++;

          // Track Shorts
          if (detail.durationSeconds !== undefined && detail.durationSeconds < 60) {
            shorts++;
          } else if (detail.title?.toLowerCase().includes('#shorts')) {
            shorts++;
          }

          // Track non-music
          if (detail.title) {
            const lowerTitle = detail.title.toLowerCase();
            if (['trailer', 'teaser', 'interview', 'promo', 'making'].some(k => lowerTitle.includes(k))) {
              nonMusic++;
            }
          }
        }

        processed++;
      }
    } catch (error) {
      spinner.fail(`Error fetching batch: ${error}`);

      // Mark all videos in batch as failed
      for (const video of videos) {
        updateVideoFailed(video.youtube_id, String(error));
        failed++;
        processed++;
      }
    }
  }

  spinner.stop();

  // Summary
  console.log('\n📊 Fetch Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Fetched successfully: ${fetched}`);
  console.log(`  Failed/unavailable: ${failed}`);
  console.log(`  Shorts detected: ${shorts}`);
  console.log(`  Non-music flagged: ${nonMusic}`);

  const stats = getStats();
  console.log(`\n  Total videos in DB: ${stats.totalVideos}`);
  console.log(`  With metadata: ${stats.fetchedVideos}`);
  console.log(`  Still pending: ${stats.pendingVideos}`);
  console.log(`  Quota used today: ${stats.quotaUsedToday}`);
}

export default fetchVideoDetails;
