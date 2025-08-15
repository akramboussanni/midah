import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { SoundCardMenu } from './SoundCardMenu';
import { Sound, Hotkey } from '../types';

interface SoundMenuButtonProps {
  sound: Sound;
  onRemove: (soundId: string, deleteFile: boolean) => void | Promise<void>;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: Hotkey) => void;
  onSetCategories: (soundId: string, categories: string[]) => void;
  onSetDisplayName: (soundId: string, displayName: string | null) => void;
  availableCategories: string[];
  onVolumeChange?: (soundId: string, volume: number) => void;
}

export const SoundMenuButton = ({
  sound,
  onRemove,
  onPlayLocal,
  onSetStartPosition,
  onSetHotkey,
  onSetCategories,
  onSetDisplayName,
  availableCategories,
  onVolumeChange,
}: SoundMenuButtonProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isMenuOpen && menuBtnRef.current) {
      setAnchorRect(menuBtnRef.current.getBoundingClientRect());
    }
  }, [isMenuOpen]);

  return (
    <div className="relative">
      <button
        ref={menuBtnRef}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 flex-shrink-0"
        aria-label="More options"
        data-menu-button
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
              onVolumeChange={onVolumeChange}
            />
      )}
    </div>
  );
};
