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
      
            setAudioDevices(devices);
      
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
      
      const defaultOutputDevice = devices.find(d => d.device_type === 'output' && d.is_default);
      if (defaultOutputDevice) {
        setSelectedOutputDevice(defaultOutputDevice.name);
      }

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

  const loadCaptureSetting = async () => {
    try {
      const value = await invoke<string | null>('get_setting', { key: 'capture_input' });
      const enabled = value === 'true';
      setIsInputCapturing(enabled);
      if (enabled) {
        try { await invoke('start_input_capture'); } catch (e) { console.error('Failed to start input capture on load:', e); }
      }
    } catch (error) {
      console.error('Failed to load capture setting:', error);
    }
  };

  const handlePlaySound = async (soundId: string, localOnly: boolean = false, concurrentAudio: boolean = true) => {
    try {
      console.log('Playing sound:', soundId, localOnly ? '(local only)' : '', concurrentAudio ? '(concurrent)' : '(single)');
      
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
      if (isInputCapturing) {
        try { await invoke('start_input_capture'); } catch (e) { console.error('Failed to restart input capture:', e); }
      }
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
      try { await invoke('save_setting', { key: 'capture_input', value: 'false' }); } catch {}
    } catch (error) {
      console.error('Failed to stop input capture:', error);
    }
  };

  const handleStartInputCapture = async () => {
    try {
      await invoke('start_input_capture');
      setIsInputCapturing(true);
      try { await invoke('save_setting', { key: 'capture_input', value: 'true' }); } catch {}
    } catch (error) {
      console.error('Failed to start input capture:', error);
    }
  };

  const handleToggleInputCapture = async (on: boolean) => {
    if (on) {
      await handleStartInputCapture();
    } else {
      await handleStopInputCapture();
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


  useEffect(() => {
    if (playingSounds.size === 0) return;

    const interval = setInterval(async () => {
      try {

        const currentlyPlaying = await invoke<string[]>('get_playing_sounds');
        console.log('Currently playing sounds:', currentlyPlaying);
        

        setPlayingSounds(() => {
          const newSet = new Set(currentlyPlaying);
          return newSet;
        });
        
        setLocalOnlySounds(prev => {
          const newLocalOnlySet = new Set<string>();
          for (const soundId of currentlyPlaying) {
            if (prev.has(soundId)) {
              newLocalOnlySet.add(soundId);
            }
          }
          return newLocalOnlySet;
        });
      } catch (error) {
        console.error('Failed to check playing sounds:', error);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playingSounds]);

  useEffect(() => {
    loadAudioDevices();
    loadVolume();
    loadCaptureSetting();
  }, [showAllOutputDevices]);


  const debugPlaybackPosition = async (soundId: string) => {
    try {
      const pos = await getPlaybackPosition(soundId);
      console.log(`Playback position for ${soundId}:`, pos);
    } catch (error) {
      console.error('Failed to get playback position:', error);
    }
  };


  const checkVirtualAudio = async () => {
    try {
      const result = await invoke('check_virtual_audio_status');
      console.log('Virtual audio status:', result);
      return result;
    } catch (error) {
      console.error('Failed to check virtual audio:', error);
      return null;
    }
  };
  
  // Backwards compatibility
  const checkVirtualCable = async () => {
    return await checkVirtualAudio();
  };


  const getVirtualDevices = () => {
    return showAllOutputDevices 
      ? audioDevices 
      : audioDevices.filter(d => d.device_type === 'virtual');
  };

  const getOutputDevices = () => {
    return showAllOutputDevices 
      ? audioDevices 
      : audioDevices.filter(d => d.device_type === 'output');
  };


  const setupVirtualAudio = async () => {
    try {
      const result = await invoke('setup_virtual_audio');
      console.log('Setup virtual audio result:', result);
      return result;
    } catch (error) {
      console.error('Failed to setup virtual audio:', error);
      return null;
    }
  };
  
  // Backwards compatibility
  const installVirtualCable = async () => {
    return await setupVirtualAudio();
  };

  return {
    audioDevices,
    getVirtualDevices,
    getOutputDevices,
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
    handleStartInputCapture,
    handleToggleInputCapture,
    debugAudioStatus,
    checkVirtualAudio,
    setupVirtualAudio,
    checkVirtualCable,
    installVirtualCable,
  };
}; 