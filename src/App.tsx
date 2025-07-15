import { useState, useEffect } from 'react';
import { Search, Plus, Code, Music, Volume2, ChevronDown, Key, Eye, EyeOff } from 'lucide-react';
import { TabType, AudioDevice } from './types';
import { useAudio } from './hooks/useAudio';
import { useSounds } from './hooks/useSounds';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { SoundCard } from './components/SoundCard';
import { YouTubeSearch } from './components/YouTubeSearch';
import { invoke } from '@tauri-apps/api/core';
import { DependencyProvider } from './contexts/DependencyContext';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('sounds');
  const [virtualSectionOpen, setVirtualSectionOpen] = useState(false);
  const [outputSectionOpen, setOutputSectionOpen] = useState(false);
  const [debugSectionOpen, setDebugSectionOpen] = useState(false);
  const [concurrentAudio, setConcurrentAudio] = useState(true);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showVbCablePrompt, setShowVbCablePrompt] = useState(false);
  const [vbCableInstallPressed, setVbCableInstallPressed] = useState(false);
  const [showAllOutputDevices, setShowAllOutputDevices] = useState(false);

  const {
    audioDevices,
    selectedVirtualDevice,
    selectedOutputDevice,
    virtualVolume,
    outputVolume,
    playingSounds,
    localOnlySounds,
    handlePlaySound,
    handleStopSound,
    handleStopAllSounds,
    handleSeekSound,
    getPlaybackPosition,
    handleVirtualVolumeChange,
    handleOutputVolumeChange,
    handleVirtualDeviceChange,
    handleOutputDeviceChange,
    debugAudioStatus,
  } = useAudio(showAllOutputDevices);

  const {
    sounds,
    isLoading,
    loadSounds,
    handleImportAudio,
    handleSoundVolumeChange,
    handleRemoveSound,
    handleRemoveAllSounds,
    handleSetStartPosition,
    handleSetHotkey,
  } = useSounds();

  const filteredSounds = sounds.filter(sound =>
    sound.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add debug function to global scope for console access
  (window as any).debugAudioStatus = debugAudioStatus;

  // Load YouTube API key on component mount
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

  // Save YouTube API key
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

  // Load API key when settings tab is opened
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'settings' && !youtubeApiKey && !isLoadingApiKey) {
      loadYoutubeApiKey();
    }
  };

  // Load settings on component mount
  useEffect(() => {
    loadYoutubeApiKey();
    loadConcurrentAudioSetting();
    loadShowAllOutputDevicesSetting();
  }, []);

  // Check for virtual devices and show VB-Cable prompt if none found
  useEffect(() => {
    // Get all devices (not filtered) to check for virtual devices
    const checkForVirtualDevices = async () => {
      try {
        const allDevices = await invoke<AudioDevice[]>('get_audio_devices');
        const virtualDevices = allDevices.filter(d => d.device_type === 'virtual');
        
        if (virtualDevices.length === 0 && !showVbCablePrompt && !showAllOutputDevices) {
          setShowVbCablePrompt(true);
        } else if (virtualDevices.length > 0) {
          // Reset install pressed state when virtual device is found
          setVbCableInstallPressed(false);
          // Hide the prompt if virtual device is found
          setShowVbCablePrompt(false);
        }
      } catch (error) {
        console.error('Failed to check for virtual devices:', error);
      }
    };
    
    checkForVirtualDevices();
  }, [audioDevices, showVbCablePrompt, showAllOutputDevices]);

  // Load concurrent audio setting
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

  // Save concurrent audio setting
  const saveConcurrentAudioSetting = async (value: boolean) => {
    try {
      await invoke('save_setting', { key: 'concurrent_audio', value: value.toString() });
    } catch (error) {
      console.error('Failed to save concurrent audio setting:', error);
    }
  };

  // Handle concurrent audio change
  const handleConcurrentAudioChange = (value: boolean) => {
    setConcurrentAudio(value);
    saveConcurrentAudioSetting(value);
  };

  // Load show all output devices setting
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

  // Save show all output devices setting
  const saveShowAllOutputDevicesSetting = async (value: boolean) => {
    try {
      await invoke('save_setting', { key: 'show_all_output_devices', value: value.toString() });
    } catch (error) {
      console.error('Failed to save show all output devices setting:', error);
    }
  };

  // Handle show all output devices change
  const handleShowAllOutputDevicesChange = (value: boolean) => {
    setShowAllOutputDevices(value);
    saveShowAllOutputDevicesSetting(value);
  };



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
        
        {/* VB-Cable Installation Prompt */}
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

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8" style={{ background: 'rgba(10,13,19,0.98)' }}>
          {activeTab === 'sounds' && (
            <div className="space-y-8 fade-in">
              {/* Sounds Container */}
              <div style={{ background: 'rgba(10, 13, 19, 0.98)', borderRadius: '1rem', padding: '1rem' }}>
                {/* Search and Import */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4 flex-1 max-w-md">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10" />
                      <input
                        type="text"
                        placeholder="Search sounds..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 bg-[#090b10] text-white border border-gray-700 focus:border-gray-500 focus:ring-gray-500 placeholder-gray-500 rounded-lg py-3 transition-colors duration-200"
                        style={{ lineHeight: '1.5', minHeight: '48px' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

                  </div>
                </div>


                {/* Sounds Grid */}
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
                    onSetHotkey={handleSetHotkey}
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
          )}

          {activeTab === 'youtube' && (
            <div className="space-y-8 fade-in">
              <YouTubeSearch hasApiKey={!!youtubeApiKey} onSoundAdded={loadSounds} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8 max-w-2xl fade-in">
              <h2 className="text-xl font-semibold font-mono">Audio Settings</h2>
              
              {/* Concurrent Audio Setting */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-900 border border-gray-800 rounded-lg">
                  <Music className="h-5 w-5 text-gray-400" />
                  <span className="font-mono text-sm">Playback Settings</span>
                </div>
                
                <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <label className="text-sm font-medium font-mono">Concurrent Audio</label>
                      <p className="text-xs text-gray-400 font-mono">
                        Allow multiple sounds to play simultaneously
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={concurrentAudio}
                        onChange={(e) => handleConcurrentAudioChange(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Output Device Section */}
              <div className="space-y-4">
                <button
                  onClick={() => setOutputSectionOpen(!outputSectionOpen)}
                  className="flex items-center justify-between w-full p-4 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <Volume2 className="h-5 w-5 text-gray-400" />
                    <span className="font-mono text-sm">Output Device</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${outputSectionOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    outputSectionOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                    {/* Output Device Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium font-mono">Device</label>
                      <select
                        value={selectedOutputDevice}
                        onChange={(e) => handleOutputDeviceChange(e.target.value)}
                        className="input-modern w-full"
                      >
                        {audioDevices.filter(d => d.device_type === 'output').map((device) => (
                          <option key={device.name} value={device.name}>
                            {device.name} {device.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 font-mono">
                        Select the speaker/headphone device for output
                      </p>
                    </div>

                    {/* Output Volume */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium font-mono">Volume</label>
                      <div className="flex items-center space-x-4">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={outputVolume}
                          onChange={(e) => handleOutputVolumeChange(parseFloat(e.target.value))}
                          className="flex-1 accent-white"
                        />
                        <span className="text-sm text-gray-400 w-12 font-mono">
                          {Math.round(outputVolume * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>



              {/* Advanced Settings Section */}
              <div className="space-y-4">
                <button
                  onClick={() => setVirtualSectionOpen(!virtualSectionOpen)}
                  className="flex items-center justify-between w-full p-4 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <Music className="h-5 w-5 text-gray-400" />
                    <span className="font-mono text-sm">Advanced Settings</span>
                    <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded font-mono">Advanced</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${virtualSectionOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    virtualSectionOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                    {/* Virtual Cable Settings */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Music className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium font-mono">Virtual Cable</span>
                      </div>
                      
                      {/* Virtual Device Selection */}
                      <div className="space-y-3">
                        <label className="text-sm font-medium font-mono">Device</label>
                      <select
                        value={selectedVirtualDevice}
                        onChange={(e) => handleVirtualDeviceChange(e.target.value)}
                        className="input-modern w-full"
                      >
                        {audioDevices.filter(d => d.device_type === 'virtual').map((device) => (
                          <option key={device.name} value={device.name}>
                            {device.name} {device.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 font-mono">
                        Select the virtual audio device for mixing
                      </p>
                    </div>

                    {/* Virtual Volume */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium font-mono">Volume</label>
                      <div className="flex items-center space-x-4">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={virtualVolume}
                          onChange={(e) => handleVirtualVolumeChange(parseFloat(e.target.value))}
                          className="flex-1 accent-white"
                        />
                        <span className="text-sm text-gray-400 w-12 font-mono">
                          {Math.round(virtualVolume * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>


                  </div>
                </div>
              </div>

              {/* YouTube API Key Section */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-900 border border-gray-800 rounded-lg">
                  <Key className="h-5 w-5 text-gray-400" />
                  <span className="font-mono text-sm">YouTube API</span>
                </div>
                
                <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                  <div className="space-y-3">
                    <label className="text-sm font-medium font-mono">API Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={youtubeApiKey}
                        onChange={(e) => setYoutubeApiKey(e.target.value)}
                        placeholder="Enter your YouTube Data API v3 key"
                        className="input-modern w-full pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                        title={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={saveYoutubeApiKey}
                        disabled={isLoadingApiKey || apiKeyStatus === 'saving'}
                        className={`px-4 py-2 rounded-lg font-mono text-sm transition-colors duration-200 ${
                          apiKeyStatus === 'saving' || isLoadingApiKey
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {apiKeyStatus === 'saving' ? 'Saving...' : 'Save API Key'}
                      </button>
                      
                      {apiKeyStatus === 'success' && (
                        <span className="text-green-400 text-sm font-mono">✓ Saved successfully</span>
                      )}
                      {apiKeyStatus === 'error' && (
                        <span className="text-red-400 text-sm font-mono">✗ Failed to save</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-mono">
                      Required for YouTube video search functionality. Get your API key from the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Management Section */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-900 border border-gray-800 rounded-lg">
                  <span className="text-red-400 font-mono text-sm">⚠️</span>
                  <span className="font-mono text-sm">Data Management</span>
                </div>
                
                <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="text-sm font-medium font-mono text-red-400">Remove All Sounds</label>
                        <p className="text-xs text-gray-400 font-mono">
                          Permanently delete all audio files from your soundboard. This action cannot be undone.
                        </p>
                      </div>
                      <button
                        onClick={handleRemoveAllSounds}
                        className="bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-lg font-mono text-sm transition-colors duration-200"
                      >
                        Remove All
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Debug Section */}
              <div className="space-y-4">
                <button
                  onClick={() => setDebugSectionOpen(!debugSectionOpen)}
                  className="flex items-center justify-between w-full p-4 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <Code className="h-5 w-5 text-gray-400" />
                    <span className="font-mono text-sm">Debug</span>
                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-mono">Developer</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${debugSectionOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    debugSectionOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                    <div className="space-y-2">
                      <button
                        onClick={debugAudioStatus}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-mono text-sm transition-colors"
                      >
                        Debug Audio Status
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const result = await invoke('list_all_devices');
                            console.log('All audio devices:', result);
                            alert('Device list logged to console. Check the developer console for details.');
                          } catch (error) {
                            console.error('Failed to list devices:', error);
                            alert(`Failed to list devices: ${error}`);
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-mono text-sm transition-colors"
                      >
                        List All Devices
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">
                      Check the console for detailed audio system information
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </DependencyProvider>
  );
}

export default App; 