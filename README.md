# ஒ Tube (Otha Tube) 🎵

Non-stop Tamil music streaming. 31,000+ videos from 30 music directors.

**Live:** https://adithyaur99.github.io/othatube/

## Features

- 🎵 **30 Music Director Channels** - Ilaiyaraaja, A.R. Rahman, Anirudh, Yuvan & more
- 🔀 **Shuffle All** - Random mix of 31,000+ Tamil songs
- ▶️ **Click-to-Jump Queue** - Click any song in "Up Next" to play it
- 📱 **Responsive Design** - Works on desktop and mobile
- 🎶 **Non-Stop** - Endless shuffle, auto-advances

## Music Directors

| Director | Videos | Director | Videos |
|----------|--------|----------|--------|
| 👑 Ilaiyaraaja | 2,616 | 🎸 Deva | 1,393 |
| 🏆 A.R. Rahman | 852 | 🎧 Yuvan Shankar Raja | 718 |
| 🎹 G.V. Prakash | 496 | 🔥 Anirudh | 475 |
| 🥁 Santhosh Narayanan | 421 | 🎺 D. Imman | 410 |
| 🎻 Vidyasagar | 348 | 🎼 Harris Jayaraj | 279 |
| ⚡ S. Thaman | 277 | 🌟 Ghibran | 227 |
| 🎤 Hiphop Tamizha | 213 | 🎭 Sam C.S. | 202 |
| 🎵 Sean Roldan | 187 | 🪷 M.S. Viswanathan | 183 |
| + 13 more directors... | | 🎲 **Shuffle All** | **31,464** |

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Player**: YouTube IFrame API
- **Hosting**: GitHub Pages (100% static)

## Development

```bash
cd web
npm install
npm run dev
```

## How It Works

1. Video catalog is pre-built from YouTube using the Data API
2. Videos are filtered by duration (100s-480s) to skip shorts/compilations
3. Non-music content (comedy, trailers, interviews) is excluded
4. Static JSON files are served - no backend needed

## License

MIT
