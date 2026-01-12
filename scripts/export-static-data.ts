#!/usr/bin/env tsx
/**
 * Export SQLite data to static JSON files for GitHub Pages deployment
 *
 * Creates:
 * - stations.json - list of available stations
 * - videos.1990s.json - videos from 1990-1999
 * - videos.2000s.json - videos from 2000-2009
 * - videos.2010s.json - videos from 2010-2019
 * - videos.2020s.json - videos from 2020+
 * - videos.arr.json - A.R. Rahman songs
 * - videos.ilaiyaraaja.json - Ilaiyaraaja songs
 */

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'tamil-mtv.db');
const OUTPUT_DIR = join(__dirname, '..', 'web', 'public', 'data');

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

interface Station {
  slug: string;
  name: string;
  description: string;
  dataFile: string;
  icon: string;
  filterFn?: string; // client-side filter hint
}

// Stations configuration
const STATIONS: Station[] = [
  {
    slug: 'tamil-90s',
    name: 'Tamil 90s',
    description: 'Classic hits from the golden era of Tamil cinema',
    dataFile: 'videos.1990s.json',
    icon: '📻'
  },
  {
    slug: 'tamil-2000s',
    name: 'Tamil 2000s',
    description: 'The millennium hits that defined a generation',
    dataFile: 'videos.2000s.json',
    icon: '📀'
  },
  {
    slug: 'tamil-2010s',
    name: 'Tamil 2010s',
    description: 'Modern classics from the streaming era',
    dataFile: 'videos.2010s.json',
    icon: '🎵'
  },
  {
    slug: 'tamil-2020s',
    name: 'Tamil 2020s',
    description: 'Fresh hits from today\'s Tamil music scene',
    dataFile: 'videos.2020s.json',
    icon: '🔥'
  },
  {
    slug: 'shuffle-all',
    name: 'Shuffle All',
    description: 'Random mix from all decades',
    dataFile: 'videos.all.json',
    icon: '🔀'
  },
  {
    slug: 'arr-tv',
    name: 'A.R. Rahman TV',
    description: 'The Mozart of Madras - Complete collection',
    dataFile: 'videos.arr.json',
    icon: '🎹',
    filterFn: 'arr'
  },
  {
    slug: 'ilaiyaraaja-tv',
    name: 'Ilaiyaraaja TV',
    description: 'The Maestro - Timeless melodies',
    dataFile: 'videos.ilaiyaraaja.json',
    icon: '🎻',
    filterFn: 'ilaiyaraaja'
  }
];

function getDecade(year: number): number {
  return Math.floor(year / 10) * 10;
}

function parseYear(publishedAt: string | null): number {
  if (!publishedAt) return 2020;
  try {
    return new Date(publishedAt).getFullYear();
  } catch {
    return 2020;
  }
}

function main() {
  console.log('📦 Exporting static data for Tamil MTV...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Open database
  if (!existsSync(DB_PATH)) {
    console.error(`❌ Database not found at ${DB_PATH}`);
    console.error('   Run the pipeline first to populate the database.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // Query videos with metadata
  // Note: We're using discovered videos even without full metadata since we have basic info
  const query = `
    SELECT
      v.youtube_id,
      v.title,
      v.channel_id,
      COALESCE(c.title, v.seed_source) as channel_title,
      v.published_at,
      v.duration_seconds as duration_sec,
      COALESCE(v.thumbnail_url, 'https://i.ytimg.com/vi/' || v.youtube_id || '/mqdefault.jpg') as thumb_url,
      COALESCE(v.is_embeddable, 1) as embeddable,
      COALESCE(v.is_music_candidate, 1) as is_music_candidate,
      v.is_short
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.channel_id
    WHERE v.title IS NOT NULL
      OR v.metadata_status = 'pending'
    ORDER BY v.published_at DESC
  `;

  console.log('Querying database...');
  const rows = db.prepare(query).all() as any[];
  console.log(`Found ${rows.length} videos\n`);

  // Transform and filter videos
  const allVideos: VideoRecord[] = rows
    .filter(row => {
      // Skip shorts
      if (row.is_short === 1) return false;
      // Must have youtube_id
      if (!row.youtube_id) return false;
      return true;
    })
    .map(row => {
      const year = parseYear(row.published_at);
      return {
        youtube_id: row.youtube_id,
        title: row.title || `Video ${row.youtube_id}`,
        channel_id: row.channel_id,
        channel_title: row.channel_title || 'Unknown Channel',
        published_at: row.published_at || '',
        year,
        decade: getDecade(year),
        duration_sec: row.duration_sec || 0,
        thumb_url: row.thumb_url || `https://i.ytimg.com/vi/${row.youtube_id}/mqdefault.jpg`,
        embeddable: row.embeddable === 1,
        is_music_candidate: row.is_music_candidate === 1
      };
    });

  console.log(`Processed ${allVideos.length} valid videos\n`);

  // Group by decade
  const byDecade: Record<number, VideoRecord[]> = {};
  for (const video of allVideos) {
    if (!byDecade[video.decade]) {
      byDecade[video.decade] = [];
    }
    byDecade[video.decade].push(video);
  }

  // Export decade shards
  const decades = [1990, 2000, 2010, 2020];
  for (const decade of decades) {
    const videos = byDecade[decade] || [];
    const filename = `videos.${decade}s.json`;
    const filepath = join(OUTPUT_DIR, filename);
    writeFileSync(filepath, JSON.stringify(videos, null, 0));
    console.log(`✓ ${filename}: ${videos.length} videos`);
  }

  // Export all videos
  const allFilepath = join(OUTPUT_DIR, 'videos.all.json');
  writeFileSync(allFilepath, JSON.stringify(allVideos, null, 0));
  console.log(`✓ videos.all.json: ${allVideos.length} videos`);

  // Export A.R. Rahman videos
  const arrVideos = allVideos.filter(v => {
    const searchText = `${v.title} ${v.channel_title}`.toLowerCase();
    return searchText.includes('rahman') ||
           searchText.includes('a.r.') ||
           searchText.includes('ar rahman') ||
           searchText.includes('a r rahman');
  });
  const arrFilepath = join(OUTPUT_DIR, 'videos.arr.json');
  writeFileSync(arrFilepath, JSON.stringify(arrVideos, null, 0));
  console.log(`✓ videos.arr.json: ${arrVideos.length} videos`);

  // Export Ilaiyaraaja videos
  const ilaiyaraajaVideos = allVideos.filter(v => {
    const searchText = `${v.title} ${v.channel_title}`.toLowerCase();
    return searchText.includes('ilaiyaraaja') ||
           searchText.includes('ilayaraja') ||
           searchText.includes('isaignani');
  });
  const ilaiyaraajaFilepath = join(OUTPUT_DIR, 'videos.ilaiyaraaja.json');
  writeFileSync(ilaiyaraajaFilepath, JSON.stringify(ilaiyaraajaVideos, null, 0));
  console.log(`✓ videos.ilaiyaraaja.json: ${ilaiyaraajaVideos.length} videos`);

  // Export stations.json
  const stationsFilepath = join(OUTPUT_DIR, 'stations.json');
  writeFileSync(stationsFilepath, JSON.stringify(STATIONS, null, 2));
  console.log(`✓ stations.json: ${STATIONS.length} stations`);

  // Summary
  console.log('\n📊 Export Summary:');
  console.log(`   Total videos: ${allVideos.length}`);
  for (const decade of decades) {
    console.log(`   ${decade}s: ${(byDecade[decade] || []).length}`);
  }
  console.log(`   A.R. Rahman: ${arrVideos.length}`);
  console.log(`   Ilaiyaraaja: ${ilaiyaraajaVideos.length}`);
  console.log(`\n✅ Static data exported to: ${OUTPUT_DIR}`);

  db.close();
}

main();
