import React, { useEffect, useState } from 'react';
import { X, Square } from 'lucide-react';
import { Sound } from '../types';
import { PlaybackProgress } from './PlaybackProgress';
import { VolumeSlider } from './VolumeSlider';

interface PlayingDrawerProps {
  open: boolean;
  onClose: () => void;
  soundsLookup: Map<string, Sound>;
  playingIds: string[];
  getPlaybackPosition?: (soundId: string) => Promise<number | null>;
  onSeek?: (soundId: string, position: number) => void;
  onStop?: (soundId: string) => void;
  onVolumeChange?: (soundId: string, volume: number) => void;
  onStopAll?: () => void;
}

export const PlayingDrawer: React.FC<PlayingDrawerProps> = ({ open, onClose, soundsLookup, playingIds, getPlaybackPosition, onSeek, onStop, onVolumeChange, onStopAll }) => {
  const [positions, setPositions] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !getPlaybackPosition || playingIds.length === 0) return;
    let mounted = true;
    const tick = async () => {
      if (!mounted) return;
      const updates: Record<string, number> = {};
      for (const id of playingIds) {
        try {
          const pos = await getPlaybackPosition(id);
          if (pos !== null) updates[id] = pos;
        } catch {}
      }
      if (mounted) setPositions(prev => ({ ...prev, ...updates }));
    };
    const interval = setInterval(tick, 100);
    tick();
    return () => { mounted = false; clearInterval(interval); };
  }, [open, playingIds.join('|'), getPlaybackPosition]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      )}
      <div className={`fixed top-0 right-0 h-full w-80 bg-[#0b0e14] border-l border-gray-800 transform transition-transform duration-200 z-50 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h3 className="text-sm font-mono text-gray-300">Now Playing</h3>
        <div className="flex items-center gap-2">
          {playingIds.length > 0 && onStopAll && (
            <button
              onClick={onStopAll}
              className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-mono"
            >
              Stop All
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800"><X className="h-4 w-4 text-gray-400" /></button>
        </div>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto h-full">
        {playingIds.length === 0 && (
          <div className="text-xs text-gray-500 font-mono">No sounds playing</div>
        )}
        {playingIds.map(id => {
          const sound = soundsLookup.get(id);
          if (!sound) return null;
          const duration = sound.duration || 0;
          const currentTime = positions[id] ?? 0;
          return (
            <div key={id} className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="truncate text-xs text-gray-200 font-mono" title={sound.name}>{sound.name}</div>
                <button
                  onClick={() => onStop && onStop(id)}
                  className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 flex-shrink-0"
                  title="Stop"
                >
                  <Square className="h-4 w-4 text-white" />
                </button>
              </div>
              <PlaybackProgress 
                duration={duration}
                currentTime={currentTime}
                onSeek={onSeek ? (t) => onSeek(id, t) : undefined}
              />
              <div className="mt-3">
                <VolumeSlider 
                  value={sound.volume}
                  onChange={(v) => onVolumeChange && onVolumeChange(id, v)}
                />
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
};


