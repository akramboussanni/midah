import { Music, Sparkles, Mic, Volume2, Minus, X, Maximize2, Minimize2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface HeaderProps {
  virtualVolume: number;
  outputVolume: number;
  onVirtualVolumeChange: (volume: number) => void;
  onOutputVolumeChange: (volume: number) => void;
  onStopAllSounds: () => void;
}

export const Header = ({
  virtualVolume,
  outputVolume,
  onVirtualVolumeChange,
  onOutputVolumeChange,
  onStopAllSounds,
}: HeaderProps) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('0.1.0');

  // Fetch app version on component mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await invoke<string>('get_app_version');
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };
    
    fetchVersion();
  }, []);

  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      await invoke('toggle_maximize');
      setIsMaximized(!isMaximized);
    } catch (error) {
      console.error('Failed to toggle maximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      await invoke('close_window');
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <header className="glass border-b border-gray-800 sticky top-0 z-50" style={{ background: '#090b10' }}>
      {/* Title Bar - Draggable */}
      <div 
        className="h-8 border-b border-gray-800 flex items-center justify-between px-4 cursor-move"
        style={{ background: '#090b10' }}
        data-tauri-drag-region
      >
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Music className="h-4 w-4 text-white" />
            <Sparkles className="h-2 w-2 text-white absolute -top-0.5 -right-0.5 animate-pulse" />
          </div>
          <span className="text-sm font-mono text-gray-300">Midah Soundboard</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={handleMinimize}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors duration-200"
            title="Minimize"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors duration-200"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 rounded transition-colors duration-200"
            title="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Main Header Content */}
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Music className="h-8 w-8 text-white" />
              <Sparkles className="h-4 w-4 text-white absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">midah</h1>
              <p className="text-xs text-gray-400 font-mono">v{appVersion}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Stop All Sounds Button */}
            <button
              onClick={onStopAllSounds}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors duration-200 text-sm font-mono"
            >
              Stop All
            </button>

            {/* Virtual Device Volume Control */}
            <div className="flex items-center space-x-3">
              <Mic className="h-4 w-4 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={virtualVolume}
                onChange={(e) => onVirtualVolumeChange(parseFloat(e.target.value))}
                className="w-20 accent-white"
              />
              <span className="text-xs text-gray-400 font-mono w-8">
                {Math.round(virtualVolume * 100)}%
              </span>
            </div>

            {/* Output Device Volume Control */}
            <div className="flex items-center space-x-3">
              <Volume2 className="h-4 w-4 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={outputVolume}
                onChange={(e) => onOutputVolumeChange(parseFloat(e.target.value))}
                className="w-20 accent-white"
              />
              <span className="text-xs text-gray-400 font-mono w-8">
                {Math.round(outputVolume * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}; 