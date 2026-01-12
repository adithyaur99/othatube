/**
 * Export filtered videos (music only, proper duration)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'tamil-mtv.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'web', 'public', 'data');
const MIN_DURATION = 100;
const MAX_DURATION = 480;

const DECADES = ['1980s', '1990s', '2000s', '2010s', '2020s'] as const;
type Decade = typeof DECADES[number];

interface VideoRecord {
  youtube_id: string;
  title: string | null;
  published_at: string | null;
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
  console.log('🎬 Exporting Filtered Tamil MTV Data\n');

  const db = new Database(DB_PATH);

  // Get all valid music videos
  const allVideos = db.prepare(`
    SELECT youtube_id, title, published_at
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND is_music_candidate = 1
    AND duration_seconds IS NOT NULL
    AND duration_seconds >= ?
    AND duration_seconds <= ?
  `).all(MIN_DURATION, MAX_DURATION) as VideoRecord[];

  console.log(`📊 ${allVideos.length} videos pass all filters\n`);

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
