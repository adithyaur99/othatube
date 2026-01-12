/**
 * Pipeline: Resolve seed channel names to YouTube channel IDs
 *
 * Strategy:
 * 1. Check for manual overrides first
 * 2. If seed looks like a handle (@something), try forHandle API
 * 3. Fall back to search.list and pick best match using heuristics
 */

import ora, { type Ora } from 'ora';
import {
  insertManySeedChannels,
  getPendingSeedChannels,
  updateSeedChannelResolved,
  updateSeedChannelFailed,
  upsertChannel,
  getOverride,
  loadOverridesFromJson,
  getStats
} from '../db.js';
import {
  searchChannels,
  getChannelById,
  getChannelByHandle,
  getQuotaStatus,
  checkQuota
} from '../youtube.js';
import { SEED_CHANNELS, OFFICIAL_KEYWORDS, TAMIL_KEYWORDS } from '../seeds.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = join(__dirname, '..', '..', 'overrides.json');

interface MatchScore {
  score: number;
  reasons: string[];
}

/**
 * Calculate confidence score for a channel match
 */
function calculateMatchScore(
  seedName: string,
  channelTitle: string,
  channelDescription: string = '',
  subscriberCount?: number,
  rank: number = 1
): MatchScore {
  const reasons: string[] = [];
  let score = 0;

  const seedLower = seedName.toLowerCase();
  const titleLower = channelTitle.toLowerCase();
  const descLower = channelDescription.toLowerCase();

  // Exact match (case-insensitive)
  if (titleLower === seedLower) {
    score += 0.4;
    reasons.push('exact title match');
  }
  // Title contains seed or seed contains title
  else if (titleLower.includes(seedLower) || seedLower.includes(titleLower)) {
    score += 0.3;
    reasons.push('partial title match');
  }
  // Word overlap
  else {
    const seedWords = seedLower.split(/\s+/).filter(w => w.length > 2);
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2);
    const overlap = seedWords.filter(w => titleWords.includes(w)).length;
    if (overlap > 0) {
      score += 0.1 * Math.min(overlap, 3);
      reasons.push(`${overlap} word overlap`);
    }
  }

  // Official keywords in title
  for (const keyword of OFFICIAL_KEYWORDS) {
    if (titleLower.includes(keyword)) {
      score += 0.1;
      reasons.push(`contains "${keyword}"`);
      break;
    }
  }

  // Tamil keywords
  for (const keyword of TAMIL_KEYWORDS) {
    if (titleLower.includes(keyword) || descLower.includes(keyword)) {
      score += 0.1;
      reasons.push(`contains Tamil keyword "${keyword}"`);
      break;
    }
  }

  // Subscriber count bonus (more subscribers = more likely official)
  if (subscriberCount) {
    if (subscriberCount >= 10000000) {
      score += 0.15;
      reasons.push('10M+ subscribers');
    } else if (subscriberCount >= 1000000) {
      score += 0.1;
      reasons.push('1M+ subscribers');
    } else if (subscriberCount >= 100000) {
      score += 0.05;
      reasons.push('100K+ subscribers');
    }
  }

  // Rank penalty (prefer top results)
  if (rank > 1) {
    score -= 0.05 * (rank - 1);
    reasons.push(`search rank #${rank}`);
  }

  // Clamp score to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return { score, reasons };
}

/**
 * Check if a seed looks like a YouTube handle
 */
function looksLikeHandle(seed: string): boolean {
  return seed.startsWith('@') || /^[a-zA-Z0-9_-]+$/.test(seed.replace(/\s/g, ''));
}

/**
 * Resolve a single seed channel
 */
async function resolveSeed(
  seedName: string,
  spinner: Ora
): Promise<void> {
  spinner.text = `Resolving: ${seedName}`;

  // Check for manual override
  const override = getOverride(seedName);
  if (override) {
    spinner.text = `Resolving: ${seedName} (using manual override)`;

    const channel = await getChannelById(override.channel_id);
    if (channel) {
      upsertChannel({
        channel_id: channel.channelId,
        title: channel.title,
        description: channel.description,
        custom_url: channel.customUrl,
        handle: channel.handle,
        published_at: channel.publishedAt,
        thumbnail_url: channel.thumbnailUrl,
        uploads_playlist_id: channel.uploadsPlaylistId,
        subscriber_count: channel.subscriberCount,
        video_count: channel.videoCount,
        view_count: channel.viewCount,
        country: channel.country,
        is_verified: channel.isVerified ? 1 : 0
      });

      updateSeedChannelResolved(
        seedName,
        channel.channelId,
        channel.title,
        channel.handle ?? null,
        'manual_override',
        1.0,
        1,
        channel.subscriberCount,
        channel.videoCount,
        channel.isVerified
      );

      spinner.succeed(`✓ ${seedName} → ${channel.title} (override)`);
      return;
    }
  }

  // Try handle lookup if it looks like a handle
  if (looksLikeHandle(seedName.replace(/\s/g, ''))) {
    const handleToTry = seedName.replace(/\s/g, '');
    try {
      const channel = await getChannelByHandle(handleToTry);
      if (channel) {
        const { score, reasons } = calculateMatchScore(
          seedName,
          channel.title,
          channel.description,
          channel.subscriberCount
        );

        if (score >= 0.3) {
          upsertChannel({
            channel_id: channel.channelId,
            title: channel.title,
            description: channel.description,
            custom_url: channel.customUrl,
            handle: channel.handle,
            published_at: channel.publishedAt,
            thumbnail_url: channel.thumbnailUrl,
            uploads_playlist_id: channel.uploadsPlaylistId,
            subscriber_count: channel.subscriberCount,
            video_count: channel.videoCount,
            view_count: channel.viewCount,
            country: channel.country,
            is_verified: channel.isVerified ? 1 : 0
          });

          updateSeedChannelResolved(
            seedName,
            channel.channelId,
            channel.title,
            channel.handle ?? null,
            'handle',
            score,
            1,
            channel.subscriberCount,
            channel.videoCount,
            channel.isVerified
          );

          spinner.succeed(`✓ ${seedName} → ${channel.title} (handle, score=${score.toFixed(2)})`);
          return;
        }
      }
    } catch (error) {
      // Handle lookup failed, fall through to search
    }
  }

  // Fall back to search
  if (!checkQuota(100)) {
    updateSeedChannelFailed(seedName, 'Quota exhausted');
    spinner.warn(`⏸ ${seedName} - quota exhausted, skipping`);
    return;
  }

  const results = await searchChannels(seedName, 5);

  if (results.length === 0) {
    updateSeedChannelFailed(seedName, 'No search results');
    spinner.fail(`✗ ${seedName} - no results found`);
    return;
  }

  // Score all results and pick best
  let bestResult: typeof results[0] | null = null;
  let bestScore = 0;
  let bestRank = 0;
  let bestReasons: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { score, reasons } = calculateMatchScore(
      seedName,
      result.title,
      result.description,
      undefined, // We don't have subscriber count from search
      i + 1
    );

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
      bestRank = i + 1;
      bestReasons = reasons;
    }
  }

  if (!bestResult || bestScore < 0.2) {
    updateSeedChannelFailed(
      seedName,
      `Best match score too low (${bestScore.toFixed(2)}): ${bestResult?.title || 'none'}`
    );
    spinner.fail(`✗ ${seedName} - no confident match (best: ${bestScore.toFixed(2)})`);
    return;
  }

  // Fetch full channel details
  const channel = await getChannelById(bestResult.channelId);
  if (!channel) {
    updateSeedChannelFailed(seedName, `Could not fetch channel ${bestResult.channelId}`);
    spinner.fail(`✗ ${seedName} - channel fetch failed`);
    return;
  }

  // Recalculate score with full details
  const { score: finalScore, reasons: finalReasons } = calculateMatchScore(
    seedName,
    channel.title,
    channel.description,
    channel.subscriberCount,
    bestRank
  );

  upsertChannel({
    channel_id: channel.channelId,
    title: channel.title,
    description: channel.description,
    custom_url: channel.customUrl,
    handle: channel.handle,
    published_at: channel.publishedAt,
    thumbnail_url: channel.thumbnailUrl,
    uploads_playlist_id: channel.uploadsPlaylistId,
    subscriber_count: channel.subscriberCount,
    video_count: channel.videoCount,
    view_count: channel.viewCount,
    country: channel.country,
    is_verified: channel.isVerified ? 1 : 0
  });

  updateSeedChannelResolved(
    seedName,
    channel.channelId,
    channel.title,
    channel.handle ?? null,
    'search',
    finalScore,
    bestRank,
    channel.subscriberCount,
    channel.videoCount,
    channel.isVerified
  );

  const scoreEmoji = finalScore >= 0.7 ? '✓' : finalScore >= 0.4 ? '○' : '?';
  spinner.succeed(`${scoreEmoji} ${seedName} → ${channel.title} (rank=${bestRank}, score=${finalScore.toFixed(2)})`);
}

/**
 * Main resolve channels pipeline
 */
export async function resolveChannels(): Promise<void> {
  console.log('\n🎯 RESOLVE CHANNELS PIPELINE\n');

  // Load overrides if they exist
  if (existsSync(OVERRIDES_PATH)) {
    console.log(`Loading manual overrides from ${OVERRIDES_PATH}`);
    loadOverridesFromJson(OVERRIDES_PATH);
  }

  // Insert all seeds (idempotent)
  console.log(`Seeding ${SEED_CHANNELS.length} channels...`);
  insertManySeedChannels(SEED_CHANNELS);

  // Get pending seeds
  const pending = getPendingSeedChannels();
  console.log(`Found ${pending.length} channels to resolve\n`);

  if (pending.length === 0) {
    console.log('All channels already resolved!');
    const stats = getStats();
    console.log(`  Resolved: ${stats.resolvedSeeds}`);
    console.log(`  Failed: ${stats.failedSeeds}`);
    return;
  }

  // Check quota
  const quota = getQuotaStatus();
  console.log(`Quota: ${quota.used}/${quota.limit} used (${quota.remaining} remaining)\n`);

  const spinner = ora().start();

  let resolved = 0;
  let failed = 0;

  for (const seed of pending) {
    try {
      await resolveSeed(seed.seed_name, spinner);
      resolved++;
    } catch (error) {
      updateSeedChannelFailed(
        seed.seed_name,
        error instanceof Error ? error.message : String(error)
      );
      spinner.fail(`✗ ${seed.seed_name} - ${error}`);
      failed++;
    }

    // Check quota periodically
    if (!checkQuota(100)) {
      spinner.warn('Quota limit approaching, stopping...');
      break;
    }
  }

  spinner.stop();

  // Summary
  console.log('\n📊 Resolution Summary:');
  const stats = getStats();
  console.log(`  Total seeds: ${stats.totalSeeds}`);
  console.log(`  Resolved: ${stats.resolvedSeeds}`);
  console.log(`  Failed: ${stats.failedSeeds}`);
  console.log(`  Pending: ${stats.pendingSeeds}`);
  console.log(`  Quota used today: ${stats.quotaUsedToday}`);

  if (stats.failedSeeds > 0) {
    console.log('\n⚠️  Some channels failed to resolve. Consider adding them to overrides.json');
  }
}

export default resolveChannels;
