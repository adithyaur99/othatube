#!/usr/bin/env tsx
/**
 * Fetch video metadata and properly categorize Tamil MTV videos
 *
 * This script:
 * 1. Fetches video titles and durations from YouTube API
 * 2. Filters out shorts (<100s) and long videos (>8min)
 * 3. Parses titles to extract actual release years
 * 4. Exports properly categorized data files
 */

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'tamil-mtv.db');
const OUTPUT_DIR = join(__dirname, '..', 'web', 'public', 'data');

// YouTube API
const API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyDMjULdlGYy3U3sSKuaJpbK8harsw-uOC4';
const BATCH_SIZE = 50; // YouTube allows 50 IDs per request
const MIN_DURATION = 100; // 1:40 - filter out shorts
const MAX_DURATION = 480; // 8:00 - filter out full movies/compilations

interface VideoRecord {
  youtube_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  published_at: string;
  year: number;
  decade: number;
  duration_sec: number;
  thumb_url: string;
  embeddable: boolean;
  is_music_candidate: boolean;
}

// Known Tamil movies with release years
const KNOWN_MOVIES: Record<string, number> = {
  // 1980s
  'mouna ragam': 1986,
  'nayakan': 1987,
  'agni natchathiram': 1988,
  'apoorva sagodharargal': 1989,
  'thalapathi': 1991,

  // Early 1990s
  'guna': 1991,
  'thevar magan': 1992,
  'roja': 1992,
  'annamalai': 1992,
  'gentleman': 1993,
  'thiruda thiruda': 1993,
  'kizhakku cheemayile': 1993,
  'duet': 1994,
  'kadhalan': 1994,
  'mahanadhi': 1994,
  'baasha': 1995,
  'muthu': 1995,
  'bombay': 1995,
  'indian': 1996,
  'love birds': 1996,
  'minsara kanavu': 1997,
  'jeans': 1998,
  'dil se': 1998,
  'sethu': 1999,
  'mudhalvan': 1999,
  'padayappa': 1999,
  'kadhalar dhinam': 1999,

  // 2000s
  'alaipayuthey': 2000,
  'kandukondain': 2000,
  'kushi': 2000,
  'rhythm': 2000,
  'hey ram': 2000,
  'minnale': 2001,
  'dum dum dum': 2001,
  'kannathil muthamittal': 2002,
  'kaakha kaakha': 2003,
  'anbe sivam': 2003,
  'pithamagan': 2003,
  'autograph': 2004,
  '7g rainbow colony': 2004,
  'ghilli': 2004,
  'anniyan': 2005,
  'chandramukhi': 2005,
  'rang de basanti': 2006,
  'sivaji': 2007,
  'mozhi': 2007,
  'dasavathaaram': 2008,
  'vaaranam aayiram': 2008,
  'ayan': 2009,
  'aadhavan': 2009,

  // 2010s
  'enthiran': 2010,
  'vinnaithaandi varuvaayaa': 2010,
  'mankatha': 2011,
  'ko': 2011,
  '3': 2012,
  'thuppakki': 2012,
  'vishwaroopam': 2013,
  'theri': 2016,
  'kabali': 2016,
  'mersal': 2017,
  'vikram vedha': 2017,
  'kaala': 2018,
  '96': 2018,
  'viswasam': 2019,
  'bigil': 2019,
  'asuran': 2019,

  // 2020s
  'master': 2021,
  'karnan': 2021,
  'jai bhim': 2021,
  'vikram': 2022,
  'ponniyin selvan': 2022,
  'beast': 2022,
  'jailer': 2023,
  'leo': 2023,
  'viduthalai': 2023,
};

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(isoDuration: string): number {
  if (!isoDuration) return 0;

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extract year from video title
 */
function extractYearFromTitle(title: string): number | null {
  if (!title) return null;

  const lowerTitle = title.toLowerCase();

  // Pattern 1: Explicit year in various formats
  const yearPatterns = [
    /\((\d{4})\)/,              // (1995)
    /\[(\d{4})\]/,              // [1995]
    /\|\s*(\d{4})\s*\|/,        // | 1995 |
    /\|\s*(\d{4})\s*$/,         // | 1995 (end)
    /[-–—]\s*(\d{4})\s*[-–—]/,  // - 1995 -
    /[-–—]\s*(\d{4})\s*$/,      // - 1995 (end)
    /\b(198\d|199\d|200\d|201\d|202\d)\b/,  // Any year
  ];

  for (const pattern of yearPatterns) {
    const match = title.match(pattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1980 && year <= 2025) {
        return year;
      }
    }
  }

  // Pattern 2: Check against known movie names
  for (const [movie, year] of Object.entries(KNOWN_MOVIES)) {
    if (lowerTitle.includes(movie)) {
      return year;
    }
  }

  return null;
}

/**
 * Estimate decade based on title, composer hints, and channel
 */
function estimateDecade(title: string, channelTitle: string): number {
  const lowerTitle = (title || '').toLowerCase();
  const lowerChannel = (channelTitle || '').toLowerCase();

  // Check explicit year first
  const explicitYear = extractYearFromTitle(title);
  if (explicitYear) {
    return Math.floor(explicitYear / 10) * 10;
  }

  // Composer-based estimation
  // Ilaiyaraaja - peak 1980s-1990s
  if (lowerTitle.includes('ilaiyaraaja') || lowerTitle.includes('ilayaraja') ||
      lowerTitle.includes('isaignani') || lowerChannel.includes('ilaiyaraaja')) {
    if (lowerTitle.includes('80') || lowerTitle.includes('1980')) return 1980;
    return 1990; // Default to 90s for Ilaiyaraaja
  }

  // A.R. Rahman - 1992 onwards, peak 1990s-2000s
  if (lowerTitle.includes('rahman') || lowerTitle.includes('a.r.') ||
      lowerTitle.includes('a r rahman') || lowerTitle.includes('arr')) {
    if (lowerTitle.includes('90')) return 1990;
    return 2000; // Default to 2000s for Rahman
  }

  // Harris Jayaraj - 2000s composer
  if (lowerTitle.includes('harris') || lowerTitle.includes('harris jayaraj')) {
    return 2000;
  }

  // Yuvan Shankar Raja - late 2000s-2010s
  if (lowerTitle.includes('yuvan')) {
    return 2010;
  }

  // Anirudh, Santhosh Narayanan, GV Prakash - 2010s+
  if (lowerTitle.includes('anirudh') || lowerTitle.includes('santhosh narayanan') ||
      lowerTitle.includes('gv prakash') || lowerTitle.includes('hip hop tamizha')) {
    return 2010;
  }

  // D. Imman, Sam CS - 2010s
  if (lowerTitle.includes('d.imman') || lowerTitle.includes('d imman') ||
      lowerTitle.includes('sam cs') || lowerTitle.includes('sam c.s')) {
    return 2010;
  }

  // Keywords for old content
  if (lowerTitle.includes('classic') || lowerTitle.includes('evergreen') ||
      lowerTitle.includes('old song') || lowerTitle.includes('golden hit') ||
      lowerTitle.includes('melody') || lowerTitle.includes('nostalgic')) {
    return 1990;
  }

  // Default to 2010s for unknown
  return 2010;
}

/**
 * Fetch video details from YouTube API in batches
 */
async function fetchVideoDetails(
  videoIds: string[],
  onProgress: (fetched: number, total: number) => void
): Promise<Map<string, { title: string; duration: number }>> {
  const results = new Map<string, { title: string; duration: number }>();

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(',');

    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids}&key=${API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        if (error.error?.errors?.[0]?.reason === 'quotaExceeded') {
          console.log('\n⚠️  YouTube API quota exceeded. Using partial data...');
          break;
        }
        console.error(`API Error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      for (const item of data.items || []) {
        results.set(item.id, {
          title: item.snippet?.title || '',
          duration: parseDuration(item.contentDetails?.duration || ''),
        });
      }

      onProgress(Math.min(i + BATCH_SIZE, videoIds.length), videoIds.length);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      console.error(`Batch error:`, error);
    }
  }

  return results;
}

async function main() {
  console.log('🎵 Fetching and categorizing Tamil MTV videos...\n');
  console.log(`Duration filter: ${MIN_DURATION}s - ${MAX_DURATION}s (${Math.floor(MIN_DURATION/60)}:${MIN_DURATION%60} to ${Math.floor(MAX_DURATION/60)}:${MAX_DURATION%60})\n`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    console.error(`❌ Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  // Get all videos from database
  const dbVideos = db.prepare(`
    SELECT
      v.youtube_id,
      v.title,
      v.channel_id,
      COALESCE(c.title, v.seed_source) as channel_title,
      v.published_at,
      v.duration_seconds,
      COALESCE(v.thumbnail_url, 'https://i.ytimg.com/vi/' || v.youtube_id || '/mqdefault.jpg') as thumb_url,
      COALESCE(v.is_embeddable, 1) as embeddable
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.channel_id
    WHERE (v.is_short IS NULL OR v.is_short = 0)
  `).all() as any[];

  console.log(`Found ${dbVideos.length} videos in database\n`);

  // Get video IDs that need metadata
  const needMetadata = dbVideos
    .filter(v => !v.title || v.duration_seconds === null)
    .map(v => v.youtube_id);

  console.log(`${needMetadata.length} videos need metadata from YouTube API\n`);

  // Fetch metadata from YouTube API
  let fetchedMetadata = new Map<string, { title: string; duration: number }>();

  if (needMetadata.length > 0) {
    console.log('Fetching from YouTube API...');
    fetchedMetadata = await fetchVideoDetails(needMetadata, (fetched, total) => {
      process.stdout.write(`\r  Progress: ${fetched}/${total} (${Math.round(fetched/total*100)}%)`);
    });
    console.log(`\n\nFetched metadata for ${fetchedMetadata.size} videos\n`);
  }

  // Process all videos
  const processedVideos: VideoRecord[] = [];
  let filtered = { short: 0, long: 0, noData: 0 };

  for (const video of dbVideos) {
    // Get metadata (from API or database)
    const apiData = fetchedMetadata.get(video.youtube_id);
    const title = apiData?.title || video.title || '';
    const duration = apiData?.duration || video.duration_seconds || 0;

    // Filter by duration
    if (duration > 0) {
      if (duration < MIN_DURATION) {
        filtered.short++;
        continue;
      }
      if (duration > MAX_DURATION) {
        filtered.long++;
        continue;
      }
    } else if (!title) {
      // No duration and no title - skip
      filtered.noData++;
      continue;
    }

    // Estimate decade from title
    const decade = estimateDecade(title, video.channel_title);
    const year = extractYearFromTitle(title) || (decade + 5);

    processedVideos.push({
      youtube_id: video.youtube_id,
      title: title || 'Tamil Song',
      channel_id: video.channel_id,
      channel_title: video.channel_title || 'Unknown',
      published_at: video.published_at || '',
      year,
      decade,
      duration_sec: duration,
      thumb_url: video.thumb_url,
      embeddable: video.embeddable === 1,
      is_music_candidate: true,
    });
  }

  console.log(`Filtered out:`);
  console.log(`  - ${filtered.short} videos < ${MIN_DURATION}s`);
  console.log(`  - ${filtered.long} videos > ${MAX_DURATION}s`);
  console.log(`  - ${filtered.noData} videos with no data`);
  console.log(`\nRemaining: ${processedVideos.length} videos\n`);

  // Group by decade
  const byDecade: Record<number, VideoRecord[]> = {
    1980: [],
    1990: [],
    2000: [],
    2010: [],
    2020: [],
  };

  for (const video of processedVideos) {
    const dec = video.decade;
    if (dec >= 1980 && dec <= 2020) {
      byDecade[dec].push(video);
    } else {
      byDecade[2010].push(video);
    }
  }

  // Export decade files
  const decades = [1980, 1990, 2000, 2010, 2020];
  for (const decade of decades) {
    const videos = byDecade[decade] || [];
    const filename = `videos.${decade}s.json`;
    writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(videos, null, 0));
    console.log(`✓ ${filename}: ${videos.length} videos`);
  }

  // Export all videos
  writeFileSync(join(OUTPUT_DIR, 'videos.all.json'), JSON.stringify(processedVideos, null, 0));
  console.log(`✓ videos.all.json: ${processedVideos.length} videos`);

  // Export composer playlists
  const ilaiyaraajaVideos = processedVideos.filter(v => {
    const s = `${v.title} ${v.channel_title}`.toLowerCase();
    return s.includes('ilaiyaraaja') || s.includes('ilayaraja') || s.includes('isaignani');
  });
  writeFileSync(join(OUTPUT_DIR, 'videos.ilaiyaraaja.json'), JSON.stringify(ilaiyaraajaVideos, null, 0));
  console.log(`✓ videos.ilaiyaraaja.json: ${ilaiyaraajaVideos.length} videos`);

  const arrVideos = processedVideos.filter(v => {
    const s = `${v.title} ${v.channel_title}`.toLowerCase();
    return s.includes('rahman') || s.includes('a.r.') || s.includes('a r rahman');
  });
  writeFileSync(join(OUTPUT_DIR, 'videos.arr.json'), JSON.stringify(arrVideos, null, 0));
  console.log(`✓ videos.arr.json: ${arrVideos.length} videos`);

  // Update stations
  const stations = [
    { slug: 'tamil-80s', name: 'Tamil 80s', description: 'Ilaiyaraaja era classics', dataFile: 'videos.1980s.json', icon: '📼' },
    { slug: 'tamil-90s', name: 'Tamil 90s', description: 'Golden era - Rahman & Ilaiyaraaja', dataFile: 'videos.1990s.json', icon: '📻' },
    { slug: 'tamil-2000s', name: 'Tamil 2000s', description: 'Millennium hits', dataFile: 'videos.2000s.json', icon: '📀' },
    { slug: 'tamil-2010s', name: 'Tamil 2010s', description: 'Modern classics', dataFile: 'videos.2010s.json', icon: '🎵' },
    { slug: 'tamil-2020s', name: 'Tamil 2020s', description: 'Latest hits', dataFile: 'videos.2020s.json', icon: '🔥' },
    { slug: 'shuffle-all', name: 'Shuffle All', description: 'Random mix', dataFile: 'videos.all.json', icon: '🔀' },
    { slug: 'ilaiyaraaja-tv', name: 'Ilaiyaraaja TV', description: 'The Maestro', dataFile: 'videos.ilaiyaraaja.json', icon: '🎻' },
    { slug: 'arr-tv', name: 'A.R. Rahman TV', description: 'Mozart of Madras', dataFile: 'videos.arr.json', icon: '🎹' },
  ];
  writeFileSync(join(OUTPUT_DIR, 'stations.json'), JSON.stringify(stations, null, 2));
  console.log(`✓ stations.json: ${stations.length} stations`);

  // Summary
  console.log('\n📊 Final Distribution:');
  for (const decade of decades) {
    console.log(`   ${decade}s: ${byDecade[decade].length} videos`);
  }
  console.log(`   Ilaiyaraaja: ${ilaiyaraajaVideos.length}`);
  console.log(`   A.R. Rahman: ${arrVideos.length}`);

  db.close();
  console.log('\n✅ Done!');
}

main().catch(console.error);
