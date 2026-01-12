/**
 * Export videos organized by music director (top 10 + shuffle)
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

interface VideoRecord {
  youtube_id: string;
  title: string | null;
}

// Music Directors with their search patterns (all with 50+ tracks)
const COMPOSERS = [
  // Original Top 10
  {
    slug: 'ilaiyaraaja',
    name: 'Ilaiyaraaja',
    icon: '👑',
    description: 'The Maestro - King of Tamil Film Music',
    patterns: ['ilaiyaraaja', 'ilayaraja', 'isaignani'],
  },
  {
    slug: 'deva',
    name: 'Deva',
    icon: '🎸',
    description: 'Mass Music Director',
    patterns: [' deva ', 'deva |', '| deva', 'deva music'],
  },
  {
    slug: 'arr',
    name: 'A.R. Rahman',
    icon: '🏆',
    description: 'Mozart of Madras - Oscar Winner',
    patterns: ['a.r. rahman', 'ar rahman', 'a r rahman', ' rahman '],
  },
  {
    slug: 'yuvan',
    name: 'Yuvan Shankar Raja',
    icon: '🎧',
    description: 'Youth Icon - U1',
    patterns: ['yuvan', ' u1 ', 'yuvan shankar'],
  },
  {
    slug: 'gv-prakash',
    name: 'G.V. Prakash',
    icon: '🎹',
    description: 'Young Sensation',
    patterns: ['g.v. prakash', 'gv prakash', 'g v prakash'],
  },
  {
    slug: 'anirudh',
    name: 'Anirudh',
    icon: '🔥',
    description: 'Rockstar - Modern Tamil Music',
    patterns: ['anirudh'],
  },
  {
    slug: 'santhosh-narayanan',
    name: 'Santhosh Narayanan',
    icon: '🥁',
    description: 'Master of Folk & Raw Music',
    patterns: ['santhosh narayanan', 'santosh narayanan'],
  },
  {
    slug: 'imman',
    name: 'D. Imman',
    icon: '🎺',
    description: 'King of Melodies',
    patterns: ['imman', 'd.imman', 'd imman'],
  },
  {
    slug: 'vidyasagar',
    name: 'Vidyasagar',
    icon: '🎻',
    description: 'Melody King',
    patterns: ['vidyasagar'],
  },
  {
    slug: 'harris',
    name: 'Harris Jayaraj',
    icon: '🎼',
    description: 'Master of BGM & Melodies',
    patterns: ['harris jayaraj', 'harris jeyaraj'],
  },
  // Additional Directors with 50+ tracks
  {
    slug: 'thaman',
    name: 'S. Thaman',
    icon: '⚡',
    description: 'Blockbuster Hit Machine',
    patterns: ['thaman', 's thaman', 's. thaman'],
  },
  {
    slug: 'ghibran',
    name: 'Ghibran',
    icon: '🌟',
    description: 'Musical Genius',
    patterns: ['ghibran', 'gibran'],
  },
  {
    slug: 'hiphop-tamizha',
    name: 'Hiphop Tamizha',
    icon: '🎤',
    description: 'Tamil Hip-Hop Revolution',
    patterns: ['hiphop tamizha', 'hip hop tamizha', 'hiphop aadhi'],
  },
  {
    slug: 'sam-cs',
    name: 'Sam C.S.',
    icon: '🎭',
    description: 'Master of Intense BGM',
    patterns: ['sam c.s', 'sam cs', ' sam c s'],
  },
  {
    slug: 'sean-roldan',
    name: 'Sean Roldan',
    icon: '🎵',
    description: 'Indie Music Pioneer',
    patterns: ['sean roldan', 'sean roland'],
  },
  {
    slug: 'msv',
    name: 'M.S. Viswanathan',
    icon: '🪷',
    description: 'Legendary Composer',
    patterns: ['m.s. viswanathan', 'ms viswanathan', 'msv'],
  },
  {
    slug: 'sirpy',
    name: 'Sirpy',
    icon: '🎷',
    description: 'Folk & Mass Entertainer',
    patterns: ['sirpy', 'sirpi'],
  },
  {
    slug: 'dharan',
    name: 'Dharan Kumar',
    icon: '🎶',
    description: 'Rising Star',
    patterns: ['dharan kumar', 'dharan'],
  },
  {
    slug: 'gangai-amaran',
    name: 'Gangai Amaran',
    icon: '🪘',
    description: 'Folk Legend',
    patterns: ['gangai amaran'],
  },
  {
    slug: 'srikanth-deva',
    name: 'Srikanth Deva',
    icon: '🎙',
    description: 'Mass Entertainer',
    patterns: ['srikanth deva'],
  },
  {
    slug: 'vijay-antony',
    name: 'Vijay Antony',
    icon: '🎬',
    description: 'Composer & Actor',
    patterns: ['vijay antony', 'vijay anthony'],
  },
  {
    slug: 'bharathwaj',
    name: 'Bharathwaj',
    icon: '🎹',
    description: 'Melody Maestro',
    patterns: ['bharathwaj', 'bharadwaj'],
  },
  {
    slug: 'nivas-prasanna',
    name: 'Nivas K. Prasanna',
    icon: '🎼',
    description: 'Modern Melodist',
    patterns: ['nivas k prasanna', 'nivas prasanna'],
  },
  {
    slug: 'sa-rajkumar',
    name: 'S.A. Rajkumar',
    icon: '💿',
    description: '90s Hit Machine',
    patterns: ['s.a. rajkumar', 'sa rajkumar', 's a rajkumar'],
  },
  {
    slug: 'justin-prabhakaran',
    name: 'Justin Prabhakaran',
    icon: '🌙',
    description: 'Soulful Composer',
    patterns: ['justin prabhakaran'],
  },
  {
    slug: 'mani-sharma',
    name: 'Mani Sharma',
    icon: '🎸',
    description: 'Telugu-Tamil Hitmaker',
    patterns: ['mani sharma'],
  },
  {
    slug: 'karthik-raja',
    name: 'Karthik Raja',
    icon: '👨‍👦',
    description: 'Son of the Maestro',
    patterns: ['karthik raja'],
  },
  {
    slug: 'c-sathya',
    name: 'C. Sathya',
    icon: '🎹',
    description: 'Versatile Composer',
    patterns: ['c. sathya', 'c sathya'],
  },
  {
    slug: 'leon-james',
    name: 'Leon James',
    icon: '✨',
    description: 'Young Talent',
    patterns: ['leon james'],
  },
];

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

async function main() {
  console.log('🎬 Exporting by Music Director\n');

  const db = new Database(DB_PATH);

  // Get all valid music videos
  const allVideos = db.prepare(`
    SELECT youtube_id, title
    FROM videos
    WHERE title IS NOT NULL AND title != ''
    AND is_music_candidate = 1
    AND duration_seconds IS NOT NULL
    AND duration_seconds >= ?
    AND duration_seconds <= ?
  `).all(MIN_DURATION, MAX_DURATION) as VideoRecord[];

  console.log(`📊 ${allVideos.length} total music videos\n`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const format = (v: VideoRecord) => ({ youtube_id: v.youtube_id, title: v.title });
  const stations: Array<{ slug: string; name: string; icon: string; description: string; videoFile: string }> = [];
  const composerCounts: Record<string, number> = {};

  // Export each composer
  console.log('📁 Exporting by composer...\n');

  for (const composer of COMPOSERS) {
    const videos = allVideos.filter(v => {
      const title = (v.title || '').toLowerCase();
      return composer.patterns.some(p => title.includes(p.toLowerCase()));
    });

    const filename = `videos.${composer.slug}.json`;
    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(shuffle(videos).map(format))
    );

    stations.push({
      slug: composer.slug,
      name: composer.name,
      icon: composer.icon,
      description: composer.description,
      videoFile: filename,
    });

    composerCounts[composer.name] = videos.length;
    console.log(`   ${composer.icon} ${composer.name}: ${videos.length} videos`);
  }

  // Add Shuffle All station
  const shuffleFilename = 'videos.all.json';
  fs.writeFileSync(
    path.join(OUTPUT_DIR, shuffleFilename),
    JSON.stringify(shuffle(allVideos).map(format))
  );

  stations.push({
    slug: 'shuffle-all',
    name: 'Shuffle All',
    icon: '🎲',
    description: 'Random mix of all Tamil songs',
    videoFile: shuffleFilename,
  });

  console.log(`\n   🎲 Shuffle All: ${allVideos.length} videos`);

  // Export stations config
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'stations.json'),
    JSON.stringify(stations, null, 2)
  );

  console.log('\n✅ stations.json exported');
  console.log('\n🎬 Done! Update App.tsx videoCounts with:');

  const counts: Record<string, number> = {};
  for (const composer of COMPOSERS) {
    counts[composer.slug] = composerCounts[composer.name];
  }
  counts['shuffle-all'] = allVideos.length;

  console.log(JSON.stringify(counts, null, 2));

  db.close();
}

main().catch(console.error);
