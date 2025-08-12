import { useState, useEffect } from 'react';
import { Search, Plus, Code, Music, StopCircle, X, HelpCircle } from 'lucide-react';
import { TabType, AudioDevice, Hotkey } from './types';
import { useAudio } from './hooks/useAudio';
import { useSounds } from './hooks/useSounds';
import { useHotkeys } from './hooks/useHotkeys';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { SoundCard } from './components/SoundCard';
import { CategorySidebar } from './components/CategorySidebar';
import { YouTubeSearch } from './components/YouTubeSearch';
import { invoke } from '@tauri-apps/api/core';
import { DependencyProvider } from './contexts/DependencyContext';
import { HotkeyInput } from './components/HotkeyInput';
import { HotkeySetting } from './components/HotkeySetting';
import { listen } from '@tauri-apps/api/event';



function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('sounds');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [concurrentAudio, setConcurrentAudio] = useState(true);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showVbCablePrompt, setShowVbCablePrompt] = useState(false);
  const [vbCableInstallPressed, setVbCableInstallPressed] = useState(false);
  const [showAllOutputDevices, setShowAllOutputDevices] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'devices' | 'general' | 'hotkeys'>('devices');
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showCaptureInfoDialog, setShowCaptureInfoDialog] = useState(false);

  const {
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
    handleOutputVolumeChange,
    handleInputVolumeChange,
    handleVirtualDeviceChange,
    handleOutputDeviceChange,
    handleInputDeviceChange,
    handleToggleInputCapture,
    debugAudioStatus,
  } = useAudio(showAllOutputDevices);

  const {
    sounds: rawSounds,
    isLoading,
    loadSounds,
    handleImportAudio,
    handleSoundVolumeChange,
    handleRemoveSound,

    handleSetStartPosition,
    handleSetHotkey,
    handleSetCategories,
  } = useSounds();
  const sounds = rawSounds.map(normalizeSoundHotkey);

  const {
    loading: hotkeysLoading,
    error: hotkeysError,
    getGlobalStopHotkey,
    reloadBindings: reloadHotkeyBindings,
  } = useHotkeys();

  const filteredSounds = sounds.filter(sound => {
    const matchesSearch = sound.name.toLowerCase().includes(searchQuery.toLowerCase());
    const categoriesList = sound.categories && sound.categories.length > 0
      ? sound.categories
      : (sound.category ? [sound.category] : []);
    const normalizedList = categoriesList.length > 0 ? categoriesList : ['Uncategorized'];
    const matchesCategory = selectedCategory === 'All' || normalizedList.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const categorySet = new Set<string>();
  for (const s of sounds) {
    const list = s.categories && s.categories.length > 0 ? s.categories : (s.category ? [s.category] : []);
    if (list.length === 0) categorySet.add('Uncategorized');
    for (const c of list) categorySet.add(c || 'Uncategorized');
  }
  const categories = Array.from(categorySet).sort();
  const soundCounts = categories.reduce((acc, category) => {
    acc[category] = sounds.filter(s => {
      const list = s.categories && s.categories.length > 0 ? s.categories : (s.category ? [s.category] : []);
      const normalized = list.length > 0 ? list : ['Uncategorized'];
      return normalized.includes(category);
    }).length;
    return acc;
  }, {} as Record<string, number>);
  soundCounts['All'] = sounds.length;

  (window as any).debugAudioStatus = debugAudioStatus;

  const loadYoutubeApiKey = async () => {
    setIsLoadingApiKey(true);
    try {
      const apiKey = await invoke<string | null>('get_youtube_api_key');
      setYoutubeApiKey(apiKey || '');
    } catch (error) {
      console.error('Failed to load YouTube API key:', error);
    } finally {
      setIsLoadingApiKey(false);
    }
  };

  const saveYoutubeApiKey = async () => {
    setApiKeyStatus('saving');
    try {
      await invoke('update_youtube_api_key', { apiKey: youtubeApiKey });
      setApiKeyStatus('success');
      setTimeout(() => setApiKeyStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save YouTube API key:', error);
      setApiKeyStatus('error');
      setTimeout(() => setApiKeyStatus('idle'), 3000);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'settings') {
      if (!youtubeApiKey && !isLoadingApiKey) {
        loadYoutubeApiKey();
      }
      if (settingsTab === 'hotkeys') {
        reloadHotkeyBindings();
      }
    }
  };

  useEffect(() => {
    loadYoutubeApiKey();
    loadConcurrentAudioSetting();
    loadShowAllOutputDevicesSetting();
  }, []);

  useEffect(() => {
    const unlistenPlay = listen<string>('hotkey-play-sound', (event) => {
      const soundId = event.payload;
      console.log('[frontend] Received hotkey-play-sound event:', event);
      handlePlaySound(soundId);
    });

    const unlistenStop = listen('hotkey-stop-all-sounds', (event) => {
      console.log('[frontend] Received hotkey-stop-all-sounds event:', event);
      handleStopAllSounds();
    });

    return () => {
      unlistenPlay.then(f => f());
      unlistenStop.then(f => f());
    };
  }, [handlePlaySound, handleStopAllSounds]);



  useEffect(() => {
    const checkForVirtualDevices = async () => {
      try {
        const allDevices = await invoke<AudioDevice[]>('get_audio_devices');
        const virtualDevices = allDevices.filter(d => d.device_type === 'virtual');
        
        if (virtualDevices.length === 0 && !showVbCablePrompt && !showAllOutputDevices) {
          setShowVbCablePrompt(true);
        } else if (virtualDevices.length > 0) {
          setVbCableInstallPressed(false);
          setShowVbCablePrompt(false);
        }
      } catch (error) {
        console.error('Failed to check for virtual devices:', error);
      }
    };
    
    checkForVirtualDevices();
  }, [audioDevices, showVbCablePrompt, showAllOutputDevices]);

  const loadConcurrentAudioSetting = async () => {
    try {
      const setting = await invoke<string | null>('get_setting', { key: 'concurrent_audio' });
      if (setting !== null) {
        setConcurrentAudio(setting === 'true');
      }
    } catch (error) {
      console.error('Failed to load concurrent audio setting:', error);
    }
  };

  const saveConcurrentAudioSetting = async (value: boolean) => {
    try {
      await invoke('save_setting', { key: 'concurrent_audio', value: value.toString() });
    } catch (error) {
      console.error('Failed to save concurrent audio setting:', error);
    }
  };

  const handleConcurrentAudioChange = (value: boolean) => {
    setConcurrentAudio(value);
    saveConcurrentAudioSetting(value);
  };

  const loadShowAllOutputDevicesSetting = async () => {
    try {
      const setting = await invoke<string | null>('get_setting', { key: 'show_all_output_devices' });
      if (setting !== null) {
        setShowAllOutputDevices(setting === 'true');
      }
    } catch (error) {
      console.error('Failed to load show all output devices setting:', error);
    }
  };

  const saveShowAllOutputDevicesSetting = async (value: boolean) => {
    try {
      await invoke('save_setting', { key: 'show_all_output_devices', value: value.toString() });
    } catch (error) {
      console.error('Failed to save show all output devices setting:', error);
    }
  };

  const handleShowAllOutputDevicesChange = (value: boolean) => {
    setShowAllOutputDevices(value);
    saveShowAllOutputDevicesSetting(value);
  };

  useEffect(() => {
    const unlistenPromise = listen<string>('play_sound_by_id', (event) => {
      const soundId = event.payload;
      if (soundId && handlePlaySound) {
        handlePlaySound(soundId, false, true);
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [handlePlaySound]);

  useEffect(() => {
    console.log('[debug] Sounds:', sounds.map(s => ({ id: s.id, name: s.name, hotkey: s.hotkey })));
  }, [sounds]);



  function normalizeSoundHotkey(sound: any): any {
    return {
      ...sound,
      hotkey: typeof sound.hotkey === 'string' ? undefined : sound.hotkey
    };
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="loading-dots">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <p className="text-gray-400 font-mono text-sm">Initializing soundboard...</p>
        </div>
      </div>
    );
  }

  const globalStopHotkeyRaw = getGlobalStopHotkey();
  const globalStopHotkey = globalStopHotkeyRaw ? parseHotkeyString(globalStopHotkeyRaw) : undefined;

  function parseHotkeyString(hotkey: string): Hotkey {
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

  return (
    <DependencyProvider>
      <div className="min-h-screen" style={{ background: 'rgba(10,13,19,0.98)' }}>
        <Header
          virtualVolume={virtualVolume}
          outputVolume={outputVolume}
          onVirtualVolumeChange={handleVirtualVolumeChange}
          onOutputVolumeChange={handleOutputVolumeChange}
          onStopAllSounds={handleStopAllSounds}
        />
        
        {showVbCablePrompt && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mx-6 mt-4">
            <div className="flex items-start space-x-3">
              <Music className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                {!vbCableInstallPressed ? (
                  <>
                    <h3 className="text-yellow-400 font-medium mb-1">Virtual Audio Device Required</h3>
                    <p className="text-yellow-300 text-sm mb-3">
                      No virtual audio device (like VB-Cable) was detected. This is required for the soundboard to work properly.
                    </p>
                    <div className="flex items-center space-x-4 mb-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={showAllOutputDevices}
                          onChange={(e) => handleShowAllOutputDevicesChange(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-yellow-400 focus:ring-yellow-500"
                        />
                        <span className="text-yellow-300 text-sm">Show all output devices</span>
                      </label>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={async () => {
                          try {
                            setVbCableInstallPressed(true);
                            await invoke('install_virtual_cable');
                          } catch (error) {
                            console.error('Failed to install VB-Cable:', error);
                            alert(`Failed to install VB-Cable: ${error}`);
                            setVbCableInstallPressed(false);
                          }
                        }}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Install VB-Cable
                      </button>
                      <button
                        onClick={() => setShowVbCablePrompt(false)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-yellow-400 font-medium mb-1">VB-Cable Installation Complete</h3>
                    <p className="text-yellow-300 text-sm mb-3">
                      If you installed VB-Cable, you may need to restart your computer for the virtual audio device to be detected. Please restart your computer and reopen the app.
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setShowVbCablePrompt(false)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

        <main className="flex h-screen pt-0" style={{ background: 'rgba(10,13,19,0.98)' }}>
          {activeTab === 'sounds' && (
            <div className="flex w-full">
              <CategorySidebar
                categories={categories}
                selectedCategory={selectedCategory}
                onCategorySelect={setSelectedCategory}
                soundCounts={soundCounts}
                onCreateCategory={(categoryName) => {
                  setSelectedCategory(categoryName);
                }}
              />
              <div className="flex-1 overflow-y-auto">
                <div className="container mx-auto px-6 py-8">
                  <div className="space-y-8 fade-in">
                    <div style={{ background: 'rgba(10, 13, 19, 0.98)', borderRadius: '1rem', padding: '1rem' }}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4 flex-1 max-w-md">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10" />
                      <input
                        type="text"
                        placeholder="Search sounds..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-12 bg-[#090b10] text-white border border-gray-700 focus:border-gray-500 focus:ring-gray-500 placeholder-gray-500 rounded-lg py-3 transition-colors duration-200"
                        style={{ lineHeight: '1.5', minHeight: '48px' }}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 hover:text-gray-300 transition-colors duration-200 z-10"
                          title="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isInputCapturing && (
                      <button
                        onClick={() => setShowHelpDialog(true)}
                        className="text-xs text-gray-400 hover:text-gray-200 font-mono mr-3"
                      >Nobody can hear me!</button>
                    )}
                    <div className="relative group">
                      <button
                        onClick={handleImportAudio}
                        className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors duration-200"
                        title="Import Audio"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 pointer-events-none">
                        Import audio
                      </div>
                    </div>
                    <button
                      onClick={handleStopAllSounds}
                      className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors duration-200"
                      title="Stop All Sounds"
                    >
                      <StopCircle className="h-5 w-5" />
                    </button>
                  </div>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSounds.map((sound, index) => (
                  <SoundCard
                    key={sound.id}
                    sound={sound}
                    isPlaying={playingSounds.has(sound.id)}
                    isPlayingLocalOnly={localOnlySounds.has(sound.id)}
                    onPlay={(soundId) => handlePlaySound(soundId, false, concurrentAudio)}
                    onStop={handleStopSound}
                    onVolumeChange={handleSoundVolumeChange}
                    onRemove={handleRemoveSound}
                    onPlayLocal={(soundId) => handlePlaySound(soundId, true, concurrentAudio)}
                    onSetStartPosition={handleSetStartPosition}
                    onSetHotkey={(soundId, hotkey) => {
                      if (typeof hotkey === 'string') return;
                      handleSetHotkey(soundId, hotkey);
                    }}
                    onSetCategories={handleSetCategories}
                    availableCategories={categories}
                    onSeek={handleSeekSound}
                    getPlaybackPosition={getPlaybackPosition}
                    index={index}
                  />
                ))}
              </div>

              {filteredSounds.length === 0 && (
                <div className="text-center py-16">
                  <div className="relative inline-block mb-6">
                    <Music className="h-16 w-16 text-gray-400 mx-auto" />
                    <Code className="h-6 w-6 text-white absolute -top-2 -right-2" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-400 mb-2 font-mono">
                    No sounds found
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Import some audio files to get started
                  </p>
                </div>
              )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCaptureInfoDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/70" onClick={() => setShowCaptureInfoDialog(false)}></div>
              <div className="relative bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-mono font-semibold">Capture Input</h3>
                  <button onClick={() => setShowCaptureInfoDialog(false)} className="text-gray-400 hover:text-gray-200">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-300 font-mono">
                  When enabled, your microphone is routed to the selected virtual output so other apps can hear you.
                </p>
                <p className="text-sm text-gray-400 font-mono">
                  Use Input Volume to control mic gain into the virtual output. Virtual Volume also affects the final level.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowCaptureInfoDialog(false)}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-mono"
                  >Got it</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'youtube' && (
            <div className="container mx-auto px-6 py-8">
              <div className="space-y-8 fade-in">
                <YouTubeSearch hasApiKey={!!youtubeApiKey} onSoundAdded={loadSounds} />
              </div>
            </div>
          )}

          {showHelpDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/70" onClick={() => setShowHelpDialog(false)}></div>
              <div className="relative bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-mono font-semibold">Enable mic routing</h3>
                  <button onClick={() => setShowHelpDialog(false)} className="text-gray-400 hover:text-gray-200">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-300 font-mono">Turn on Capture Input to route your microphone to the virtual output.</p>
                <ol className="list-decimal list-inside text-sm text-gray-300 font-mono space-y-1">
                  <li>Go to Settings → Devices.</li>
                  <li>Select your microphone under Input Device.</li>
                  <li>Toggle “Capture Input?” on and adjust Input Volume.</li>
                </ol>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-mono"
                  >Close</button>
                  <button
                    onClick={async () => { setShowHelpDialog(false); setActiveTab('settings'); setSettingsTab('devices'); }}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
                  >Open Settings</button>
                </div>
              </div>
            </div>
          )}

          

          {activeTab === 'settings' && (
            <div className="container mx-auto px-6 py-8">
              <div className="space-y-8 max-w-2xl fade-in">
              <div className="flex space-x-4 mb-6">
                <button onClick={() => setSettingsTab('devices')} className={`px-4 py-2 rounded font-mono text-sm ${settingsTab === 'devices' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-300'}`}>Devices</button>
                <button onClick={() => setSettingsTab('general')} className={`px-4 py-2 rounded font-mono text-sm ${settingsTab === 'general' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-300'}`}>General</button>
                <button onClick={() => {
                  setSettingsTab('hotkeys');
                  reloadHotkeyBindings();
                }} className={`px-4 py-2 rounded font-mono text-sm ${settingsTab === 'hotkeys' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-300'}`}>Hotkeys</button>
              </div>
              {settingsTab === 'devices' && (
                <>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">Output Device</h3>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-mono text-sm text-gray-300">Select Output Device</span>
                      <select
                        value={selectedOutputDevice}
                        onChange={e => handleOutputDeviceChange(e.target.value)}
                        className="rounded border-gray-600 bg-gray-700 text-white px-2 py-1"
                      >
                        {getOutputDevices().map(device => (
                          <option key={device.name} value={device.name}>{device.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="py-2">
                      <label className="block font-mono text-sm text-gray-300 mb-1">Output Volume</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={outputVolume}
                          onChange={e => handleOutputVolumeChange(parseFloat(e.target.value))}
                          className="w-full accent-white h-2 rounded-lg appearance-none bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ accentColor: 'white' }}
                        />
                        <span className="font-mono text-xs text-gray-100 min-w-[32px] text-right">{Math.round(outputVolume * 100)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">Input Device</h3>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-mono text-sm text-gray-300">Select Input Device</span>
                      <select
                        value={selectedInputDevice}
                        onChange={e => handleInputDeviceChange(e.target.value)}
                        className="rounded border-gray-600 bg-gray-700 text-white px-2 py-1"
                      >
                        {audioDevices.filter(d => d.device_type === 'input').map(device => (
                          <option key={device.name} value={device.name}>{device.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="py-2">
                      <label className="block font-mono text-sm text-gray-300 mb-1">Input Volume</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={inputVolume}
                          onChange={e => handleInputVolumeChange(parseFloat(e.target.value))}
                          className="w-full accent-white h-2 rounded-lg appearance-none bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ accentColor: 'white' }}
                        />
                        <span className="font-mono text-xs text-gray-100 min-w-[32px] text-right">{Math.round(inputVolume * 100)}%</span>
                      </div>
                    </div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={isInputCapturing}
                        onChange={e => handleToggleInputCapture(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-gray-300 text-sm font-mono">Capture Input?</span>
                      <button
                        type="button"
                        onClick={() => setShowCaptureInfoDialog(true)}
                        className="inline-flex items-center justify-center p-1 rounded hover:bg-gray-700"
                        title="What does this do?"
                      >
                        <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-200" />
                      </button>
                    </label>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4 mb-6">
                    <h3 className="text-lg font-mono font-semibold mb-2">Virtual Device</h3>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-mono text-sm text-gray-300">Select Virtual Device</span>
                      <select
                        value={selectedVirtualDevice}
                        onChange={e => handleVirtualDeviceChange(e.target.value)}
                        className="rounded border-gray-600 bg-gray-700 text-white px-2 py-1"
                      >
                        {getVirtualDevices().map(device => (
                          <option key={device.name} value={device.name}>{device.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="py-2">
                      <label className="block font-mono text-sm text-gray-300 mb-1">Virtual Volume</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={virtualVolume}
                          onChange={e => handleVirtualVolumeChange(parseFloat(e.target.value))}
                          className="w-full accent-white h-2 rounded-lg appearance-none bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ accentColor: 'white' }}
                        />
                        <span className="font-mono text-xs text-gray-100 min-w-[32px] text-right">{Math.round(virtualVolume * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {settingsTab === 'general' && (
                <>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">YouTube API Key</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={youtubeApiKey}
                        onChange={e => setYoutubeApiKey(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded font-mono"
                        placeholder="Enter YouTube API Key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="text-xs text-gray-400 hover:text-gray-300"
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                      <button
                        onClick={saveYoutubeApiKey}
                        disabled={isLoadingApiKey || apiKeyStatus === 'saving'}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
                      >
                        Save
                      </button>
                    </div>
                    {apiKeyStatus === 'success' && <span className="text-green-400 text-xs font-mono">Saved!</span>}
                    {apiKeyStatus === 'error' && <span className="text-red-400 text-xs font-mono">Failed to save</span>}
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">General Settings</h3>
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={concurrentAudio}
                          onChange={e => handleConcurrentAudioChange(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-gray-300 text-sm font-mono">Allow concurrent audio (multiple sounds at once)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={showAllOutputDevices}
                          onChange={e => handleShowAllOutputDevicesChange(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-gray-300 text-sm font-mono">Show all output devices</span>
                      </label>
                    </div>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">Debug</h3>
                    <button
                      onClick={debugAudioStatus}
                      className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-mono"
                    >
                      Debug Audio Status
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await invoke('test_hotkey', { hotkey: 'Ctrl+1' });
                        } catch (error) {
                          console.error('Failed to test hotkey:', error);
                        }
                      }}
                      className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-mono"
                    >
                      Test Hotkey (Ctrl+1)
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await invoke('update_yt_dlp');
                          console.log('yt-dlp update result:', result);
                          alert('yt-dlp updated successfully!');
                        } catch (error) {
                          console.error('Failed to update yt-dlp:', error);
                          alert(`Failed to update yt-dlp: ${error}`);
                        }
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-mono"
                    >
                      Update yt-dlp
                    </button>
                  </div>
                </>
              )}
              {settingsTab === 'hotkeys' && (
                <>
                  <div className="bg-gray-900/60 rounded-lg p-6 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-mono font-semibold mb-2">Hotkeys</h3>
                    {hotkeysError && (
                      <div className="text-red-400 text-sm font-mono">
                        Error: {hotkeysError}
                      </div>
                    )}
                    {hotkeysLoading && (
                      <div className="text-gray-400 text-sm font-mono">
                        Loading hotkeys...
                      </div>
                    )}
                    <div className="space-y-3">
                      <HotkeySetting
                        currentHotkey={globalStopHotkey}
                        onHotkeyChange={async (hotkey: Hotkey | null) => {
                          if (!hotkey) return;
                          try {
                            await invoke('register_global_stop_hotkey', { key: hotkey.key, modifiers: hotkey.modifiers });
                          } catch (e) {

                          }
                        }}
                      />
                    </div>
                    <div className="mt-6">
                      <h4 className="font-mono text-base font-semibold mb-2">Sound Hotkeys</h4>
                      <div className="divide-y divide-gray-800">
                        {sounds.map(sound => (
                          <div key={sound.id} className="flex items-center py-2 gap-3">
                            <span className="flex-1 truncate font-mono text-xs text-gray-400">{sound.name}</span>
                            <div style={{ minWidth: 0, flexShrink: 0 }}>
                              <HotkeyInput
                                value={typeof sound.hotkey === 'string' ? undefined : sound.hotkey}
                                onChange={(hotkey: Hotkey) => handleSetHotkey(sound.id, hotkey)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
          )}
        </main>
      </div>
    </DependencyProvider>
  );
}

export default App; 