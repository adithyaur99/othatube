/**
 * Playback Controls Component - Retro MTV Style
 *
 * Transport controls with retro button styling
 */

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSkipBad: () => void;
  onShuffle: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  hasHistory: boolean;
  hasQueue: boolean;
}

export function Controls({
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
  onSkipBad,
  onShuffle,
  volume,
  onVolumeChange,
  hasHistory,
  hasQueue,
}: ControlsProps) {
  return (
    <div className="retro-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          {/* Previous */}
          <button
            onClick={onPrevious}
            disabled={!hasHistory}
            className={`control-btn ${!hasHistory ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Previous"
          >
            ⏮ PREV
          </button>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="control-btn primary"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            disabled={!hasQueue}
            className={`control-btn ${!hasQueue ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Next"
          >
            NEXT ⏭
          </button>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center gap-2">
          {/* Shuffle */}
          <button
            onClick={onShuffle}
            className="control-btn"
            title="Shuffle Queue"
          >
            🔀 SHUFFLE
          </button>

          {/* Skip Bad */}
          <button
            onClick={onSkipBad}
            className="control-btn"
            title="Skip & Never Play Again"
          >
            ⛔ SKIP
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 80 : 0)}
            className="text-xl"
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="volume-slider"
          />
          <span className="text-sm text-gray-500 w-8">{volume}%</span>
        </div>
      </div>
    </div>
  );
}

export default Controls;
