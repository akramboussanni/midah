import { useState, useEffect, useRef } from 'react';
import { Play, Square, Volume2, MoreVertical, Headphones, Clock } from 'lucide-react';
import { Sound, Hotkey } from '../types';
import { SoundCardMenu } from './SoundCardMenu';

interface SoundCardProps {
  sound: Sound;
  isPlaying: boolean;
  isPlayingLocalOnly: boolean;
  onPlay: (soundId: string, localOnly?: boolean) => void;
  onStop: (soundId: string) => void;
  onVolumeChange: (soundId: string, volume: number) => void;
  onRemove: (soundId: string) => void;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: Hotkey) => void;
  onSetCategories: (soundId: string, categories: string[]) => void;
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
  availableCategories,
  onSeek,
  getPlaybackPosition,
  index 
}: SoundCardProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isMenuOpen && menuBtnRef.current) {
      setAnchorRect(menuBtnRef.current.getBoundingClientRect());
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isPlaying) {
      setCurrentTime(0);
      return;
    }

    const interval = setInterval(async () => {
      if (getPlaybackPosition) {
        const position = await getPlaybackPosition(sound.id);
        if (position !== null) {
          setCurrentTime(position);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, sound.id, getPlaybackPosition]);

  const duration = sound.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    console.log('Progress bar clicked!', { isPlaying, duration, onSeek: !!onSeek });
    if (!isPlaying || !duration || !onSeek) {
      console.log('Click ignored - conditions not met');
      return;
    }
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percent * duration;
    console.log('Seeking to:', { x, rect: rect.width, percent, newTime, duration });
    onSeek(sound.id, newTime);
    setCurrentTime(newTime);
  };

  const [isVolumeDragging, setIsVolumeDragging] = useState(false);

  return (
    <div
      className={`sound-card p-6 card-hover slide-in ${isVolumeDragging ? 'volume-dragging' : ''}`}
      style={{ animationDelay: `${index * 50}ms`, background: '#090b10' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative h-6 w-6 flex items-center justify-center">
            <div className="flex items-center space-x-1 flex-shrink-0 h-4">
              {[1, 2, 3, 4, 5].map((i) => {
                const duration = (Math.random() * 0.3 + 0.5).toFixed(2);
                const delay = (Math.random() * 0.3).toFixed(2);
                const scale = (2.0 + Math.random() * 1.5).toFixed(2);

                return (
                  <div
                    key={`${sound.id}-${i}`}
                    className={`bg-white rounded-sm transition-transform ease-in-out ${
                      isPlaying ? 'opacity-100' : 'opacity-30'
                    }`}
                    style={{
                      width: '3px',
                      height: '3px',
                      transformOrigin: 'center',
                      transform: isPlaying ? `scaleY(${scale})` : 'scaleY(1)',
                      animation: isPlaying
                        ? `waveMotion-${i} ${duration}s ease-in-out ${delay}s infinite`
                        : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate font-mono">{sound.name}</h3>
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

          <div className="relative">
            <button
              ref={menuBtnRef}
              onClick={() => setIsMenuOpen((v) => !v)}
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 flex-shrink-0"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </button>
            {isMenuOpen && (
              <SoundCardMenu
                sound={sound}
                anchorRect={anchorRect}
                onClose={() => setIsMenuOpen(false)}
                onRemove={onRemove}
                onPlayLocal={onPlayLocal}
                onSetStartPosition={onSetStartPosition}
                onSetHotkey={onSetHotkey}
                onSetCategories={onSetCategories}
                availableCategories={availableCategories}
              />
            )}
          </div>
        </div>
      </div>

      {isPlaying && duration > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span className="font-mono">{formatTime(currentTime)}</span>
            <span className="font-mono">{formatTime(duration)}</span>
          </div>
          <div 
            className="w-full bg-gray-800 rounded-full h-1 cursor-pointer"
            onClick={handleProgressBarClick}
          >
            <div 
              className="bg-white h-1 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      {!isPlaying && duration > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          <span className="font-mono">{formatTime(duration)}</span>
        </div>
      )}

      <div className="space-y-3">
        <div className={`flex items-center space-x-2 p-2 rounded border volume-control ${
          isVolumeDragging 
            ? 'bg-gray-700/50 border-gray-600/50' 
            : 'bg-gray-800/30 border-gray-700/30'
        }`}>
          <Volume2 className={`h-3 w-3 flex-shrink-0 ${
            isVolumeDragging ? 'text-white' : 'text-gray-400'
          }`} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sound.volume}
            onChange={(e) => {
              e.stopPropagation();
              const newVolume = parseFloat(e.target.value);
              onVolumeChange(sound.id, newVolume);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsVolumeDragging(true);
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              setIsVolumeDragging(false);
            }}
            onMouseLeave={() => setIsVolumeDragging(false)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{ pointerEvents: 'auto' }}
          />
          <span className="text-xs text-gray-400 font-mono w-8 flex-shrink-0">
            {Math.round(sound.volume * 100)}%
          </span>
        </div>
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
