import { Play, Square, Headphones, Clock } from 'lucide-react';
import { WaveformAnimation } from './WaveformAnimation';
import { SoundMenuButton } from './SoundMenuButton';
import { PlaybackProgress } from './PlaybackProgress';
import { Sound, Hotkey } from '../types';

interface SoundListItemProps {
  sound: Sound;
  isPlaying: boolean;
  isPlayingLocalOnly: boolean;
  onPlay: (soundId: string, localOnly?: boolean) => void;
  onStop: (soundId: string) => void;
  onVolumeChange: (soundId: string, volume: number) => void;
  onRemove: (soundId: string, deleteFile: boolean) => void | Promise<void>;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: Hotkey) => void;
  onSetCategories: (soundId: string, categories: string[]) => void;
  onSetDisplayName: (soundId: string, displayName: string | null) => void;
  availableCategories: string[];
  onSeek?: (soundId: string, position: number) => void;
  getPlaybackPosition?: (soundId: string) => Promise<number | null>;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function hotkeyToString(hotkey?: Hotkey): string {
  if (!hotkey) return '';
  const mods = [];
  if (hotkey.modifiers.ctrl) mods.push('Ctrl');
  if (hotkey.modifiers.alt) mods.push('Alt');
  if (hotkey.modifiers.shift) mods.push('Shift');
  if (hotkey.modifiers.meta) mods.push('Meta');
  if (hotkey.key) mods.push(hotkey.key.toUpperCase());
  return mods.join('+');
}

export const SoundListItem = ({
  sound,
  isPlaying,
  isPlayingLocalOnly,
  onPlay,
  onStop,
  onVolumeChange,
  onRemove,
  onPlayLocal,
  onSetStartPosition,
  onSetHotkey,
  onSetCategories,
  onSetDisplayName,
  availableCategories,
  onSeek,
  getPlaybackPosition,
}: SoundListItemProps) => {
  const duration = sound.duration || 0;
  const displayName = sound.display_name || sound.name;
  const categories = sound.categories?.join(', ') || sound.category || 'Uncategorized';

  return (
    <div
      className="bg-gray-950/80 border border-gray-900 rounded-lg p-4 hover:bg-gray-950/90 transition-colors duration-200"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => isPlaying ? onStop(sound.id) : onPlay(sound.id)}
          className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 flex-shrink-0"
        >
          {isPlaying ? (
            <Square className="h-4 w-4 text-white" />
          ) : (
            <Play className="h-4 w-4 text-gray-400" />
          )}
        </button>

        <WaveformAnimation isPlaying={isPlaying} size="small" />

        <div className="flex-1 min-w-0 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex flex-col min-w-0">
                <h3 className="font-medium text-sm truncate font-mono text-white">
                  {displayName}
                </h3>
                {sound.display_name && (
                  <p className="text-xs text-gray-500 truncate font-mono">
                    {sound.name}
                  </p>
                )}
              </div>
              {isPlayingLocalOnly && (
                <div className="relative group">
                  <Headphones className="h-3 w-3 text-white flex-shrink-0" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                    Playing locally only
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isPlaying && (
            <div className="min-w-0 hidden md:block w-32">
              <span className="text-xs text-gray-400 font-mono truncate block max-w-full" title={categories}>
                {categories}
              </span>
            </div>
          )}

          {!isPlaying && (
            <div className="min-w-0 hidden md:block w-20">
              {duration > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{formatTime(duration)}</span>
                </div>
              )}
            </div>
          )}

          <div className="min-w-0 hidden md:block w-24">
            {!isPlaying && sound.hotkey && (
              <span className="bg-gray-800 px-2 py-1 rounded text-xs font-mono border border-gray-700 text-gray-400">
                {hotkeyToString(sound.hotkey)}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <SoundMenuButton
            sound={sound}
            onRemove={onRemove}
            onPlayLocal={onPlayLocal}
            onSetStartPosition={onSetStartPosition}
            onSetHotkey={onSetHotkey}
            onSetCategories={onSetCategories}
            onSetDisplayName={onSetDisplayName}
            availableCategories={availableCategories}
            onVolumeChange={onVolumeChange}
          />
        </div>
      </div>

      {isPlaying && duration > 0 && (
        <div className="mt-3">
                     <PlaybackProgress
             soundId={sound.id}
             duration={duration}
             onSeek={onSeek ? (newTime: number) => onSeek(sound.id, newTime) : undefined}
             getPlaybackPosition={getPlaybackPosition}
             isPlaying={isPlaying}
           />
        </div>
      )}
    </div>
  );
};
