import { useState, useEffect } from 'react';
import { Play, Square, Headphones, Clock } from 'lucide-react';
import { PlaybackProgress } from './PlaybackProgress';
import { WaveformAnimation } from './WaveformAnimation';
import { SoundVolumeSlider } from './SoundVolumeSlider';
import { SoundMenuButton } from './SoundMenuButton';
import { Sound, Hotkey } from '../types';

interface SoundCardProps {
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
  index: number;
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

export const SoundCard = ({ 
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
  index 
}: SoundCardProps) => {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!isPlaying) setCurrentTime(0);
  }, [isPlaying]);

  const duration = sound.duration || 0;

  const handleSeek = (newTime: number) => {
    if (!isPlaying || !duration || !onSeek) return;
    onSeek(sound.id, newTime);
    setCurrentTime(newTime);
  };

  return (
    <div
      className="sound-card p-6 card-hover slide-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <WaveformAnimation isPlaying={isPlaying} />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col min-w-0">
              <h3 className="font-medium text-sm truncate font-mono">
                {sound.display_name || sound.name}
              </h3>
              {sound.display_name && (
                <p className="text-xs text-gray-500 truncate font-mono">
                  {sound.name}
                </p>
              )}
            </div>
            {isPlayingLocalOnly && (
              <div className="relative group">
                <Headphones className="h-3 w-3 text-white flex-shrink-0 mr-2" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  Playing locally only
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
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

          <SoundMenuButton
            sound={sound}
            onRemove={onRemove}
            onPlayLocal={onPlayLocal}
            onSetStartPosition={onSetStartPosition}
            onSetHotkey={onSetHotkey}
            onSetCategories={onSetCategories}
            onSetDisplayName={onSetDisplayName}
            availableCategories={availableCategories}
          />
        </div>
      </div>

      {isPlaying && duration > 0 && (
        <div className="mb-3">
          <PlaybackProgress 
            duration={duration} 
            currentTime={currentTime} 
            onSeek={handleSeek}
            isPlaying={isPlaying}
            soundId={sound.id}
            getPlaybackPosition={getPlaybackPosition}
          />
        </div>
      )}

      {!isPlaying && duration > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          <span className="font-mono">{formatTime(duration)}</span>
        </div>
      )}

      <div className="space-y-3">
        <SoundVolumeSlider
          soundId={sound.id}
          volume={sound.volume}
          onVolumeChange={onVolumeChange}
        />
        {sound.hotkey && (
          <div className="flex items-center justify-end">
            <span className="bg-gray-800 px-2 py-1 rounded text-xs font-mono border border-gray-700 text-gray-400">
              {hotkeyToString(sound.hotkey)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
