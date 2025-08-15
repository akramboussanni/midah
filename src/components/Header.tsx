import { Music, Sparkles, Mic, Volume2, Minus, X, Maximize2, Minimize2, MessageCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUpdater } from '../hooks/useUpdater';

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
  const [appVersion, setAppVersion] = useState<string>('0.0.0');
  const { update, visible, dismiss, progress } = useUpdater();
  const [showDialog, setShowDialog] = useState(false);


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
    <header className="glass border-b border-gray-800 sticky top-0 z-50" style={{ background: '#0a0d13' }}>

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
        <div className="flex items-center space-x-2">
          <button
            onClick={async () => {
              try {
                await invoke('open_browser', { url: 'https://discord.gg/9sj6EX8Usw' });
              } catch (error) {
                console.error('Failed to open Discord link:', error);
              }
            }}
            className="px-2 py-0.5 text-xs font-mono bg-indigo-600 hover:bg-indigo-500 text-white rounded mr-1 flex items-center space-x-1"
            data-tauri-drag-region="none"
            title="Join our Discord server"
          >
            <MessageCircle className="h-3 w-3" />
            <span>Discord</span>
          </button>
          {visible && update && (
            <button
              onClick={() => setShowDialog(true)}
              className="px-2 py-0.5 text-xs font-mono bg-blue-700 hover:bg-blue-600 text-white rounded mr-1"
              data-tauri-drag-region="none"
              title={update.is_linux ? `New version v${update.version} available` : `Update to v${update.version}`}
            >
              {update.is_linux ? `New v${update.version}` : `Update v${update.version}`}
            </button>
          )}
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

            <button
              onClick={onStopAllSounds}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors duration-200 text-sm font-mono"
            >
              Stop All
            </button>


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
      {showDialog && update && typeof document !== 'undefined' && createPortal(
        (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center" data-tauri-drag-region="none">
            <div className="absolute inset-0 bg-black/70" onClick={() => { setShowDialog(false); }} />
            <div className="relative bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-mono font-semibold">Update v{update.version}</h3>
                <button onClick={() => { setShowDialog(false); dismiss(); }} className="text-gray-400 hover:text-gray-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-3 rounded bg-gray-800/40 border border-gray-700">
                <pre className="whitespace-pre-wrap break-words text-xs font-mono text-gray-200">{update.changelog}</pre>
              </div>
              {update.is_linux && (
                <div className="mt-3 p-3 rounded bg-blue-900/20 border border-blue-800/30">
                  <p className="text-xs text-blue-200 font-mono">
                    Click "View Release" to see the latest version and download instructions. Autoinstaller is not available on Linux.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 justify-end">
                <button onClick={() => { setShowDialog(false); dismiss(); }} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded font-mono">
                  Later
                </button>
                {update.is_linux ? (
                  <button
                    onClick={async () => {
                      try {
                        if (update.github_release_url) {
                          await invoke('open_browser', { url: update.github_release_url });
                        }
                      } catch (e) {
                        console.error('Failed to open GitHub release:', e);
                        alert(`Failed to open GitHub release: ${e}`);
                      }
                    }}
                    className="px-3 py-1 text-xs rounded font-mono text-white bg-blue-700 hover:bg-blue-600"
                  >
                    View Release
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        if (update.msi_url) {
                          await invoke('download_and_install_update', { msiUrl: update.msi_url });
                        }
                      } catch (e) {
                        console.error('Failed to update:', e);
                        alert(`Failed to start update: ${e}`);
                      }
                    }}
                    disabled={['downloading','launching','launched'].includes(progress?.status || '')}
                    className={`px-3 py-1 text-xs rounded font-mono text-white ${
                      ['downloading','launching','launched'].includes(progress?.status || '')
                        ? 'bg-blue-900 cursor-not-allowed'
                        : 'bg-blue-700 hover:bg-blue-600'
                    }`}
                  >
                                         {progress?.status === 'downloading'
                       ? 'Downloading...'
                      : progress?.status === 'launching'
                      ? 'Launching...'
                      : progress?.status === 'launched'
                      ? 'Installer launched'
                      : 'Update Now'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ),
        document.body
      )}
    </header>
  );
}; 