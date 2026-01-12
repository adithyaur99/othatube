/**
 * Fetch video titles using YouTube oEmbed API (no API key required)
 *
 * This script uses the free oEmbed endpoint to fetch video titles,
 * then categorizes videos by actual release year based on title parsing.
 *
 * oEmbed advantages:
 * - No API key required
 * - No daily quota limits (just rate limiting)
 * - Returns video title and author name
 *
 * Limitation: No duration data (need YouTube Data API for that)
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
const BATCH_SIZE = 50;  // Videos per batch
const DELAY_MS = 100;   // Delay between fetches to avoid rate limiting
const CONCURRENT_FETCHES = 5;  // Parallel fetches per batch

// Decade bins
const DECADES = ['1980s', '1990s', '2000s', '2010s', '2020s'] as const;
type Decade = typeof DECADES[number];

// Known Tamil movies and their release years (expanded list)
const KNOWN_MOVIES: Record<string, number> = {
  // 1980s
  'mouna ragam': 1986,
  'nayakan': 1987,
  'nayagan': 1987,
  'agni natchathiram': 1988,
  'apoorva sagodharargal': 1989,
  'thalapathi': 1991, // Actually 1991

  // 1990s
  'roja': 1992,
  'gentleman': 1993,
  'kadhalan': 1994,
  'bombay': 1995,
  'indian': 1996,
  'minsara kanavu': 1997,
  'jeans': 1998,
  'padayappa': 1999,
  'mudhalvan': 1999,
  'vaali': 1999,
  'sangamam': 1999,
  'alaipayuthey': 2000, // Actually 2000

  // 2000s
  'kandukondain kandukondain': 2000,
  'rhythm': 2000,
  'dil se': 1998, // Hindi but popular
  'thenali': 2000,
  'friends': 2001,
  'dumm dumm dumm': 2001,
  'minnale': 2001,
  'kaakha kaakha': 2003,
  'kannathil muthamittal': 2002,
  'aayitha ezhuthu': 2004,
  'anniyan': 2005,
  'ghajini': 2005,
  'sivakasi': 2005,
  'chandramukhi': 2005,
  'thimiru': 2006,
  'vettaiyaadu vilaiyaadu': 2006,
  'pokkiri': 2007,
  'sivaji': 2007,
  'billa': 2007,
  'paruthiveeran': 2007,
  'thavamai thavamirundhu': 2005,
  'guru': 2007,
  'dasavathaaram': 2008,
  'kuruvi': 2008,
  'saroja': 2008,
  'vaaranam aayiram': 2008,
  'ayan': 2009,
  'unnaipol oruvan': 2009,
  'aadhavan': 2009,

  // 2010s
  'enthiran': 2010,
  'vinnaithaandi varuvaayaa': 2010,
  'vinnaithandi varuvaya': 2010,
  'singam': 2010,
  'ko': 2011,
  'mankatha': 2011,
  '7am arivu': 2011,
  '7aum arivu': 2011,
  'engeyum kaadhal': 2011,
  'muppozhudhum un karpanaigal': 2012,
  '3': 2012,
  'thuppakki': 2012,
  'naan ee': 2012,
  'yeto vellipoyindhi manasu': 2012,
  'vishwaroopam': 2013,
  'thalaivaa': 2013,
  'ethir neechal': 2013,
  'maryan': 2013,
  'kadal': 2013,
  'veeram': 2014,
  'jilla': 2014,
  'kaththi': 2014,
  'velaiilla pattadhari': 2014,
  'velai illa pattadhari': 2014,
  'vip': 2014,
  'kochadaiiyaan': 2014,
  'lingaa': 2014,
  'i': 2015,
  'yennai arindhaal': 2015,
  'vedalam': 2015,
  'thani oruvan': 2015,
  'naanum rowdy dhaan': 2015,
  'remo': 2016,
  'kabali': 2016,
  'theri': 2016,
  '24': 2016,
  'kodi': 2016,
  'devi': 2016,
  'vikram vedha': 2017,
  'mersal': 2017,
  'vivegam': 2017,
  'bairavaa': 2017,
  'velaikkaran': 2017,
  'theeran adhigaaram ondru': 2017,
  'iraivi': 2016,
  '2.0': 2018,
  'sarkar': 2018,
  'vada chennai': 2018,
  '96': 2018,
  'maari 2': 2018,
  'chekka chivantha vaanam': 2018,
  'petta': 2019,
  'viswasam': 2019,
  'super deluxe': 2019,
  'bigil': 2019,
  'kaithi': 2019,
  'asuran': 2019,
  'nerkonda paarvai': 2019,
  'darbar': 2020,

  // 2020s
  'master': 2021,
  'jai bhim': 2021,
  'soorarai pottru': 2020,
  'sarpatta parambarai': 2021,
  'karnan': 2021,
  'jagame thandhiram': 2021,
  'maanaadu': 2021,
  'doctor': 2021,
  'vikram': 2022,
  'beast': 2022,
  'thiruchitrambalam': 2022,
  'ponniyin selvan': 2022,
  'ps1': 2022,
  'ps 1': 2022,
  'ps-1': 2022,
  'varisu': 2023,
  'thunivu': 2023,
  'jailer': 2023,
  'leo': 2023,
  'jawan': 2023,
  'viduthalai': 2023,
  'captain miller': 2024,
  'lal salaam': 2024,
  'goat': 2024,
  'vettaiyan': 2024,
  'kanguva': 2024,
};

// Composer patterns for decade estimation
const COMPOSER_HINTS: Array<{ pattern: RegExp; estimatedDecade: Decade; confidence: number }> = [
  // Ilaiyaraaja - primarily 1980s-1990s
  { pattern: /ilaiyaraaja|ilayaraja|isaignani|maestro/i, estimatedDecade: '1990s', confidence: 0.6 },

  // A.R. Rahman - primarily 1990s-2010s
  { pattern: /a\.?\s*r\.?\s*rahman|ar\s*rahman|rahman/i, estimatedDecade: '2000s', confidence: 0.5 },

  // Harris Jayaraj - 2000s-2010s
  { pattern: /harris\s*jayaraj|harris\s*jeyaraj/i, estimatedDecade: '2000s', confidence: 0.7 },

  // Yuvan Shankar Raja - 2000s-2010s
  { pattern: /yuvan|u1/i, estimatedDecade: '2010s', confidence: 0.5 },

  // Anirudh - 2010s-2020s
  { pattern: /anirudh|anirud/i, estimatedDecade: '2010s', confidence: 0.8 },

  // Santhosh Narayanan - 2010s-2020s
  { pattern: /santhosh\s*narayanan|santosh\s*narayanan/i, estimatedDecade: '2010s', confidence: 0.85 },

  // D. Imman - 2010s-2020s
  { pattern: /d\.?\s*imman|imman/i, estimatedDecade: '2010s', confidence: 0.7 },

  // G.V. Prakash - 2010s-2020s
  { pattern: /g\.?\s*v\.?\s*prakash|gv\s*prakash/i, estimatedDecade: '2010s', confidence: 0.75 },

  // Hip hop Tamizha - 2010s-2020s
  { pattern: /hip\s*hop\s*tamizha|hiphop\s*tamizha|aadhi/i, estimatedDecade: '2010s', confidence: 0.9 },

  // Sean Roldan - 2010s-2020s
  { pattern: /sean\s*roldan/i, estimatedDecade: '2010s', confidence: 0.85 },

  // Sam C.S. - 2010s-2020s
  { pattern: /sam\s*c\.?\s*s/i, estimatedDecade: '2010s', confidence: 0.9 },
];

// Year pattern in title
const YEAR_PATTERNS = [
  /\b(19[789]\d|20[012]\d)\b/,  // Direct year mention (1970-2029)
  /[\[\(](\d{4})[\]\)]/,        // Year in brackets
];

interface VideoRecord {
  youtube_id: string;
  title: string | null;
  published_at: string | null;
  channel_id: string;
}

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
}

/**
 * Fetch title from oEmbed API
 */
async function fetchOEmbedTitle(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data: OEmbedResponse = await response.json();
    return {
      title: data.title || '',
      author: data.author_name || '',
    };
  } catch {
    return null;
  }
}

/**
 * Parse year from video title
 */
function parseYearFromTitle(title: string): number | null {
  const titleLower = title.toLowerCase();

  // Check known movies first
  for (const [movieName, year] of Object.entries(KNOWN_MOVIES)) {
    if (titleLower.includes(movieName)) {
      return year;
    }
  }

  // Check for year patterns in title
  for (const pattern of YEAR_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1970 && year <= 2025) {
        return year;
      }
    }
  }

  return null;
}

/**
 * Estimate decade from title and channel context
 */
function estimateDecade(title: string, publishedAt: string | null): Decade {
  const titleLower = title.toLowerCase();

  // First try to parse actual year from title
  const parsedYear = parseYearFromTitle(title);
  if (parsedYear) {
    if (parsedYear < 1990) return '1980s';
    if (parsedYear < 2000) return '1990s';
    if (parsedYear < 2010) return '2000s';
    if (parsedYear < 2020) return '2010s';
    return '2020s';
  }

  // Check composer hints
  for (const hint of COMPOSER_HINTS) {
    if (hint.pattern.test(titleLower)) {
      return hint.estimatedDecade;
    }
  }

  // Keywords suggesting older content
  if (/\b(classic|old|golden|evergreen|melody|melodies|retro)\b/i.test(title)) {
    // Check if it mentions specific decades
    if (/\b(80s|80'?s|eighties)\b/i.test(title)) return '1980s';
    if (/\b(90s|90'?s|nineties)\b/i.test(title)) return '1990s';
    if (/\b(2000s|2000'?s)\b/i.test(title)) return '2000s';
    return '1990s'; // Default for "classic" content
  }

  // Keywords suggesting modern content
  if (/\b(trending|viral|latest|new|recent)\b/i.test(title)) {
    return '2020s';
  }

  // Fall back to upload date if available
  if (publishedAt) {
    const uploadYear = new Date(publishedAt).getFullYear();
    // Assume songs are usually uploaded 0-5 years after release
    // For recent uploads, likely recent songs
    if (uploadYear >= 2023) return '2020s';
    if (uploadYear >= 2018) return '2010s';
    // Older uploads could be re-uploads of classics
    if (uploadYear >= 2010) return '2010s';
    if (uploadYear >= 2005) return '2000s';
  }

  // Default to 2010s (largest category)
  return '2010s';
}

/**
 * Check if a title matches Ilaiyaraaja content
 */
function isIlaiyaraajaContent(title: string): boolean {
  return /ilaiyaraaja|ilayaraja|isaignani|இளையராஜா/i.test(title);
}

/**
 * Check if a title matches A.R. Rahman content
 */
function isRahmanContent(title: string): boolean {
  return /a\.?\s*r\.?\s*rahman|ar\s*rahman|rahman|ஏ\.\s*ஆர்\.\s*ரஹ்மான்/i.test(title);
}

/**
 * Batch fetch titles with concurrency control
 */
async function fetchTitlesBatch(
  videoIds: string[],
  concurrent: number,
  delayMs: number
): Promise<Map<string, { title: string; author: string }>> {
  const results = new Map<string, { title: string; author: string }>();

  for (let i = 0; i < videoIds.length; i += concurrent) {
    const batch = videoIds.slice(i, i + concurrent);
    const promises = batch.map(async (id) => {
      const result = await fetchOEmbedTitle(id);
      if (result) {
        results.set(id, result);
      }
      return result;
    });

    await Promise.all(promises);

    // Delay between batches to avoid rate limiting
    if (i + concurrent < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

async function main() {
  console.log('🎬 Tamil MTV Title Fetcher (oEmbed)\n');

  // Open database
  const db = new Database(DB_PATH);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get all videos
  const videos = db.prepare(`
    SELECT youtube_id, title, published_at, channel_id
    FROM videos
    WHERE is_music_candidate = 1
    ORDER BY published_at DESC
  `).all() as VideoRecord[];

  console.log(`📊 Found ${videos.length} videos to process\n`);

  // Videos needing title fetch (no title yet)
  const needsTitleFetch = videos.filter(v => !v.title);
  console.log(`📡 ${needsTitleFetch.length} videos need title fetch\n`);

  // Fetch titles in batches
  let fetchedCount = 0;
  let failedCount = 0;
  const updateStmt = db.prepare(`
    UPDATE videos SET title = ?, metadata_status = 'fetched', fetched_at = datetime('now')
    WHERE youtube_id = ?
  `);

  // Process in larger batches for progress reporting
  const REPORT_BATCH = 500;

  for (let i = 0; i < needsTitleFetch.length; i += REPORT_BATCH) {
    const batchEnd = Math.min(i + REPORT_BATCH, needsTitleFetch.length);
    const batch = needsTitleFetch.slice(i, batchEnd);
    const videoIds = batch.map(v => v.youtube_id);

    console.log(`⏳ Fetching titles ${i + 1} - ${batchEnd} of ${needsTitleFetch.length}...`);

    const results = await fetchTitlesBatch(videoIds, CONCURRENT_FETCHES, DELAY_MS);

    // Update database with fetched titles
    db.transaction(() => {
      for (const [videoId, data] of results) {
        updateStmt.run(data.title, videoId);
      }
    })();

    fetchedCount += results.size;
    failedCount += batch.length - results.size;

    const percent = ((batchEnd / needsTitleFetch.length) * 100).toFixed(1);
    console.log(`   ✅ ${results.size} fetched, ${batch.length - results.size} failed (${percent}% complete)`);
  }

  console.log(`\n📊 Title fetch complete: ${fetchedCount} fetched, ${failedCount} failed\n`);

  // Reload videos with updated titles
  const updatedVideos = db.prepare(`
    SELECT youtube_id, title, published_at, channel_id
    FROM videos
    WHERE is_music_candidate = 1 AND title IS NOT NULL AND title != ''
  `).all() as VideoRecord[];

  console.log(`📊 ${updatedVideos.length} videos with titles ready for categorization\n`);

  // Categorize videos
  const byDecade: Record<Decade, VideoRecord[]> = {
    '1980s': [],
    '1990s': [],
    '2000s': [],
    '2010s': [],
    '2020s': [],
  };

  const ilaiyaraajaVideos: VideoRecord[] = [];
  const rahmanVideos: VideoRecord[] = [];

  for (const video of updatedVideos) {
    const title = video.title || '';

    // Categorize by decade
    const decade = estimateDecade(title, video.published_at);
    byDecade[decade].push(video);

    // Check composer collections
    if (isIlaiyaraajaContent(title)) {
      ilaiyaraajaVideos.push(video);
    }
    if (isRahmanContent(title)) {
      rahmanVideos.push(video);
    }
  }

  // Print stats
  console.log('📊 Categorization Results:');
  for (const decade of DECADES) {
    console.log(`   ${decade}: ${byDecade[decade].length} videos`);
  }
  console.log(`   Ilaiyaraaja TV: ${ilaiyaraajaVideos.length} videos`);
  console.log(`   A.R. Rahman TV: ${rahmanVideos.length} videos`);
  console.log(`   Total: ${updatedVideos.length} videos\n`);

  // Export JSON files
  console.log('📁 Exporting JSON files...\n');

  // Helper to format video for export
  const formatForExport = (v: VideoRecord) => ({
    youtube_id: v.youtube_id,
    title: v.title,
  });

  // Shuffle function for randomized playback
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
    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(videos)
    );
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

  // Export all videos (shuffled)
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'videos.all.json'),
    JSON.stringify(shuffle(updatedVideos).map(formatForExport))
  );
  console.log(`   ✅ videos.all.json (${updatedVideos.length} videos)`);

  // Export stations config
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

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'stations.json'),
    JSON.stringify(stations, null, 2)
  );
  console.log(`   ✅ stations.json`);

  // Create summary object for updating App.tsx
  const summary = {
    '1980s': byDecade['1980s'].length,
    '1990s': byDecade['1990s'].length,
    '2000s': byDecade['2000s'].length,
    '2010s': byDecade['2010s'].length,
    '2020s': byDecade['2020s'].length,
    'all': updatedVideos.length,
    'ilaiyaraaja': ilaiyaraajaVideos.length,
    'arr': rahmanVideos.length,
  };

  console.log('\n🎬 Export complete!');
  console.log('\n📋 Video counts for App.tsx:');
  console.log(JSON.stringify(summary, null, 2));

  db.close();
}

main().catch(console.error);
