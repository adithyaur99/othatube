/**
 * YouTube Thumbnail Utilities
 *
 * YouTube provides thumbnails at predictable URLs based on video ID.
 * Available sizes:
 * - default.jpg (120x90)
 * - mqdefault.jpg (320x180) - medium quality
 * - hqdefault.jpg (480x360) - high quality
 * - sddefault.jpg (640x480) - standard definition
 * - maxresdefault.jpg (1280x720) - max resolution (not always available)
 */

export function getYouTubeThumbnail(
  videoId: string,
  quality: 'default' | 'mq' | 'hq' | 'sd' | 'maxres' = 'mq'
): string {
  const qualityMap = {
    default: 'default.jpg',
    mq: 'mqdefault.jpg',
    hq: 'hqdefault.jpg',
    sd: 'sddefault.jpg',
    maxres: 'maxresdefault.jpg',
  };

  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}`;
}
