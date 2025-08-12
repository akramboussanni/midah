import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { VideoInfo, SearchResult } from '../types';

const isYouTubeUrl = (input: string): boolean => {
  return input.includes('youtube.com') || input.includes('youtu.be');
};

export const useYouTube = (onSoundAdded?: () => void) => {
  const [searchResults, setSearchResults] = useState<VideoInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [downloadingVideos, setDownloadingVideos] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [downloadStatus, setDownloadStatus] = useState<Map<string, string>>(new Map());
  const [completedDownloads, setCompletedDownloads] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen('youtube-download-progress', (event) => {
      const { video_id, progress, status } = event.payload as { 
        video_id: string; 
        progress: number; 
        status: string;
      };
      
      setDownloadProgress(prev => new Map(prev).set(video_id, progress));
      setDownloadStatus(prev => new Map(prev).set(video_id, status));
      
      if (status === 'completed') {
        setCompletedDownloads(prev => new Set(prev).add(video_id));
        setDownloadingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(video_id);
          return newSet;
        });
      }
      
      if (status === 'error') {
        setError(`Failed to download video ${video_id}`);
        setDownloadingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(video_id);
          return newSet;
        });
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const searchVideos = useCallback(async (query: string, maxResults: number = 20) => {
    if (!query.trim()) {
      setSearchResults([]);
      setNextPageToken(undefined);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      if (isYouTubeUrl(query)) {
        const videoInfo: VideoInfo = await invoke('get_video_info_by_url', { url: query });
        setSearchResults([videoInfo]);
        setNextPageToken(undefined);
        setSearchQuery(query);
      } else {
        const result: SearchResult = await invoke('search_videos', {
          query,
          maxResults,
          pageToken: undefined,
        });

        setSearchResults(result.videos);
        setNextPageToken(result.next_page_token);
        setSearchQuery(query);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search videos');
      console.error('YouTube search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadMoreVideos = useCallback(async (maxResults: number = 20) => {
    if (!nextPageToken || !searchQuery) return;

    setIsSearching(true);
    setError(null);

    try {
      const result: SearchResult = await invoke('search_videos', {
        query: searchQuery,
        maxResults,
        pageToken: nextPageToken,
      });

      setSearchResults(prev => [...prev, ...result.videos]);
      setNextPageToken(result.next_page_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more videos');
      console.error('YouTube load more error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [nextPageToken, searchQuery]);

  const getVideoInfo = useCallback(async (videoId: string): Promise<VideoInfo | null> => {
    try {
      const videoInfo: VideoInfo = await invoke('get_video_info', { videoId });
      return videoInfo;
    } catch (err) {
      console.error('Failed to get video info:', err);
      return null;
    }
  }, []);

  const downloadVideo = useCallback(async (videoId: string, videoTitle: string) => {
    if (downloadingVideos.has(videoId)) {
      return;
    }

    setCompletedDownloads(prev => {
      const newSet = new Set(prev);
      newSet.delete(videoId);
      return newSet;
    });

    setDownloadingVideos(prev => new Set(prev).add(videoId));
    setDownloadProgress(prev => new Map(prev).set(videoId, 0));
    setDownloadStatus(prev => new Map(prev).set(videoId, 'starting'));
    setError(null);

    try {
      const appDataDir = await invoke('get_app_data_dir');
      const downloadsDir = `${appDataDir}/downloads`;
      
      await invoke('create_directory', { path: downloadsDir });

      const outputPath = `${downloadsDir}/${videoId}.mp3`;
      
      const result: string = await invoke('download_video', {
        videoId,
        outputPath,
      });

      await invoke('add_sound', {
        request: {
          name: videoTitle,
          file_path: result,
          category: 'YouTube',
          volume: 1.0,
        },
      });

      if (onSoundAdded) {
        onSoundAdded();
      }

      console.log('Video downloaded successfully:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download video');
      console.error('Download error:', err);
      
      setDownloadingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(videoId);
        return newMap;
      });
      setDownloadStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(videoId);
        return newMap;
      });
    }
  }, [downloadingVideos, onSoundAdded]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchQuery('');
    setNextPageToken(undefined);
    setError(null);
  }, []);

  const resetDownloadState = useCallback((videoId: string) => {
    setCompletedDownloads(prev => {
      const newSet = new Set(prev);
      newSet.delete(videoId);
      return newSet;
    });
    setDownloadProgress(prev => {
      const newMap = new Map(prev);
      newMap.delete(videoId);
      return newMap;
    });
    setDownloadStatus(prev => {
      const newMap = new Map(prev);
      newMap.delete(videoId);
      return newMap;
    });
  }, []);

  return {
    searchResults,
    isSearching,
    searchQuery,
    nextPageToken,
    downloadingVideos,
    downloadProgress,
    downloadStatus,
    completedDownloads,
    error,
    searchVideos,
    loadMoreVideos,
    getVideoInfo,
    downloadVideo,
    clearError,
    clearSearch,
    resetDownloadState,
  };
}; 