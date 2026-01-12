/**
 * Fetch video durations from YouTube Data API
 *
 * This script:
 * 1. Fetches durations from YouTube API for videos with titles
 * 2. Updates the database with duration_seconds
 * 3. Re-exports filtered videos (100s-480s only)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = path.join(__dirname, '..', 'data', 'tamil-mtv.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'web', 'public', 'data');
const API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyATbnPnkSVR-FQqkihaNTpj3BnnQrbm02I';
const BATCH_SIZE = 50;  // YouTube API allows 50 IDs per request
const MIN_DURATION = 100;  // 1:40 - filter out shorts
const MAX_DURATION = 480;  // 8:00 - filter out compilations
const DELAY_MS = 100;  // Delay between API calls

// Decade categories
const DECADES = ['1980s', '1990s', '2000s', '2010s', '2020s'] as const;
type Decade = typeof DECADES[number];

interface VideoRecord {
  youtube_id: string;
  title: string | null;
  published_at: string | null;
  duration_seconds: number | null;
}

interface YouTubeVideoItem {
  id: string;
  contentDetails?: {
    duration: string;
  };
}

interface YouTubeResponse {
  items: YouTubeVideoItem[];
}

/**
 * Parse ISO 8601 duration to seconds
 * e.g., "PT4M30S" -> 270
 */
function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Fetch durations for a batch of video IDs
 */
async function fetchDurations(videoIds: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  if (videoIds.length === 0) return results;

  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error(`API Error: ${response.status} - ${error}`);
      return results;
    }

    const data: YouTubeResponse = await response.json();

    for (const item of data.items) {
      if (item.contentDetails?.duration) {
        const seconds = parseDuration(item.contentDetails.duration);
        results.set(item.id, seconds);
      }
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }

  return results;
}

// Known Tamil movies with release years (for decade categorization)
const KNOWN_MOVIES: Record<string, number> = {
  'mouna ragam': 1986, 'nayakan': 1987, 'agni natchathiram': 1988,
  'roja': 1992, 'gentleman': 1993, 'kadhalan': 1994, 'bombay': 1995,
  'indian': 1996, 'minsara kanavu': 1997, 'jeans': 1998, 'padayappa': 1999,
  'alaipayuthey': 2000, 'minnale': 2001, 'kaakha kaakha': 2003,
  'anniyan': 2005, 'sivaji': 2007, 'dasavathaaram': 2008,
  'enthiran': 2010, 'vinnaithaandi varuvaayaa': 2010, '3': 2012,
  'thuppakki': 2012, 'kaththi': 2014, 'i': 2015, 'kabali': 2016,
  'mersal': 2017, 'vikram vedha': 2017, '96': 2018, 'bigil': 2019,
  'master': 2021, 'vikram': 2022, 'ponniyin selvan': 2022,
  'jailer': 2023, 'leo': 2023,
};

/**
 * Estimate decade from title
 */
function estimateDecade(title: string, publishedAt: string | null): Decade {
  const titleLower = title.toLowerCase();

  // Check known movies
  for (const [movie, year] of Object.entries(KNOWN_MOVIES)) {
    if (titleLower.includes(movie)) {
      if (year < 1990) return '1980s';
      if (year < 2000) return '1990s';
      if (year < 2010) return '2000s';
      if (year < 2020) return '2010s';
      return '2020s';
    }
  }

  // Check year patterns
  const yearMatch = title.match(/\b(19[789]\d|20[012]\d)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year < 1990) return '1980s';
    if (year < 2000) return '1990s';
    if (year < 2010) return '2000s';
    if (year < 2020) return '2010s';
    return '2020s';
  }

  // Composer hints
  if (/ilaiyaraaja|ilayaraja/i.test(title)) return '1990s';
  if (/a\.?\s*r\.?\s*rahman/i.test(title)) return '2000s';
  if (/anirudh/i.test(title)) return '2010s';
  if (/harris\s*jayaraj/i.test(title)) return '2000s';

  // Default based on upload date
  if (publishedAt) {
    const year = new Date(publishedAt).getFullYear();
    if (year >= 2020) return '2020s';
    if (year >= 2015) return '2010s';
  }

  return '2010s'; // Default
}

function isIlaiyaraajaContent(title: string): boolean {
  return /ilaiyaraaja|ilayaraja|isaignani/i.test(title);
}

function isRahmanContent(title: string): boolean {
  return /a\.?\s*r\.?\s*rahman|ar\s*rahman/i.test(title);
}

async function main() {
  console.log('🎬 Tamil MTV Duration Fetcher\n');

  const db = new Database(DB_PATH);

  // Get videos with titles but no duration
  const videosNeedingDuration = db.prepare(`
    SELECT youtube_id, title, published_at, duration_seconds
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND (duration_seconds IS NULL OR duration_seconds = 0)
  `).all() as VideoRecord[];

  console.log(`📊 Found ${videosNeedingDuration.length} videos needing duration data\n`);

  if (videosNeedingDuration.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE videos SET duration_seconds = ? WHERE youtube_id = ?
    `);

    let fetched = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < videosNeedingDuration.length; i += BATCH_SIZE) {
      const batch = videosNeedingDuration.slice(i, i + BATCH_SIZE);
      const videoIds = batch.map(v => v.youtube_id);

      const percent = ((i / videosNeedingDuration.length) * 100).toFixed(1);
      process.stdout.write(`\r⏳ Fetching durations... ${percent}% (${i}/${videosNeedingDuration.length})`);

      const durations = await fetchDurations(videoIds);

      // Update database
      db.transaction(() => {
        for (const [videoId, duration] of durations) {
          updateStmt.run(duration, videoId);
        }
      })();

      fetched += durations.size;
      failed += batch.length - durations.size;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }

    console.log(`\n\n📊 Duration fetch complete: ${fetched} fetched, ${failed} failed\n`);
  }

  // Now get all videos with valid duration for export
  const allVideos = db.prepare(`
    SELECT youtube_id, title, published_at, duration_seconds
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND duration_seconds IS NOT NULL
    AND duration_seconds >= ?
    AND duration_seconds <= ?
  `).all(MIN_DURATION, MAX_DURATION) as VideoRecord[];

  console.log(`📊 ${allVideos.length} videos pass duration filter (${MIN_DURATION}s - ${MAX_DURATION}s)\n`);

  // Categorize videos
  const byDecade: Record<Decade, VideoRecord[]> = {
    '1980s': [], '1990s': [], '2000s': [], '2010s': [], '2020s': [],
  };
  const ilaiyaraajaVideos: VideoRecord[] = [];
  const rahmanVideos: VideoRecord[] = [];

  for (const video of allVideos) {
    const title = video.title || '';
    const decade = estimateDecade(title, video.published_at);
    byDecade[decade].push(video);

    if (isIlaiyaraajaContent(title)) ilaiyaraajaVideos.push(video);
    if (isRahmanContent(title)) rahmanVideos.push(video);
  }

  // Print stats
  console.log('📊 Categorization Results:');
  for (const decade of DECADES) {
    console.log(`   ${decade}: ${byDecade[decade].length} videos`);
  }
  console.log(`   Ilaiyaraaja TV: ${ilaiyaraajaVideos.length} videos`);
  console.log(`   A.R. Rahman TV: ${rahmanVideos.length} videos`);
  console.log(`   Total: ${allVideos.length} videos\n`);

  // Export JSON files
  console.log('📁 Exporting JSON files...\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const formatForExport = (v: VideoRecord) => ({
    youtube_id: v.youtube_id,
    title: v.title,
  });

  const shuffle = <T>(arr: T[]): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // Export decade files
  for (const decade of DECADES) {
    const videos = shuffle(byDecade[decade]).map(formatForExport);
    const filename = `videos.${decade.toLowerCase()}.json`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(videos));
    console.log(`   ✅ ${filename} (${videos.length} videos)`);
  }

  // Export composer collections
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'videos.ilaiyaraaja.json'),
    JSON.stringify(shuffle(ilaiyaraajaVideos).map(formatForExport))
  );
  console.log(`   ✅ videos.ilaiyaraaja.json (${ilaiyaraajaVideos.length} videos)`);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'videos.arr.json'),
    JSON.stringify(shuffle(rahmanVideos).map(formatForExport))
  );
  console.log(`   ✅ videos.arr.json (${rahmanVideos.length} videos)`);

  // Export all
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'videos.all.json'),
    JSON.stringify(shuffle(allVideos).map(formatForExport))
  );
  console.log(`   ✅ videos.all.json (${allVideos.length} videos)`);

  // Export stations
  const stations = [
    { slug: 'tamil-80s', name: 'Tamil 80s', icon: '🎹', description: 'Classic Tamil songs from the 1980s', videoFile: 'videos.1980s.json' },
    { slug: 'tamil-90s', name: 'Tamil 90s', icon: '📼', description: 'Golden era Tamil hits from the 1990s', videoFile: 'videos.1990s.json' },
    { slug: 'tamil-2000s', name: 'Tamil 2000s', icon: '💿', description: 'Tamil hits from the 2000s', videoFile: 'videos.2000s.json' },
    { slug: 'tamil-2010s', name: 'Tamil 2010s', icon: '📱', description: 'Modern Tamil hits from the 2010s', videoFile: 'videos.2010s.json' },
    { slug: 'tamil-2020s', name: 'Tamil 2020s', icon: '🔥', description: 'Latest Tamil hits from 2020s', videoFile: 'videos.2020s.json' },
    { slug: 'shuffle-all', name: 'Shuffle All', icon: '🎲', description: 'Random mix of all Tamil songs', videoFile: 'videos.all.json' },
    { slug: 'ilaiyaraaja-tv', name: 'Ilaiyaraaja TV', icon: '👑', description: 'The Maestro\'s collection', videoFile: 'videos.ilaiyaraaja.json' },
    { slug: 'arr-tv', name: 'A.R. Rahman TV', icon: '🎹', description: 'Mozart of Madras collection', videoFile: 'videos.arr.json' },
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'stations.json'), JSON.stringify(stations, null, 2));
  console.log(`   ✅ stations.json`);

  console.log('\n🎬 Export complete!');
  console.log('\n📋 Video counts for App.tsx:');
  console.log(JSON.stringify({
    '1980s': byDecade['1980s'].length,
    '1990s': byDecade['1990s'].length,
    '2000s': byDecade['2000s'].length,
    '2010s': byDecade['2010s'].length,
    '2020s': byDecade['2020s'].length,
    'all': allVideos.length,
    'ilaiyaraaja': ilaiyaraajaVideos.length,
    'arr': rahmanVideos.length,
  }, null, 2));

  db.close();
}

main().catch(console.error);
