import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Clock, Headphones, Trash2 } from 'lucide-react';
import { Sound } from '../types';

interface SoundCardMenuProps {
  sound: Sound;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onRemove: (soundId: string) => void;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: string) => void;
}

// Helper function to format time
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const SoundCardMenu: React.FC<SoundCardMenuProps> = ({
  sound,
  anchorRect,
  onClose,
  onRemove,
  onPlayLocal,
  onSetStartPosition,
  onSetHotkey,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showStartPositionInput, setShowStartPositionInput] = useState(false);
  const [startPosition, setStartPosition] = useState(sound.startPosition || 0);
  const [showHotkeyInput, setShowHotkeyInput] = useState(false);
  const [hotkey, setHotkey] = useState(sound.hotkey || '');

  const duration = sound.duration || 0;

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Reposition menu when start position input is toggled
  useEffect(() => {
    if (menuRef.current && anchorRect) {
      const menuWidth = showStartPositionInput ? 320 : 240;
      let left = anchorRect.left + window.scrollX;
      
      // If menu would overflow right, shift left
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      
      // If menu would overflow left, shift right
      if (left < 8) {
        left = 8;
      }
      
      menuRef.current.style.left = `${left}px`;
      menuRef.current.style.minWidth = `${menuWidth}px`;
      menuRef.current.style.maxWidth = `${menuWidth}px`;
    }
  }, [showStartPositionInput, anchorRect]);

  // Positioning
  const baseMenuWidth = 240; // px, base menu width
  const expandedMenuWidth = 320; // px, width when start position input is shown
  const menuWidth = showStartPositionInput ? expandedMenuWidth : baseMenuWidth;
  
  const style: React.CSSProperties = anchorRect
    ? (() => {
        let left = anchorRect.left + window.scrollX;
        let top = anchorRect.bottom + window.scrollY + 4;
        
        // If menu would overflow right, shift left
        if (left + menuWidth > window.innerWidth - 8) {
          left = window.innerWidth - menuWidth - 8;
        }
        
        // If menu would overflow left, shift right
        if (left < 8) {
          left = 8;
        }
        
        return {
          position: 'absolute',
          top,
          left,
          zIndex: 1000,
          minWidth: menuWidth,
          maxWidth: menuWidth,
        };
      })()
    : { display: 'none' };

  const menu = (
    <div ref={menuRef} style={style} className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
      <div className="py-1 space-y-1">
        {/* Sound ID Display */}
        <div className="px-4 py-2 text-xs text-gray-400 font-mono flex items-center gap-2">
          <span>ID:</span>
          <input
            type="text"
            value={sound.id}
            readOnly
            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs w-full cursor-copy"
            onFocus={e => e.target.select()}
            onClick={e => (e.target as HTMLInputElement).select()}
          />
        </div>

        {/* Duration Display */}
        {duration > 0 && (
          <div className="px-4 py-2 text-xs text-gray-400 font-mono flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span>Duration: {formatTime(duration)}</span>
          </div>
        )}

        {/* Hotkey Option */}
        <button
          onClick={() => {
            setShowHotkeyInput(!showHotkeyInput);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center space-x-2"
        >
          <span>Set Hotkey</span>
          {sound.hotkey && (
            <span className="ml-auto text-xs text-gray-400 font-mono">{sound.hotkey}</span>
          )}
        </button>

        {/* Start Position Option */}
        <button
          onClick={() => {
            setShowStartPositionInput(!showStartPositionInput);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center space-x-2"
        >
          <Clock className="h-4 w-4" />
          <span>Set Start Position</span>
          {sound.startPosition && (
            <span className="ml-auto text-xs text-gray-400 font-mono">
              {formatTime(sound.startPosition)}
            </span>
          )}
        </button>

        {/* Local Playback Option */}
        <button
          onClick={() => {
            onPlayLocal(sound.id);
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center space-x-2"
        >
          <Headphones className="h-4 w-4" />
          <span>Play Local Only</span>
        </button>

        {/* Remove Option */}
        <button
          onClick={() => {
            onRemove(sound.id);
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-800 flex items-center space-x-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>Remove</span>
        </button>
      </div>

      {/* Hotkey Input */}
      {showHotkeyInput && (
        <div className="space-y-2 p-3 rounded bg-gray-800/30 border border-gray-700/30">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium font-mono text-gray-300">Hotkey</label>
            <button
              onClick={() => setShowHotkeyInput(false)}
              className="text-xs text-gray-400 hover:text-gray-300"
            >
              ×
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded font-mono"
              placeholder="e.g. Ctrl+Alt+S"
            />
            <button
              onClick={() => {
                onSetHotkey(sound.id, hotkey);
                setShowHotkeyInput(false);
                onClose();
              }}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Start Position Input */}
      {showStartPositionInput && (
        <div className="space-y-3 p-3 rounded bg-gray-800/30 border border-gray-700/30">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium font-mono text-gray-300">Start Position</label>
            <button
              onClick={() => setShowStartPositionInput(false)}
              className="text-xs text-gray-400 hover:text-gray-300"
            >
              ×
            </button>
          </div>
          
          {duration > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>0:00</span>
                  <span className="font-mono">{formatTime(startPosition)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={startPosition}
                  onChange={(e) => setStartPosition(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={startPosition}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setStartPosition(Math.min(value, duration));
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded font-mono"
                  placeholder="0.0"
                />
                <span className="text-xs text-gray-400 font-mono">sec</span>
                <button
                  onClick={() => {
                    onSetStartPosition(sound.id, startPosition);
                    setShowStartPositionInput(false);
                    onClose();
                  }}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
                >
                  Set
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={startPosition}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  setStartPosition(Math.max(0, value));
                }}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded font-mono"
                placeholder="0.0"
              />
              <span className="text-xs text-gray-400 font-mono">sec</span>
              <button
                onClick={() => {
                  onSetStartPosition(sound.id, startPosition);
                  setShowStartPositionInput(false);
                  onClose();
                }}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
              >
                Set
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}; 