import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Sound } from '../types';

export const useSounds = () => {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      // Clamp volume to valid range
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      
      // Update local state immediately for responsive UI
      setSounds(prevSounds => 
        prevSounds.map(sound => 
          sound.id === soundId 
            ? { ...sound, volume: clampedVolume }
            : sound
        )
      );
      
      // Update backend immediately for responsive volume feedback
      const result = await invoke('update_sound_volume', { id: soundId, volume: clampedVolume });
      console.log('Volume update result:', result);
      
    } catch (error) {
      console.error('Failed to update sound volume:', error);
      // Revert local state on error
      setSounds(prevSounds => 
        prevSounds.map(sound => 
          sound.id === soundId 
            ? { ...sound, volume: sound.volume } // Keep original volume
            : sound
        )
      );
    }
  }, []);

  const handleRemoveSound = async (soundId: string) => {
    try {
      console.log('Removing sound:', soundId);
      
      // Remove the sound from the database
      const result = await invoke('remove_sound', { id: soundId });
      console.log('Remove result:', result);
      
      // Update the local state
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
      
      // Update the sound start position in the database
      const result = await invoke('update_sound_start_position', { id: soundId, startPosition: position });
      console.log('Start position update result:', result);
      
      // Update the local state
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

  const handleSetHotkey = async (soundId: string, hotkey: string) => {
    try {
      console.log('Setting hotkey for sound:', soundId, 'to:', hotkey);
      const result = await invoke('update_sound_hotkey', { id: soundId, hotkey: hotkey || null });
      console.log('Hotkey update result:', result);
      setSounds(prevSounds =>
        prevSounds.map(sound =>
          sound.id === soundId
            ? { ...sound, hotkey }
            : sound
        )
      );
      console.log('Hotkey updated successfully');
    } catch (error) {
      console.error('Failed to update sound hotkey:', error);
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
  };
}; 