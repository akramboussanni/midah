export interface Sound {
  id: string;
  name: string;
  file_path: string;
  category?: string;
  hotkey?: string;
  volume: number;
  startPosition?: number;
  duration?: number; // Duration in seconds
  created_at: string;
  updated_at: string;
}

export interface AudioDevice {
  name: string;
  is_default: boolean;
  device_type: string; // "input" or "output"
}

export type TabType = 'sounds' | 'youtube' | 'settings';

// YouTube types
export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  duration?: string;
  thumbnail: string;
  channel_title: string;
  published_at: string;
  view_count?: number;
}

export interface SearchResult {
  videos: VideoInfo[];
  next_page_token?: string;
}

export interface DownloadProgress {
  video_id: string;
  status: string;
  progress: number;
  downloaded_bytes?: number;
  total_bytes?: number;
} 