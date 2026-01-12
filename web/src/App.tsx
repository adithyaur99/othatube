/**
 * Tamil MTV - Retro Music Video Player
 *
 * A wantmymtv.xyz-inspired Tamil music video player
 * 100% static, deployable to GitHub Pages
 */

import { useEffect, useState, useMemo } from 'react';
import { StationSelector, Player, NowPlaying, Controls, Queue } from './components';
import { useAppStore } from './store/useStore';
import './index.css';

function App() {
  const [showChannels, setShowChannels] = useState(false);

  const {
    stations,
    currentStation,
    isLoadingStation,
    videos,
    queue,
    currentVideo,
    history,
    isPlaying,
    volume,
    loadStations,
    selectStation,
    playNext,
    playPrevious,
    jumpToVideo,
    markBadVideo,
    shuffleQueue,
    setIsPlaying,
    setVolume,
  } = useAppStore();

  // Load stations on mount
  useEffect(() => {
    loadStations();
  }, [loadStations]);

  // Calculate video counts per station (organized by music director)
  const videoCounts = useMemo(() => {
    const countMap: Record<string, number> = {
      'ilaiyaraaja': 2616,
      'deva': 1393,
      'arr': 852,
      'yuvan': 718,
      'gv-prakash': 496,
      'anirudh': 475,
      'santhosh-narayanan': 421,
      'imman': 410,
      'vidyasagar': 348,
      'harris': 279,
      'thaman': 277,
      'ghibran': 227,
      'hiphop-tamizha': 213,
      'sam-cs': 202,
      'sean-roldan': 187,
      'msv': 183,
      'sirpy': 156,
      'dharan': 149,
      'gangai-amaran': 136,
      'srikanth-deva': 134,
      'vijay-antony': 127,
      'bharathwaj': 125,
      'nivas-prasanna': 118,
      'sa-rajkumar': 116,
      'justin-prabhakaran': 89,
      'mani-sharma': 76,
      'karthik-raja': 58,
      'c-sathya': 52,
      'leon-james': 52,
      'shuffle-all': 31464,
    };
    const counts: Record<string, number> = {};
    stations.forEach((s) => {
      counts[s.slug] = countMap[s.slug] || 0;
    });
    return counts;
  }, [stations]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSkipBad = () => {
    if (currentVideo) {
      markBadVideo(currentVideo.youtube_id);
    }
  };

  // Landing page if no station selected
  if (!currentStation) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 text-center">
          <h1 className="mtv-title mb-2">🎵 O TUBE</h1>
          <p className="text-gray-500 text-lg">
            Ad-Free Tamil Music • Non-Stop
          </p>
        </header>

        {/* Station Selection */}
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 pb-8">
          <StationSelector
            stations={stations}
            currentStation={currentStation}
            onSelect={selectStation}
            isLoading={isLoadingStation}
            videoCounts={videoCounts}
          />
        </main>

        {/* Footer */}
        <footer className="p-4 text-center text-sm text-gray-700">
          <p>Powered by YouTube • Ad-Free Tamil Music</p>
        </footer>
      </div>
    );
  }

  // Player view
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Player */}
      <div className="flex-1 flex flex-col p-4 lg:p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowChannels(!showChannels)}
            className="flex items-center gap-2 hover:opacity-80"
          >
            <span className="mtv-title text-2xl">🎵 O TUBE</span>
          </button>

          <div className="flex items-center gap-4">
            {currentStation && (
              <span className="text-gray-500">
                {currentStation.icon} {currentStation.name}
              </span>
            )}
            <button
              onClick={() => setShowChannels(!showChannels)}
              className="control-btn lg:hidden"
            >
              📺 CHANNELS
            </button>
          </div>
        </header>

        {/* Video Player */}
        <div className="mb-4">
          <Player
            currentVideo={currentVideo}
            onVideoEnd={playNext}
            onVideoError={(videoId) => markBadVideo(videoId)}
            onPlayStateChange={setIsPlaying}
            volume={volume}
          />
        </div>

        {/* Now Playing */}
        <div className="mb-4">
          <NowPlaying
            video={currentVideo}
            station={currentStation}
            isPlaying={isPlaying}
            queuePosition={videos.length - queue.length}
            queueTotal={videos.length}
          />
        </div>

        {/* Controls */}
        <Controls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onPrevious={playPrevious}
          onNext={playNext}
          onSkipBad={handleSkipBad}
          onShuffle={shuffleQueue}
          volume={volume}
          onVolumeChange={setVolume}
          hasHistory={history.length > 0}
          hasQueue={queue.length > 0}
        />
      </div>

      {/* Right Panel - Channels & Queue */}
      <div
        className={`
          lg:w-96 lg:flex lg:flex-col lg:border-l lg:border-gray-800
          fixed lg:relative inset-0 lg:inset-auto z-50 lg:z-auto
          bg-black/95 lg:bg-transparent
          transform transition-transform duration-300
          ${showChannels ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Mobile close button */}
        <div className="lg:hidden p-4 flex justify-end">
          <button
            onClick={() => setShowChannels(false)}
            className="control-btn"
          >
            ✕ CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Channel Selector */}
          <StationSelector
            stations={stations}
            currentStation={currentStation}
            onSelect={(station) => {
              selectStation(station);
              setShowChannels(false);
            }}
            isLoading={isLoadingStation}
            videoCounts={videoCounts}
          />

          {/* Queue */}
          <Queue queue={queue} history={history} onJumpToVideo={jumpToVideo} />
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {showChannels && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setShowChannels(false)}
        />
      )}
    </div>
  );
}

export default App;
