import { useState, useEffect } from 'react';
import { Search, X, Loader2, AlertCircle, Key, Download, CheckCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { VideoCard } from './VideoCard';
import { useYouTube } from '../hooks/useYouTube';
import { useDependencies } from '../contexts/DependencyContext';

interface YouTubeSearchProps {
  hasApiKey?: boolean;
  onSoundAdded?: () => void;
}

export const YouTubeSearch = ({ hasApiKey = true, onSoundAdded }: YouTubeSearchProps) => {
  const [searchInput, setSearchInput] = useState('');
  const [showTroubleshootDialog, setShowTroubleshootDialog] = useState(false);
  const [isUpdatingYtDlp, setIsUpdatingYtDlp] = useState(false);
  
  const {
    dependencies,
    isChecking,
    isDownloading,
    error: dependencyError,
    justDownloaded,
    hasCheckedDependencies,
    downloadDependencies,
    checkDependencies,
    checkDependenciesIfNeeded,
    areAllDependenciesAvailable,
    getMissingDependencies,
  } = useDependencies();
  
  const {
    searchResults,
    isSearching,
    nextPageToken,
    downloadingVideos,
    downloadProgress,
    completedDownloads,
    error,
    searchVideos,
    loadMoreVideos,
    downloadVideo,
    clearError,
    clearSearch,
    resetDownloadState,
  } = useYouTube(onSoundAdded);


  useEffect(() => {
    checkDependenciesIfNeeded();
  }, [checkDependenciesIfNeeded]);

  const isYouTubeUrl = (input: string): boolean => {
    return input.includes('youtube.com') || input.includes('youtu.be');
  };

  const handleClearSearch = () => {
    setSearchInput('');
    clearSearch();
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      searchVideos(searchInput);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleLoadMore = () => {
    if (nextPageToken && !isSearching) {
      loadMoreVideos();
    }
  };

  const handleDownloadDependencies = async () => {
    await downloadDependencies();
  };

  const handleUpdateYtDlp = async () => {
    setIsUpdatingYtDlp(true);
    try {
      await invoke('update_yt_dlp');
      setTimeout(() => {
        checkDependencies();
      }, 1000);
    } catch (error) {
      console.error('Failed to update yt-dlp:', error);
    } finally {
      setIsUpdatingYtDlp(false);
    }
  };


  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (justDownloaded && areAllDependenciesAvailable()) {
      setShowSuccess(true);
      const timeout = setTimeout(() => setShowSuccess(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [justDownloaded, areAllDependenciesAvailable]);

  if (showSuccess) {
    return (
      <div className="space-y-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 flex items-center space-x-3 justify-center">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <span className="text-green-300 text-lg font-medium">Dependencies installed! Loading search...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isChecking && dependencies && !areAllDependenciesAvailable()) {
    const missingDeps = getMissingDependencies();
    return (
      <div className="space-y-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <Download className="h-6 w-6 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white mb-2">Missing Dependencies</h3>
                <p className="text-gray-300 text-sm mb-4">
                  YouTube download functionality requires the following tools to be installed:
                </p>
                
                <div className="space-y-2 mb-6">
                  {missingDeps.includes('yt-dlp') && (
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${dependencies?.["yt-dlp"].available ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-sm text-gray-300">yt-dlp (YouTube video downloader)</span>
                    </div>
                  )}
                  {missingDeps.includes('ffmpeg') && (
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${dependencies?.ffmpeg.available ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-sm text-gray-300">ffmpeg (Audio conversion)</span>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={handleDownloadDependencies}
                    disabled={isDownloading}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        <span>Download Automatically</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={checkDependencies}
                    disabled={isChecking}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isChecking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Checking...</span>
                      </>
                    ) : (
                      <>
                        <span>Re-check</span>
                      </>
                    )}
                  </button>
                </div>

                {dependencyError && (
                  <p className="text-red-400 text-sm mt-3">{dependencyError}</p>
                )}

                <div className="mt-4 p-3 bg-gray-800/50 rounded border border-gray-700">
                  <p className="text-xs text-gray-400">
                    <strong>Note:</strong> These tools will be downloaded to your app data directory and will only be used by this application.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  if (isChecking || (!hasCheckedDependencies && !dependencies)) {
    return (
      <div className="space-y-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-center space-x-3">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="text-gray-300">
                {isChecking ? 'Checking dependencies...' : 'Initializing YouTube features...'}
              </span>
            </div>
            {dependencyError && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded">
                <p className="text-red-400 text-sm">Error: {dependencyError}</p>
                <button
                  onClick={checkDependencies}
                  className="mt-2 text-red-300 hover:text-red-200 text-sm underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  if (!isChecking && !dependencies && dependencyError) {
    return (
      <div className="space-y-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-6 w-6 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-red-400 mb-2">Dependency Check Failed</h3>
                <p className="text-red-300 text-sm mb-4">
                  Unable to check for required dependencies. This might be due to system permissions or network issues.
                </p>
                <p className="text-red-400 text-sm mb-4">Error: {dependencyError}</p>
                <button
                  onClick={checkDependencies}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Retry Check
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {!hasApiKey && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 flex items-start space-x-3">
            <Key className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-yellow-400 font-medium mb-1">YouTube API Key Required</h3>
              <p className="text-yellow-300 text-sm mb-2">
                YouTube search functionality requires a valid API key. Please configure your YouTube Data API v3 key in the Settings tab.
              </p>
              <a 
                href="https://console.cloud.google.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-red-500 hover:underline text-sm"
              >
                Get API Key from Google Cloud Console →
              </a>
            </div>
          </div>
        </div>
      )}


      <div className="max-w-4xl mx-auto">
        <div className="rounded-lg p-6 shadow-lg border border-gray-700" style={{ background: '#090b10' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Search YouTube Videos</h2>
            <button
              onClick={() => setShowTroubleshootDialog(true)}
              className="flex items-center space-x-2 text-gray-400 hover:text-gray-300 text-sm transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Not Working?</span>
            </button>
          </div>
          

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={hasApiKey ? "Search YouTube videos or paste a YouTube URL... (Press Enter to search)" : "API key required for search..."}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full pl-12 pr-20 text-white border border-gray-600 focus:border-gray-400 focus:ring-gray-400 placeholder-gray-500 rounded-lg py-2"
              style={{ lineHeight: '1.5', minHeight: '44px', background: '#0f1218' }}
              disabled={isSearching || !hasApiKey}
            />
            {searchInput && hasApiKey && (
              <>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="absolute right-12 top-1/2 -translate-y-1/2 bg-gray-700 hover:bg-gray-600 text-white p-1.5 rounded transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed"
                  title="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              </>
            )}
          </div>
        </div>
      </div>


      {error && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-black border border-gray-600 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-gray-400 font-medium mb-1">Search Error</h3>
              <p className="text-gray-300 text-sm">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-gray-400 hover:text-gray-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}


      {searchResults.length > 0 && (
        <div className="space-y-6 youtube-search-results search-results-container">

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium text-white">
                <span className="text-gray-300">Search Results</span>
              </h3>
              {isSearching && (
                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
              )}
            </div>
            <p className="text-sm text-gray-400">
              {searchResults.length} video{searchResults.length !== 1 ? 's' : ''} found
            </p>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {searchResults.map((video) => (
              <div key={video.id} className="video-card">
                <VideoCard
                  video={video}
                  onDownload={downloadVideo}
                  isDownloading={downloadingVideos.has(video.id)}
                  downloadProgress={downloadProgress.get(video.id) || 0}
                  isCompleted={completedDownloads.has(video.id)}
                  onResetDownload={resetDownloadState}
                />
              </div>
            ))}
          </div>


          {nextPageToken && (
            <div className="text-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={isSearching}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                {isSearching ? 'Loading...' : 'Load More Videos'}
              </button>
            </div>
          )}
        </div>
      )}


      {!isSearching && searchResults.length === 0 && searchInput && !error && hasApiKey && (
        <div className="text-center py-16">
          <div className="relative inline-block mb-6">
            <Search className="h-16 w-16 text-gray-400 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-400 mb-2 font-mono">
            No videos found
          </h3>
          <p className="text-gray-400 text-sm">
            Try adjusting your search terms or check your internet connection
          </p>
        </div>
      )}


      {!isSearching && searchResults.length === 0 && !searchInput && hasApiKey && (
        <div className="text-center py-16">
          <div className="relative inline-block mb-6">
            <Search className="h-16 w-16 text-gray-400 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-400 mb-2 font-mono">
            Search for YouTube videos
          </h3>
          <p className="text-gray-400 text-sm">
            Enter keywords to find videos or paste a YouTube URL to download directly
          </p>
        </div>
      )}


      {isSearching && searchResults.length === 0 && (
        <div className="text-center py-16">
          <div className="relative inline-block mb-6">
            <Loader2 className="h-16 w-16 text-gray-400 animate-spin mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-400 mb-2 font-mono">
            {isYouTubeUrl(searchInput) ? 'Loading video...' : 'Searching YouTube...'}
          </h3>
          <p className="text-gray-400 text-sm">
            {isYouTubeUrl(searchInput) ? 'Getting video information...' : `Finding videos for "${searchInput}"`}
          </p>
        </div>
      )}

      {showTroubleshootDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">YouTube Download Issues?</h3>
              <button
                onClick={() => setShowTroubleshootDialog(false)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-gray-300 text-sm space-y-3">
                <p>If YouTube downloads are failing, try these solutions:</p>
                
                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Outdated yt-dlp:</strong> YouTube frequently changes their API. Update yt-dlp to the latest version.</span>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Network issues:</strong> Check your internet connection and try again.</span>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Video restrictions:</strong> Some videos may be region-locked or age-restricted.</span>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span><strong>Private/unavailable videos:</strong> Ensure the video is public and still available.</span>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-gray-700 pt-4">
                <button
                  onClick={handleUpdateYtDlp}
                  disabled={isUpdatingYtDlp}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  {isUpdatingYtDlp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Updating yt-dlp...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>Update yt-dlp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 