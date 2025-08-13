import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Clock, Headphones, Trash2, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { Sound } from '../types';
import { HotkeyInput } from './HotkeyInput';
import { Hotkey } from '../types';

interface SoundCardMenuProps {
  sound: Sound;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onRemove: (soundId: string, deleteFile: boolean) => void | Promise<void>;
  onPlayLocal: (soundId: string) => void;
  onSetStartPosition: (soundId: string, position: number) => void;
  onSetHotkey: (soundId: string, hotkey: Hotkey) => void;
  onSetCategories: (soundId: string, categories: string[]) => void;
  availableCategories: string[];
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

export const SoundCardMenu: React.FC<SoundCardMenuProps> = ({
  sound,
  anchorRect,
  onClose,
  onRemove,
  onPlayLocal,
  onSetStartPosition,
  onSetHotkey,
  onSetCategories,
  availableCategories,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showStartPositionInput, setShowStartPositionInput] = useState(false);
  const [startPosition, setStartPosition] = useState(sound.startPosition || 0);
  const [showHotkeyInput, setShowHotkeyInput] = useState(false);
  const [hotkey, setHotkey] = useState<Hotkey | undefined>(sound.hotkey);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const duration = sound.duration || 0;

  const handleHotkeyChange = (newHotkey: Hotkey) => {
    setHotkey(newHotkey);
    onSetHotkey(sound.id, newHotkey);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRemoveDialog) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, showRemoveDialog]);

  useEffect(() => {
    const reposition = () => {
      if (menuRef.current && anchorRect) {
        const menuWidth = showStartPositionInput ? 320 : 240;
        let left = anchorRect.left + window.scrollX;
        const margin = 8;

        if (left + menuWidth > window.innerWidth - margin) {
          left = window.innerWidth - menuWidth - margin;
        }
        if (left < margin) {
          left = margin;
        }

        let top = anchorRect.bottom + window.scrollY + 4;
        const menuHeight = menuRef.current.offsetHeight || 0;
        const viewportBottom = window.scrollY + window.innerHeight;
        if (top + menuHeight > viewportBottom - margin) {
          const flippedTop = anchorRect.top + window.scrollY - menuHeight - 4;
          if (flippedTop > window.scrollY + margin) {
            top = flippedTop;
            menuRef.current.style.maxHeight = '';
            menuRef.current.style.overflow = '';
          } else {
            top = window.scrollY + margin;
            const maxHeight = anchorRect.top + window.scrollY - margin - top;
            if (maxHeight > 100) {
              menuRef.current.style.maxHeight = `${maxHeight}px`;
              menuRef.current.style.overflow = 'auto';
            }
          }
        } else {
          menuRef.current.style.maxHeight = '';
          menuRef.current.style.overflow = '';
        }

        menuRef.current.style.left = `${left}px`;
        menuRef.current.style.top = `${top}px`;
        menuRef.current.style.minWidth = `${menuWidth}px`;
        menuRef.current.style.maxWidth = `${menuWidth}px`;
      }
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition);
    };
  }, [showStartPositionInput, anchorRect]);

  const baseMenuWidth = 240;
  const expandedMenuWidth = 320;
  const menuWidth = showStartPositionInput ? expandedMenuWidth : baseMenuWidth;
  const style: React.CSSProperties = anchorRect
    ? { position: 'absolute', top: 0, left: 0, zIndex: 1000, minWidth: menuWidth, maxWidth: menuWidth }
    : { display: 'none' };

  const menu = (
    <div ref={menuRef} style={style} className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
      <div className="py-1 space-y-1">

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


        {duration > 0 && (
          <div className="px-4 py-2 text-xs text-gray-400 font-mono flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span>Duration: {formatTime(duration)}</span>
          </div>
        )}


        <button
          onClick={() => {
            setShowHotkeyInput(!showHotkeyInput);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center space-x-2"
        >
          <span>Set Hotkey</span>
          {sound.hotkey && (
            <span className="ml-auto text-xs text-gray-400 font-mono">{hotkeyToString(sound.hotkey)}</span>
          )}
        </button>

        <div className="px-4 py-2">
          {(() => {
            const current = sound.categories && sound.categories.length > 0
              ? sound.categories
              : (sound.category ? [sound.category] : []);
            const currentDisplay = current.length === 0
              ? 'Uncategorized'
              : current.length === 1
                ? current[0]
                : `${current[0]} +${current.length - 1}`;
            return (
              <button
                type="button"
                onClick={() => setIsCategoryOpen(v => !v)}
                className="w-full flex items-center gap-2 mb-2 text-left text-sm text-gray-300 hover:text-white"
              >
                {isCategoryOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <Tag className="h-4 w-4 text-gray-400" />
                <span>Category</span>
                <span className="ml-auto text-xs text-gray-400 font-mono truncate max-w-[9rem]">
                  {currentDisplay}
                </span>
              </button>
            );
          })()}
          {isCategoryOpen && (!showNewCategoryInput ? (
            <div className="space-y-1 max-h-40 overflow-auto pr-1">
              {availableCategories.filter(c => c !== 'Uncategorized').map(category => {
                const current = sound.categories || (sound.category ? [sound.category] : []);
                const normalized = category;
                const checked = current.includes(normalized);
                return (
                  <label key={category} className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const existing = new Set(current);
                        if (e.target.checked) existing.add(normalized); else existing.delete(normalized);
                        const next = Array.from(existing).filter(Boolean);
                        onSetCategories(sound.id, next);
                      }}
                      className="accent-blue-600"
                    />
                    <span className="font-mono truncate">{category}</span>
                  </label>
                );
              })}
              <button
                onClick={() => { setShowNewCategoryInput(true); setNewCategoryName(''); }}
                className="mt-2 w-full text-left text-xs text-gray-300 hover:text-white hover:bg-gray-800/50 px-2 py-1 rounded"
              >
                + Create New Category
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded font-mono text-white placeholder-gray-400"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    const current = sound.categories || (sound.category ? [sound.category] : []);
                    const next = Array.from(new Set([...current, newCategoryName.trim()]));
                    onSetCategories(sound.id, next);
                    setShowNewCategoryInput(false);
                    setNewCategoryName('');
                  }
                }}
                autoFocus
              />
              <div className="flex space-x-1">
                <button
                  onClick={() => {
                    if (newCategoryName.trim()) {
                      const current = sound.categories || (sound.category ? [sound.category] : []);
                      const next = Array.from(new Set([...current, newCategoryName.trim()]));
                      onSetCategories(sound.id, next);
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                >
                  Set
                </button>
                <button
                  onClick={() => {
                    setShowNewCategoryInput(false);
                    setNewCategoryName('');
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>


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


        <button
            onClick={() => { console.log('[SoundCardMenu] Remove clicked', { id: sound.id }); setShowRemoveDialog(true); }}
          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-800 flex items-center space-x-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>Remove</span>
        </button>
      </div>


      {showRemoveDialog && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={(e) => { e.stopPropagation(); setShowRemoveDialog(false); }} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-4 space-y-3">
            <div className="text-sm text-gray-200 font-mono">Remove "{sound.name}"?</div>
            <div className="space-y-2">
              <button
                onClick={async (e) => { e.stopPropagation(); console.log('[SoundCardMenu] Confirm remove (keep file)', { id: sound.id }); await onRemove(sound.id, false); setShowRemoveDialog(false); onClose(); }}
                className="w-full px-3 py-2 text-left text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded"
              >
                Remove from Midah (keep file)
              </button>
              <button
                onClick={async (e) => { e.stopPropagation(); console.log('[SoundCardMenu] Confirm remove (delete file)', { id: sound.id }); await onRemove(sound.id, true); setShowRemoveDialog(false); onClose(); }}
                className="w-full px-3 py-2 text-left text-xs bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Delete file from disk
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowRemoveDialog(false); }}
                className="w-full px-3 py-2 text-left text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showHotkeyInput && (
        <div className="px-4 py-2">
          <HotkeyInput value={hotkey} onChange={handleHotkeyChange} />
        </div>
      )}


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