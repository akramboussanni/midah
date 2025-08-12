import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Sound, Hotkey } from '../types';
import { useHotkeys } from './useHotkeys';

export const useSounds = () => {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { registerHotkey } = useHotkeys();
  useHotkeys();

  const loadSounds = useCallback(async () => {
    try {
      setIsLoading(true);
      const soundsData = await invoke<Sound[]>('get_sounds');
      setSounds(soundsData);
    } catch (error) {
      console.error('Failed to load sounds:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSounds();
  }, [loadSounds]);

  const handleImportAudio = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Audio Files',
          extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a']
        }]
      });

      if (selected && typeof selected === 'string') {
        console.log('Importing file:', selected);
        const newSound = await invoke<Sound>('import_audio_file', { filePath: selected });
        setSounds(prevSounds => [...prevSounds, newSound]);
        console.log('Import result:', newSound);
        console.log('Sounds reloaded');
      }
    } catch (error) {
      console.error('Failed to import audio:', error);
    }
  }, []);

  const handleSoundVolumeChange = useCallback(async (soundId: string, newVolume: number) => {
    try {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      
      setSounds(prevSounds => 
        prevSounds.map(sound => 
          sound.id === soundId 
            ? { ...sound, volume: clampedVolume }
            : sound
        )
      );
      
      const result = await invoke('update_sound_volume', { id: soundId, volume: clampedVolume });
      console.log('Volume update result:', result);
      
    } catch (error) {
      console.error('Failed to update sound volume:', error);
      setSounds(prevSounds => 
        prevSounds.map(sound => 
          sound.id === soundId 
            ? { ...sound, volume: sound.volume }
            : sound
        )
      );
    }
  }, []);

  const handleRemoveSound = async (soundId: string) => {
    try {
      console.log('Removing sound:', soundId);
      
      const result = await invoke('remove_sound', { id: soundId });
      console.log('Remove result:', result);
      
      setSounds(prevSounds => prevSounds.filter(sound => sound.id !== soundId));
      
      console.log('Sound removed successfully');
    } catch (error) {
      console.error('Failed to remove sound:', error);
    }
  };

  const handleRemoveAllSounds = async () => {
    try {
      await invoke('remove_all_sounds');
      await loadSounds();
    } catch (error) {
      console.error('Failed to remove all sounds:', error);
    }
  };

  const handleSetStartPosition = async (soundId: string, position: number) => {
    try {
      console.log('Setting start position for sound:', soundId, 'to:', position);
      
      const result = await invoke('update_sound_start_position', { id: soundId, startPosition: position });
      console.log('Start position update result:', result);
      
      setSounds(prevSounds => 
        prevSounds.map(sound => 
          sound.id === soundId 
            ? { ...sound, startPosition: position }
            : sound
        )
      );
      
      console.log('Start position updated successfully');
    } catch (error) {
      console.error('Failed to update sound start position:', error);
    }
  };

  const handleSetHotkey = async (soundId: string, hotkey: Hotkey) => {
    try {
      await registerHotkey(hotkey.key, hotkey.modifiers, soundId);
      setSounds(prevSounds =>
        prevSounds.map(sound =>
          sound.id === soundId ? { ...sound, hotkey } : sound
        )
      );
      console.log('Hotkey set successfully');
    } catch (error) {
      console.error('Failed to set hotkey:', error);
    }
  };

  const handleSetCategories = async (soundId: string, categories: string[]) => {
    try {
      const unique = Array.from(new Set(categories.filter(Boolean)));
      await invoke('update_sound_categories', { id: soundId, categories: unique });
      setSounds(prev => prev.map(s => s.id === soundId ? { ...s, categories: unique, category: unique[0] } : s));
    } catch (error) {
      console.error('Failed to update sound categories:', error);
    }
  };

  return {
    sounds,
    isLoading,
    loadSounds,
    handleImportAudio,
    handleSoundVolumeChange,
    handleRemoveSound,
    handleRemoveAllSounds,
    handleSetStartPosition,
    handleSetHotkey,
    handleSetCategories,
  };
}; 