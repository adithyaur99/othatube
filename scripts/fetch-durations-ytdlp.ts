/**
 * Fetch video durations using yt-dlp (no API quota!)
 *
 * Uses parallel yt-dlp processes to fetch durations efficiently.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = path.join(__dirname, '..', 'data', 'tamil-mtv.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'web', 'public', 'data');
const CONCURRENT = 20;  // Parallel yt-dlp processes
const MIN_DURATION = 100;
const MAX_DURATION = 480;

const DECADES = ['1980s', '1990s', '2000s', '2010s', '2020s'] as const;
type Decade = typeof DECADES[number];

interface VideoRecord {
  youtube_id: string;
  title: string | null;
  published_at: string | null;
  duration_seconds: number | null;
}

/**
 * Fetch duration for a single video using yt-dlp
 */
async function fetchDuration(videoId: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `yt-dlp --print duration "https://www.youtube.com/watch?v=${videoId}" 2>/dev/null`,
      { timeout: 15000 }
    );
    const duration = parseInt(stdout.trim(), 10);
    return isNaN(duration) ? null : duration;
  } catch {
    return null;
  }
}

/**
 * Fetch durations for multiple videos in parallel
 */
async function fetchDurationsBatch(videoIds: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  const promises = videoIds.map(async (id) => {
    const duration = await fetchDuration(id);
    if (duration !== null) {
      results.set(id, duration);
    }
  });

  await Promise.all(promises);
  return results;
}

// Known movies for decade categorization
const KNOWN_MOVIES: Record<string, number> = {
  'mouna ragam': 1986, 'nayakan': 1987, 'roja': 1992, 'bombay': 1995,
  'indian': 1996, 'padayappa': 1999, 'alaipayuthey': 2000, 'kaakha kaakha': 2003,
  'anniyan': 2005, 'sivaji': 2007, 'enthiran': 2010, '3': 2012,
  'kaththi': 2014, 'kabali': 2016, 'mersal': 2017, '96': 2018,
  'master': 2021, 'vikram': 2022, 'jailer': 2023, 'leo': 2023,
};

function estimateDecade(title: string, publishedAt: string | null): Decade {
  const titleLower = title.toLowerCase();
  for (const [movie, year] of Object.entries(KNOWN_MOVIES)) {
    if (titleLower.includes(movie)) {
      if (year < 1990) return '1980s';
      if (year < 2000) return '1990s';
      if (year < 2010) return '2000s';
      if (year < 2020) return '2010s';
      return '2020s';
    }
  }
  const yearMatch = title.match(/\b(19[789]\d|20[012]\d)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year < 1990) return '1980s';
    if (year < 2000) return '1990s';
    if (year < 2010) return '2000s';
    if (year < 2020) return '2010s';
    return '2020s';
  }
  if (/ilaiyaraaja|ilayaraja/i.test(title)) return '1990s';
  if (/anirudh/i.test(title)) return '2010s';
  return '2010s';
}

function isIlaiyaraajaContent(title: string): boolean {
  return /ilaiyaraaja|ilayaraja|isaignani/i.test(title);
}

function isRahmanContent(title: string): boolean {
  return /a\.?\s*r\.?\s*rahman|ar\s*rahman/i.test(title);
}

async function main() {
  console.log('🎬 Tamil MTV Duration Fetcher (yt-dlp)\n');

  const db = new Database(DB_PATH);

  // Get videos needing duration
  const videosNeedingDuration = db.prepare(`
    SELECT youtube_id, title, published_at, duration_seconds
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND (duration_seconds IS NULL OR duration_seconds = 0)
  `).all() as VideoRecord[];

  console.log(`📊 ${videosNeedingDuration.length} videos need duration data`);
  console.log(`⚡ Using ${CONCURRENT} parallel yt-dlp processes\n`);

  if (videosNeedingDuration.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE videos SET duration_seconds = ? WHERE youtube_id = ?
    `);

    let processed = 0;
    let fetched = 0;
    let failed = 0;
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < videosNeedingDuration.length; i += CONCURRENT) {
      const batch = videosNeedingDuration.slice(i, i + CONCURRENT);
      const videoIds = batch.map(v => v.youtube_id);

      const durations = await fetchDurationsBatch(videoIds);

      // Update database
      db.transaction(() => {
        for (const [videoId, duration] of durations) {
          updateStmt.run(duration, videoId);
        }
      })();

      processed += batch.length;
      fetched += durations.size;
      failed += batch.length - durations.size;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (videosNeedingDuration.length - processed) / rate;
      const percent = ((processed / videosNeedingDuration.length) * 100).toFixed(1);

      process.stdout.write(`\r⏳ ${percent}% (${processed}/${videosNeedingDuration.length}) | ${fetched} ok, ${failed} failed | ~${Math.ceil(remaining / 60)}min left    `);
    }

    console.log(`\n\n📊 Duration fetch complete: ${fetched} fetched, ${failed} failed\n`);
  }

  // Export filtered videos
  const allVideos = db.prepare(`
    SELECT youtube_id, title, published_at, duration_seconds
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND duration_seconds IS NOT NULL
    AND duration_seconds >= ?
    AND duration_seconds <= ?
  `).all(MIN_DURATION, MAX_DURATION) as VideoRecord[];

  console.log(`📊 ${allVideos.length} videos pass duration filter (${MIN_DURATION}s - ${MAX_DURATION}s)\n`);

  // Categorize
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

  console.log('📊 Categorization:');
  for (const decade of DECADES) {
    console.log(`   ${decade}: ${byDecade[decade].length}`);
  }
  console.log(`   Ilaiyaraaja: ${ilaiyaraajaVideos.length}`);
  console.log(`   Rahman: ${rahmanVideos.length}\n`);

  // Export
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const format = (v: VideoRecord) => ({ youtube_id: v.youtube_id, title: v.title });
  const shuffle = <T>(arr: T[]): T[] => {
    const r = [...arr];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };

  console.log('📁 Exporting...');
  for (const decade of DECADES) {
    const v = shuffle(byDecade[decade]).map(format);
    fs.writeFileSync(path.join(OUTPUT_DIR, `videos.${decade.toLowerCase()}.json`), JSON.stringify(v));
    console.log(`   ✅ videos.${decade.toLowerCase()}.json (${v.length})`);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'videos.ilaiyaraaja.json'), JSON.stringify(shuffle(ilaiyaraajaVideos).map(format)));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'videos.arr.json'), JSON.stringify(shuffle(rahmanVideos).map(format)));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'videos.all.json'), JSON.stringify(shuffle(allVideos).map(format)));

  console.log(`   ✅ videos.ilaiyaraaja.json (${ilaiyaraajaVideos.length})`);
  console.log(`   ✅ videos.arr.json (${rahmanVideos.length})`);
  console.log(`   ✅ videos.all.json (${allVideos.length})`);

  const stations = [
    { slug: 'tamil-80s', name: 'Tamil 80s', icon: '🎹', description: 'Classic 1980s', videoFile: 'videos.1980s.json' },
    { slug: 'tamil-90s', name: 'Tamil 90s', icon: '📼', description: 'Golden 1990s', videoFile: 'videos.1990s.json' },
    { slug: 'tamil-2000s', name: 'Tamil 2000s', icon: '💿', description: '2000s hits', videoFile: 'videos.2000s.json' },
    { slug: 'tamil-2010s', name: 'Tamil 2010s', icon: '📱', description: '2010s hits', videoFile: 'videos.2010s.json' },
    { slug: 'tamil-2020s', name: 'Tamil 2020s', icon: '🔥', description: '2020s hits', videoFile: 'videos.2020s.json' },
    { slug: 'shuffle-all', name: 'Shuffle All', icon: '🎲', description: 'All songs', videoFile: 'videos.all.json' },
    { slug: 'ilaiyaraaja-tv', name: 'Ilaiyaraaja TV', icon: '👑', description: 'Maestro', videoFile: 'videos.ilaiyaraaja.json' },
    { slug: 'arr-tv', name: 'A.R. Rahman TV', icon: '🎹', description: 'Mozart of Madras', videoFile: 'videos.arr.json' },
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'stations.json'), JSON.stringify(stations, null, 2));

  console.log('\n🎬 Done! Update App.tsx with:');
  console.log(JSON.stringify({
    '80s': byDecade['1980s'].length, '90s': byDecade['1990s'].length,
    '2000s': byDecade['2000s'].length, '2010s': byDecade['2010s'].length,
    '2020s': byDecade['2020s'].length, 'all': allVideos.length,
    'ilaiyaraaja': ilaiyaraajaVideos.length, 'arr': rahmanVideos.length,
  }, null, 2));

  db.close();
}

main().catch(console.error);
