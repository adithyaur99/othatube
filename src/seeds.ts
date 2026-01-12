/**
 * Seed channels for Tamil MTV Catalog
 *
 * This list contains Tamil music channel names/handles to seed the catalog.
 * These are treated as search strings, not YouTube channel IDs.
 *
 * NOTE: TV channels (Sun TV, Kalaignar TV, Jaya TV, etc.) are excluded
 * as they primarily contain soap operas and dramas, not music content.
 *
 * Categories:
 * - Major Labels & Distributors
 * - Production Houses
 * - Composers & Artists
 * - Independent Artists
 * - Compilation Channels
 * - Regional Distributors
 * - Music-focused TV/Streaming
 * - Community/User Channels
 */

export const SEED_CHANNELS: string[] = [
  // Major Labels & Distributors
  'Sony Music South',
  'Think Music India',
  'Saregama Tamil',
  'Lahari Music | Tamil',
  'Tips Tamil',
  'Junglee Music Tamil',
  'Divo Music',
  'Star Music India – Tamil',
  'Universal Music India (Tamil uploads)',
  'MRT Music Tamil',
  'Sun Pictures',       // Production house
  'Rajshri Tamil',
  'Ayngaran',
  'Cloud Nine Movies',
  'Five Star Audio',
  'Pyramid Music',
  'Echo Music Tamil',
  'Modern Digitech',
  'HMV Tamil (legacy Saregama content)',
  'IMM Audio (Ilaiyaraaja catalog)',
  'Music Master Tamil',
  'INRECO Tamil Music',
  'Kosmik Music',
  'Vijay Musicals',
  'Ananda Audio (Tamil catalog)',

  // Production Houses
  'AGS Entertainment',
  'Sathya Jyothi Films',
  'Studio Green',
  'V Creations',
  'Wunderbar Films',
  '2D Entertainment',
  'Thenandal Films',
  'Rockfort Entertainment',
  'Escape Artists Motion Pictures',

  // Composers & Artists (Official Channels)
  'A.R. Rahman Official',
  'Ilaiyaraaja Official',
  'Harris Jayaraj Official',
  'Yuvan Shankar Raja Official',
  'Santhosh Narayanan Official',
  'Anirudh Official',
  'D. Imman Official',
  'G.V. Prakash Kumar',
  'Sam C.S Official',
  'Ghibran Official',

  // Independent Artists & Labels
  'Think Indie',
  'Madras Gig',
  'Noise and Grains',
  'Kaber Vasuki',
  'Paal Dabba',
  'OfRo',
  'Santhosh Dhayanidhi',
  'Asal Kolaar',
  'DJ Black Official',
  'Independent Tamil Artist Collective',

  // Compilation Channels
  'Tamil Movie Songs',
  'Tamil Video Songs HD',
  'Tamil Hits Official',
  'Tamil Superhits',
  'Tamil Old Songs',
  'Tamil Melody Songs',
  'Tamil Kuthu Songs',
  'Tamil Retro Classics',
  'Tamil Evergreen Hits',
  'Tamil Music Lovers',

  // Regional Distributors
  'Alpha Digitech',
  'Sri Balaji Music',
  'SVM Music',
  'Times Music Tamil',
  'New Music India Tamil',
  'Aditya Music Tamil',
  'TrendMusic Tamil',
  'Track Musics',
  'Muzik247 Tamil',
  'Symphony Recording Co',

  // Music-focused TV/Streaming (NOT general TV channels)
  'Isaiaruvi',          // Music-only channel ("Music Stream" in Tamil)

  // Community/User Channels
  'Tamil Film Songs',
  'Tamil Cinema Songs',
  'Tamil Movie Songs Official',
  'Tamil Songs HD',
  'Tamil Video Jukebox',
  'Tamil Songs Collection',
  'Tamil Album Songs',
  'Tamil Songs Factory',
  'Tamil Music Zone',
  'Tamil Songs World'
];

/**
 * TV channels explicitly excluded (contain mostly non-music content):
 * - Sun TV (soap operas, dramas)
 * - Kalaignar TV (entertainment, news)
 * - Jaya TV (serials, shows)
 * - Vendhar TV (entertainment)
 * - Makkal TV (entertainment)
 * - Captain TV (entertainment)
 * - Shakthi TV (Sri Lankan Tamil TV)
 * - Mega TV (entertainment)
 * - DD Podhigai (government channel)
 * - Polimer TV (entertainment)
 * - Raj TV (entertainment)
 */

/**
 * Keywords that suggest a channel is official/verified
 * Used for confidence scoring during channel resolution
 */
export const OFFICIAL_KEYWORDS = [
  'official',
  'music',
  'records',
  'productions',
  'entertainment',
  'films',
  'audio',
  'label'
];

/**
 * Tamil-specific keywords for matching
 */
export const TAMIL_KEYWORDS = [
  'tamil',
  'kollywood',
  'chennai',
  'south',
  'இசை', // "isai" = music in Tamil
  'பாடல்', // "paadal" = song in Tamil
];

/**
 * Keywords that indicate non-music content
 */
export const NON_MUSIC_KEYWORDS = [
  'trailer',
  'teaser',
  'interview',
  'promo',
  'making',
  'behind the scenes',
  'bts',
  'speech',
  'press meet',
  'audio launch',
  'review',
  'serial',
  'episode',
  'promo'
];

/**
 * Get seeds grouped by category
 */
export function getSeedsByCategory(): Record<string, string[]> {
  return {
    'Major Labels & Distributors': SEED_CHANNELS.slice(0, 28),
    'Production Houses': SEED_CHANNELS.slice(28, 38),
    'Composers & Artists': SEED_CHANNELS.slice(38, 48),
    'Independent Artists': SEED_CHANNELS.slice(48, 58),
    'Compilation Channels': SEED_CHANNELS.slice(58, 68),
    'Regional Distributors': SEED_CHANNELS.slice(68, 78),
    'Music TV/Streaming': SEED_CHANNELS.slice(78, 79),
    'Community Channels': SEED_CHANNELS.slice(79)
  };
}

export default SEED_CHANNELS;
