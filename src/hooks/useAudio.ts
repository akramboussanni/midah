import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AudioDevice } from '../types';

export const useAudio = (showAllOutputDevices: boolean = false) => {
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedVirtualDevice, setSelectedVirtualDevice] = useState<string>('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>('');
  const [virtualVolume, setVirtualVolume] = useState(1.0);
  const [outputVolume, setOutputVolume] = useState(1.0);
  const [inputVolume, setInputVolume] = useState(1.0);
  const [isInputCapturing, setIsInputCapturing] = useState(false);
  const [playingSounds, setPlayingSounds] = useState<Set<string>>(new Set());
  const [localOnlySounds, setLocalOnlySounds] = useState<Set<string>>(new Set());

  const loadAudioDevices = async () => {
    try {
      const devices = await invoke<AudioDevice[]>('get_audio_devices');
      
      // Filter devices based on showAllOutputDevices setting
      const filteredDevices = showAllOutputDevices 
        ? devices 
        : devices.filter(d => d.device_type === 'virtual');
      
      setAudioDevices(filteredDevices);
      
      // Look for VB-Cable device for virtual device
      const vbCableDevice = devices.find(d => 
        d.device_type === 'virtual' && (
          d.name.toLowerCase().includes('cable') || 
          d.name.toLowerCase().includes('vb-audio') || 
          d.name.toLowerCase().includes('virtual')
        )
      );
      if (vbCableDevice) {
        setSelectedVirtualDevice(vbCableDevice.name);
      }
      
      // Set default device for output
      const defaultOutputDevice = devices.find(d => d.device_type === 'output' && d.is_default);
      if (defaultOutputDevice) {
        setSelectedOutputDevice(defaultOutputDevice.name);
      }

      // Set default device for input
      const defaultInputDevice = devices.find(d => d.device_type === 'input' && d.is_default);
      if (defaultInputDevice) {
        setSelectedInputDevice(defaultInputDevice.name);
      }
    } catch (error) {
      console.error('Failed to load audio devices:', error);
    }
  };

  const loadVolume = async () => {
    try {
      const [virtualVol, outputVol] = await Promise.all([
        invoke<number>('get_virtual_volume'),
        invoke<number>('get_output_volume'),
      ]);
      setVirtualVolume(virtualVol);
      setOutputVolume(outputVol);
    } catch (error) {
      console.error('Failed to load volume:', error);
    }
  };

  const handlePlaySound = async (soundId: string, localOnly: boolean = false, concurrentAudio: boolean = true) => {
    try {
      console.log('Playing sound:', soundId, localOnly ? '(local only)' : '', concurrentAudio ? '(concurrent)' : '(single)');
      
      // If concurrent audio is disabled, stop all other sounds first
      if (!concurrentAudio && playingSounds.size > 0) {
        console.log('Stopping all sounds before playing new one (concurrent audio disabled)');
        await invoke('stop_all_sounds');
        setPlayingSounds(() => {
          return new Set();
        });
        setLocalOnlySounds(new Set());
      }
      
      if (localOnly) {
        const result = await invoke('play_sound_local', { id: soundId });
        console.log('Local play result:', result);
        setPlayingSounds(prev => new Set(prev).add(soundId));
        setLocalOnlySounds(prev => new Set(prev).add(soundId));
      } else {
        const result = await invoke('play_sound', { id: soundId });
        console.log('Play result:', result);
        setPlayingSounds(prev => new Set(prev).add(soundId));
        setLocalOnlySounds(prev => {
          const newSet = new Set(prev);
          newSet.delete(soundId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Failed to play sound:', error);
    }
  };

  const handleStopSound = async (soundId: string) => {
    try {
      await invoke('stop_sound', { id: soundId });
      setPlayingSounds(prev => {
        const newSet = new Set(prev);
        newSet.delete(soundId);
        return newSet;
      });
      setLocalOnlySounds(prev => {
        const newSet = new Set(prev);
        newSet.delete(soundId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to stop sound:', error);
    }
  };

  const handleStopAllSounds = async () => {
    try {
      await invoke('stop_all_sounds');
      setPlayingSounds(new Set());
      setLocalOnlySounds(new Set());
    } catch (error) {
      console.error('Failed to stop all sounds:', error);
    }
  };

  const handleSeekSound = async (soundId: string, position: number) => {
    try {
      const isLocalOnly = localOnlySounds.has(soundId);
      await invoke('seek_sound', { id: soundId, position, localOnly: isLocalOnly });
      console.log('Seeked sound:', soundId, 'to position:', position, 'local_only:', isLocalOnly);
    } catch (error) {
      console.error('Failed to seek sound:', error);
    }
  };

  const getPlaybackPosition = async (soundId: string): Promise<number | null> => {
    try {
      const position = await invoke<number | null>('get_playback_position', { soundId });
      return position;
    } catch (error) {
      console.error('Failed to get playback position:', error);
      return null;
    }
  };

  const handleVirtualVolumeChange = async (newVolume: number) => {
    try {
      await invoke('set_virtual_volume', { volume: newVolume });
      setVirtualVolume(newVolume);
      // Update device volumes for all currently playing sounds
      await invoke('update_device_volumes_command');
    } catch (error) {
      console.error('Failed to set virtual volume:', error);
    }
  };

  const handleOutputVolumeChange = async (newVolume: number) => {
    try {
      console.log("set output vol");
      await invoke('set_output_volume', { volume: newVolume });
      setOutputVolume(newVolume);
      // Update device volumes for all currently playing sounds
      await invoke('update_device_volumes_command');
    } catch (error) {
      console.error('Failed to set output volume:', error);
    }
  };

  const handleVirtualDeviceChange = async (deviceName: string) => {
    try {
      await invoke('set_virtual_device', { deviceName });
      setSelectedVirtualDevice(deviceName);
    } catch (error) {
      console.error('Failed to set virtual device:', error);
    }
  };

  const handleOutputDeviceChange = async (deviceName: string) => {
    try {
      await invoke('set_output_device', { deviceName });
      setSelectedOutputDevice(deviceName);
    } catch (error) {
      console.error('Failed to set output device:', error);
    }
  };

  const handleInputDeviceChange = async (deviceName: string) => {
    try {
      await invoke('set_input_device', { deviceName });
      setSelectedInputDevice(deviceName);
    } catch (error) {
      console.error('Failed to set input device:', error);
    }
  };

  const handleInputVolumeChange = async (newVolume: number) => {
    try {
      await invoke('set_input_volume', { volume: newVolume });
      setInputVolume(newVolume);
    } catch (error) {
      console.error('Failed to set input volume:', error);
    }
  };

  const handleStopInputCapture = async () => {
    try {
      await invoke('stop_input_capture');
      setIsInputCapturing(false);
    } catch (error) {
      console.error('Failed to stop input capture:', error);
    }
  };

  const debugAudioStatus = async () => {
    try {
      const status = await invoke<string>('get_audio_status');
      console.log('Audio Status:', status);
    } catch (error) {
      console.error('Failed to get audio status:', error);
    }
  };

  // Poll for playing status to detect when sounds finish naturally
  useEffect(() => {
    if (playingSounds.size === 0) return;

    const interval = setInterval(async () => {
      try {
        // Get the list of currently playing sounds from the backend
        const currentlyPlaying = await invoke<string[]>('get_playing_sounds');
        console.log('Currently playing sounds:', currentlyPlaying);
        
        // Update the playing sounds state based on what's actually playing
        setPlayingSounds(() => {
          const newSet = new Set(currentlyPlaying);
          return newSet;
        });
        
        // Also update local only sounds
        setLocalOnlySounds(() => {
          // Note: We can't distinguish local vs normal playback from the backend
          // so we'll keep the local only state as is for now
          return new Set();
        });
      } catch (error) {
        console.error('Failed to check playing sounds:', error);
      }
    }, 500); // Check every 500ms for more responsive updates

    return () => clearInterval(interval);
  }, [playingSounds]);

  useEffect(() => {
    loadAudioDevices();
    loadVolume();
  }, [showAllOutputDevices]);

  // Debug function to log playback position for a given soundId
  const debugPlaybackPosition = async (soundId: string) => {
    try {
      const pos = await getPlaybackPosition(soundId);
      console.log(`Playback position for ${soundId}:`, pos);
    } catch (error) {
      console.error('Failed to get playback position:', error);
    }
  };

  // Check for virtual cable (VB-Cable or Voicemod)
  const checkVirtualCable = async () => {
    try {
      const result = await invoke('check_virtual_cable');
      console.log('Virtual cable status:', result);
      return result;
    } catch (error) {
      console.error('Failed to check virtual cable:', error);
      return null;
    }
  };

  // Install VB-Cable (Windows only)
  const installVirtualCable = async () => {
    try {
      const result = await invoke('install_virtual_cable');
      console.log('Install VB-Cable result:', result);
      return result;
    } catch (error) {
      console.error('Failed to install VB-Cable:', error);
      return null;
    }
  };

  return {
    audioDevices,
    selectedVirtualDevice,
    selectedOutputDevice,
    selectedInputDevice,
    virtualVolume,
    outputVolume,
    inputVolume,
    isInputCapturing,
    playingSounds,
    localOnlySounds,
    handlePlaySound,
    handleStopSound,
    handleStopAllSounds,
    handleSeekSound,
    getPlaybackPosition,
    handleVirtualVolumeChange,
    debugPlaybackPosition,
    handleOutputVolumeChange,
    handleInputVolumeChange,
    handleVirtualDeviceChange,
    handleOutputDeviceChange,
    handleInputDeviceChange,
    handleStopInputCapture,
    debugAudioStatus,
    checkVirtualCable,
    installVirtualCable,
  };
}; 