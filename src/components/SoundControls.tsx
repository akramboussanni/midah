import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { SoundVolumeSlider } from './SoundVolumeSlider';
import { SoundCardMenu } from './SoundCardMenu';
import { Sound, Hotkey } from '../types';

interface SoundControlsProps {
  sound: Sound;
  onVolumeChange: (soundId: string, volume: number) => void;
  onRemove: (soundId: string, deleteFile: boolean) => void | Promise<void>;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: Hotkey) => void;
  onSetCategories: (soundId: string, categories: string[]) => void;
  onSetDisplayName: (soundId: string, displayName: string | null) => void;
  availableCategories: string[];
  layout?: 'horizontal' | 'vertical';
  showVolumeSlider?: boolean;
}

export const SoundControls = ({
  sound,
  onVolumeChange,
  onRemove,
  onPlayLocal,
  onSetStartPosition,
  onSetHotkey,
  onSetCategories,
  onSetDisplayName,
  availableCategories,
  layout = 'vertical',
  showVolumeSlider = false
}: SoundControlsProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isMenuOpen && menuBtnRef.current) {
      setAnchorRect(menuBtnRef.current.getBoundingClientRect());
    }
  }, [isMenuOpen]);

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-4">
        {/* Volume Slider - Only show if enabled */}
        {showVolumeSlider && (
          <SoundVolumeSlider
            soundId={sound.id}
            volume={sound.volume}
            onVolumeChange={onVolumeChange}
            containerClassName="w-24 flex-shrink-0 overflow-hidden"
          />
        )}

        {/* Menu Button */}
        <div className="relative flex-shrink-0">
          <button
            ref={menuBtnRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200"
            aria-label="More options"
          >
            <MoreVertical className="h-3 w-3 text-gray-400" />
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
              onSetDisplayName={onSetDisplayName}
              availableCategories={availableCategories}
            />
          )}
        </div>
      </div>
    );
  }

  // Vertical layout (original SoundCard layout)
  return (
    <div className="space-y-3">
      <SoundVolumeSlider
        soundId={sound.id}
        volume={sound.volume}
        onVolumeChange={onVolumeChange}
      />
      <div className="relative">
        <button
          ref={menuBtnRef}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
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
            onSetDisplayName={onSetDisplayName}
            availableCategories={availableCategories}
          />
        )}
      </div>
    </div>
  );
};
