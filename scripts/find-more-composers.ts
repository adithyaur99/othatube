/**
 * Find additional music directors in the database
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'data', 'tamil-mtv.db');

interface VideoRecord {
  youtube_id: string;
  title: string | null;
}

const db = new Database(DB_PATH);

// Additional music directors to check (beyond current top 10)
const additionalComposers = [
  { name: 'Hiphop Tamizha', patterns: ['hiphop tamizha', 'hip hop tamizha', 'hiphop aadhi'] },
  { name: 'S.A. Rajkumar', patterns: ['s.a. rajkumar', 'sa rajkumar', 's a rajkumar'] },
  { name: 'Vijay Antony', patterns: ['vijay antony', 'vijay anthony'] },
  { name: 'Bharathwaj', patterns: ['bharathwaj', 'bharadwaj'] },
  { name: 'Sirpy', patterns: ['sirpy', 'sirpi'] },
  { name: 'Mani Sharma', patterns: ['mani sharma'] },
  { name: 'Sam C.S.', patterns: ['sam c.s', 'sam cs', ' sam c s'] },
  { name: 'Sean Roldan', patterns: ['sean roldan', 'sean roland'] },
  { name: 'Ghibran', patterns: ['ghibran', 'gibran'] },
  { name: 'C. Sathya', patterns: ['c. sathya', 'c sathya'] },
  { name: 'S. Thaman', patterns: ['thaman', 's thaman', 's. thaman'] },
  { name: 'Karthik Raja', patterns: ['karthik raja'] },
  { name: 'James Vasanthan', patterns: ['james vasanthan'] },
  { name: 'Srikanth Deva', patterns: ['srikanth deva'] },
  { name: 'Dharan Kumar', patterns: ['dharan kumar', 'dharan'] },
  { name: 'M.S. Viswanathan', patterns: ['m.s. viswanathan', 'ms viswanathan', 'msv'] },
  { name: 'Gangai Amaran', patterns: ['gangai amaran'] },
  { name: 'Darbuka Siva', patterns: ['darbuka siva'] },
  { name: 'Justin Prabhakaran', patterns: ['justin prabhakaran'] },
  { name: 'Leon James', patterns: ['leon james'] },
  { name: 'Nivas K. Prasanna', patterns: ['nivas k prasanna', 'nivas prasanna'] },
  { name: 'Siddharth Vipin', patterns: ['siddharth vipin'] },
  { name: 'Ron Ethan Yohann', patterns: ['ron ethan yohann'] },
  { name: 'Aruldev', patterns: ['aruldev'] },
];

const allVideos = db.prepare(`
  SELECT youtube_id, title
  FROM videos
  WHERE title IS NOT NULL AND title != ''
  AND is_music_candidate = 1
  AND duration_seconds IS NOT NULL
  AND duration_seconds >= 100
  AND duration_seconds <= 480
`).all() as VideoRecord[];

console.log('📊 Additional Music Directors Video Counts:\n');
console.log('Music Director'.padEnd(25) + 'Videos');
console.log('-'.repeat(40));

const results: Array<{name: string, count: number, patterns: string[]}> = [];

for (const composer of additionalComposers) {
  const count = allVideos.filter(v => {
    const title = (v.title || '').toLowerCase();
    return composer.patterns.some(p => title.includes(p.toLowerCase()));
  });

  results.push({ name: composer.name, count: count.length, patterns: composer.patterns });
}

// Sort by count descending
results.sort((a, b) => b.count - a.count);

for (const r of results) {
  console.log(`${r.name.padEnd(25)} ${r.count}`);
}

console.log('\n📋 Directors with 50+ videos are good candidates for stations');

db.close();
