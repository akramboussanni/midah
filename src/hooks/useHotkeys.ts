import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FrontendHotkeyBinding, Modifiers } from '../types';

export const useHotkeys = () => {
  const [hotkeyBindings, setHotkeyBindings] = useState<FrontendHotkeyBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHotkeyBindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bindings = await invoke<FrontendHotkeyBinding[]>('get_hotkey_bindings');
      setHotkeyBindings(bindings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hotkey bindings');
    } finally {
      setLoading(false);
    }
  }, []);

  const registerHotkey = useCallback(
    async (key: string, modifiers: Modifiers, soundId: string): Promise<string> => {
      try {
        const bindingId = await invoke<string>('register_hotkey', { key, modifiers, soundId: soundId });
        await loadHotkeyBindings();
        return bindingId;
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to register hotkey');
      }
    },
    [loadHotkeyBindings]
  );

  const unregisterHotkey = useCallback(async (bindingId: string): Promise<void> => {
    try {
      await invoke('unregister_hotkey', { binding_id: bindingId });
      await loadHotkeyBindings();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to unregister hotkey');
    }
  }, [loadHotkeyBindings]);

  const updateHotkey = useCallback(async (bindingId: string, newHotkey: string): Promise<void> => {
    try {
      await invoke('update_hotkey', { binding_id: bindingId, new_hotkey: newHotkey });
      await loadHotkeyBindings();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update hotkey');
    }
  }, [loadHotkeyBindings]);

  const setGlobalHotkey = useCallback(async (hotkey: string): Promise<string> => {
    try {
      const bindingId = await invoke<string>('register_global_hotkey', { hotkey });
      await loadHotkeyBindings();
      return bindingId;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to register global hotkey');
    }
  }, [loadHotkeyBindings]);

  const updateGlobalHotkey = useCallback(async (newHotkey: string): Promise<void> => {
    try {
      await invoke('update_global_hotkey', { new_hotkey: newHotkey });
      await loadHotkeyBindings();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update global hotkey');
    }
  }, [loadHotkeyBindings]);

  const unregisterGlobalHotkey = useCallback(async (): Promise<void> => {
    try {
      await invoke('unregister_global_hotkey');
      await loadHotkeyBindings();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to unregister global hotkey');
    }
  }, [loadHotkeyBindings]);

  const getHotkeyBindings = useCallback(() => {
    return hotkeyBindings;
  }, [hotkeyBindings]);

  const getHotkeyForSound = useCallback((soundId: string): string | undefined => {
    const binding = hotkeyBindings.find(b => b.soundId === soundId && b.action === 'PlaySound');
    return binding?.hotkey;
  }, [hotkeyBindings]);

  const getGlobalStopHotkey = useCallback((): string | undefined => {
    const binding = hotkeyBindings.find(b => b.action === 'StopAllSounds');
    return binding?.hotkey;
  }, [hotkeyBindings]);

  const hasHotkeyConflict = useCallback((hotkey: string, excludeSoundId?: string): boolean => {
    return hotkeyBindings.some(binding => 
      binding.hotkey === hotkey && 
      binding.soundId !== excludeSoundId
    );
  }, [hotkeyBindings]);

  function parseHotkeyString(hotkey: string) {
    const parts = hotkey.split('+');
    const mods = { ctrl: false, alt: false, shift: false, meta: false };
    let key = '';
    for (const part of parts) {
      const p = part.toLowerCase();
      if (p === 'ctrl') mods.ctrl = true;
      else if (p === 'alt') mods.alt = true;
      else if (p === 'shift') mods.shift = true;
      else if (p === 'meta' || p === 'cmd' || p === 'win') mods.meta = true;
      else key = part;
    }
    return { key, modifiers: mods };
  }

  useEffect(() => {
    loadHotkeyBindings();
  }, [loadHotkeyBindings]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mods = {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      };
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const match = hotkeyBindings.find(binding => {
        const parsed = parseHotkeyString(binding.hotkey);
        return parsed.key.toUpperCase() === key &&
          parsed.modifiers.ctrl === mods.ctrl &&
          parsed.modifiers.alt === mods.alt &&
          parsed.modifiers.shift === mods.shift &&
          parsed.modifiers.meta === mods.meta;
      });
      if (match) {
        e.preventDefault();
        if (match.action === 'PlaySound' && match.soundId) {
          (window as any).__TAURI__?.invoke('play_sound', { id: match.soundId });
        } else if (match.action === 'StopAllSounds') {
          (window as any).__TAURI__?.invoke('stop_all_sounds');
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hotkeyBindings]);

  return {
    hotkeyBindings,
    loading,
    error,
    registerHotkey,
    unregisterHotkey,
    updateHotkey,
    setGlobalHotkey,
    updateGlobalHotkey,
    unregisterGlobalHotkey,
    getHotkeyBindings,
    getHotkeyForSound,
    getGlobalStopHotkey,
    hasHotkeyConflict,
    reloadBindings: loadHotkeyBindings,
  };
}; 