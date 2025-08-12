import React, { useEffect, useRef, useState } from 'react';
import { Hotkey, Modifiers } from '../types';

function getModifiers(e: KeyboardEvent): Modifiers {
  return {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  };
}

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

interface HotkeyInputProps {
  value?: Hotkey;
  onChange: (hotkey: Hotkey) => void;
}

export const HotkeyInput: React.FC<HotkeyInputProps> = ({ value, onChange }) => {
  const [hotkey, setHotkey] = useState<Hotkey | undefined>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHotkey(value);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
      return;
    }
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const modifiers = getModifiers(e.nativeEvent);
    const newHotkey: Hotkey = { key, modifiers };
    setHotkey(newHotkey);
    onChange(newHotkey);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={hotkeyToString(hotkey)}
      onKeyDown={handleKeyDown}
      onFocus={e => e.target.select()}
      readOnly
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-full cursor-pointer"
      placeholder="Press a key combination"
    />
  );
}; 