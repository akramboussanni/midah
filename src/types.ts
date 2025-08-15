export interface Modifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface Hotkey {
  key: string;
  modifiers: Modifiers;
}

export interface Sound {
  id: string;
  name: string;
  display_name?: string;
  file_path: string;
  category?: string;
  categories?: string[];
  hotkey?: Hotkey;
  volume: number;
  startPosition?: number;
  duration?: number;
  created_at: string;
  updated_at: string;
}

export interface AudioDevice {
  name: string;
  is_default: boolean;
  device_type: string;
}

export type TabType = 'sounds' | 'youtube' | 'settings';
export type ViewType = 'grid' | 'list';

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

export interface HotkeyBinding {
  id: string;
  hotkey: string;
  action: 'PlaySound' | 'StopAllSounds';
  soundId?: string;
  createdAt: string;
}

export interface GlobalHotkey {
  key: string;
  value: string;
  updatedAt: string;
}

export type FrontendHotkeyBinding = HotkeyBinding; 