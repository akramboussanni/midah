import React, { useState } from 'react';
import { HotkeyInput } from './HotkeyInput';
import { Hotkey } from '../types';

interface HotkeySettingProps {
  soundId?: string;
  currentHotkey?: Hotkey;
  onHotkeyChange: (hotkey: Hotkey | null) => void;
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

export const HotkeySetting: React.FC<HotkeySettingProps> = ({
  soundId,
  currentHotkey,
  onHotkeyChange,
}) => {
  const [hotkey, setHotkey] = useState<Hotkey | undefined>(currentHotkey);


  const handleHotkeyChange = (newHotkey: Hotkey) => {
    setHotkey(newHotkey);
    onHotkeyChange(newHotkey);
  };

  const handleClearHotkey = () => {
    setHotkey(undefined);
    onHotkeyChange(null);
  };

  const isGlobalSetting = !soundId;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">
          {isGlobalSetting ? 'Stop All Sounds Hotkey' : 'Sound Hotkey'}
        </label>
        {hotkey && (
          <button
            type="button"
            onClick={handleClearHotkey}
            className="text-xs text-gray-400 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
      <HotkeyInput
        value={hotkey}
        onChange={handleHotkeyChange}
      />
    </div>
  );
}; 