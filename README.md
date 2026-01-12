# Tamil MTV Catalog 🎵

A YouTube-first catalog builder for Tamil music videos. This tool:

- Seeds from a whitelist of ~100 Tamil music channel names
- Resolves each seed to a canonical YouTube channel ID
- Crawls channel uploads to discover videos
- Fetches video metadata (duration, views, tags, etc.)
- Exports clean CSV + JSONL datasets ready for a web app

## Features

- **Idempotent runs**: Can be interrupted and resumed safely
- **Quota-aware**: Tracks YouTube API quota usage, caches responses
- **Smart matching**: Uses heuristics to find best channel matches
- **Content filtering**: Automatically flags Shorts and non-music content
- **Local persistence**: SQLite database runs anywhere

## Quick Start

### 1. Install dependencies

```bash
npm install
# or
yarn
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env and add your YouTube API key
```

Get a YouTube Data API v3 key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### 3. Run the pipeline

```bash
# Run everything at once
yarn dev run-all

# Or run steps individually:
yarn dev resolve-channels    # Resolve seed names → channel IDs
yarn dev fetch-uploads       # Get uploads playlist IDs
yarn dev crawl-uploads       # Discover all videos
yarn dev fetch-video-details # Fetch video metadata
yarn dev export              # Export to CSV/JSONL
```

### 4. Check progress

```bash
yarn dev stats
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `resolve-channels` | Resolve seed channel names to YouTube channel IDs |
| `fetch-uploads` | Fetch uploads playlist IDs for resolved channels |
| `crawl-uploads` | Crawl uploads playlists to discover videos |
| `fetch-video-details` | Fetch detailed metadata for videos |
| `fetch-video-details -n 1000` | Fetch metadata for max 1000 videos |
| `export` | Export dataset to CSV and JSONL files |
| `run-all` | Run all pipelines in order |
| `stats` | Show database statistics and quota usage |
| `init-seeds` | Initialize seeds without API calls |
| `reset --confirm` | Reset all progress (keeps seeds) |

## Output Files

After running the pipeline, you'll find:

```
data/
├── videos.jsonl       # All videos, one JSON per line
├── videos.csv         # All videos in CSV format
├── music-videos.jsonl # Music-only (filtered, embeddable)
└── channels.csv       # Channel resolution data
```

### Videos CSV Columns

| Column | Description |
|--------|-------------|
| `youtube_id` | Video ID |
| `title` | Video title |
| `channel_id` | Channel ID |
| `channel_title` | Channel name |
| `published_at` | Publication date |
| `duration_seconds` | Duration in seconds |
| `is_embeddable` | Can be embedded (1/0) |
| `view_count` | View count |
| `like_count` | Like count |
| `is_short` | Is a YouTube Short (1/0) |
| `is_music_candidate` | Likely music content (1/0) |
| `non_music_reason` | Why flagged as non-music |
| `seed_source` | Which seed channel this came from |

### Channels CSV Columns

| Column | Description |
|--------|-------------|
| `seed` | Original seed name |
| `resolved_channel_id` | YouTube channel ID |
| `resolved_title` | Channel title |
| `handle` | Channel handle (@xxx) |
| `uploads_playlist_id` | Playlist ID for uploads |
| `confidence_score` | Match confidence (0-1) |
| `resolution_method` | How resolved (handle/search/manual) |
| `subscriber_count` | Subscriber count |

## YouTube API Quota

The YouTube Data API has a daily quota of 10,000 units. Approximate costs:

| Endpoint | Cost |
|----------|------|
| `search.list` | 100 units |
| `channels.list` | 1 unit |
| `playlistItems.list` | 1 unit |
| `videos.list` | 1 unit |

**Tips to minimize quota usage:**

1. Run `resolve-channels` first - this uses the most quota (search.list)
2. All responses are cached in SQLite - re-runs skip API calls
3. Use `--max` flag with `fetch-video-details` to limit per session
4. Check quota with `yarn dev stats`

## Manual Overrides

If automatic channel resolution fails or picks the wrong channel:

1. Edit `overrides.json`:

```json
{
  "A.R. Rahman Official": "UC-JNVauUoKc8lVn0TQhDYqA",
  "Sony Music South": {
    "channel_id": "UCn8BmxzloLwYcXL3r8gM8uA",
    "notes": "Official Sony Music South VEVOchannel"
  }
}
```

2. Re-run `resolve-channels` - overrides take precedence

## Content Filtering

### Shorts Detection
Videos are flagged as Shorts if:
- Duration < 60 seconds
- Title contains "#shorts"

### Non-Music Detection
Videos are flagged as non-music (but not deleted) if title contains:
- trailer, teaser, interview, promo, making, behind the scenes, bts

These remain in the dataset with `is_music_candidate=0` so you can filter as needed.

## Database Schema

The SQLite database (`data/tamil-mtv.db`) contains:

- `seed_channels` - Seed to channel resolution mapping
- `channels` - Full channel metadata
- `videos` - All discovered videos with metadata
- `playlist_crawl_progress` - Resume state for playlist crawling
- `api_calls` - API call log for caching and quota tracking
- `channel_overrides` - Manual override mappings

See `migrations/schema.sql` for full schema.

## Project Structure

```
tamil-mtv-catalog/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── db.ts               # SQLite database module
│   ├── youtube.ts          # YouTube API wrapper
│   ├── seeds.ts            # Seed channels list
│   └── pipelines/
│       ├── resolveChannels.ts
│       ├── fetchUploadsPlaylists.ts
│       ├── crawlUploads.ts
│       ├── fetchVideoDetails.ts
│       └── exportDataset.ts
├── data/                   # Generated output files
├── migrations/
│   └── schema.sql          # Database schema
├── overrides.json          # Manual channel overrides
├── .env.example            # Environment template
└── package.json
```

## Seed Channels

The catalog seeds from 100 Tamil music-related channels including:

- **Major Labels**: Sony Music South, Think Music, Saregama Tamil, Lahari Music
- **Production Houses**: Lyca Productions, AGS Entertainment, Sun Pictures
- **Composers**: A.R. Rahman, Ilaiyaraaja, Anirudh, Harris Jayaraj
- **TV Networks**: Sun TV, Jaya TV, Kalaignar TV
- **Independent**: Think Indie, Madras Gig, indie artists

See `src/seeds.ts` for the full list. Add/remove seeds there to customize.

## Development

```bash
# Type check
yarn typecheck

# Build to dist/
yarn build

# Run from dist/
yarn start <command>
```

## License

MIT

## Notes

- This tool is for personal/research use only
- Respect YouTube's Terms of Service
- API quota resets daily at midnight Pacific Time
- Large channels may take multiple runs to fully crawl
