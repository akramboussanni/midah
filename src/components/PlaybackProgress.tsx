import React from 'react';

interface PlaybackProgressProps {
  duration: number;
  currentTime?: number;
  onSeek?: (newTime: number) => void;
  disabled?: boolean;
  isPlaying?: boolean;
  soundId?: string;
  getPlaybackPosition?: (soundId: string) => Promise<number | null>;
}

export const PlaybackProgress: React.FC<PlaybackProgressProps> = ({ duration, currentTime, onSeek, disabled, isPlaying, soundId, getPlaybackPosition }) => {
  const [internalTime, setInternalTime] = React.useState(0);
  const useInternal = !!(isPlaying && soundId && getPlaybackPosition);
  const timeNow = useInternal ? internalTime : (currentTime || 0);
  const progress = duration > 0 ? (timeNow / duration) * 100 : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!onSeek || disabled || !duration) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percent * duration;
    onSeek(newTime);
  };

  React.useEffect(() => {
    if (!useInternal) return;
    let mounted = true;
    const tick = async () => {
      if (!mounted || !getPlaybackPosition || !soundId) return;
      try {
        const pos = await getPlaybackPosition(soundId);
        if (pos !== null) setInternalTime(pos);
      } catch {}
    };
    const interval = setInterval(tick, 100);
    tick();
    return () => { mounted = false; clearInterval(interval); };
  }, [useInternal, getPlaybackPosition, soundId]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span className="font-mono">{formatTime(timeNow)}</span>
        <span className="font-mono">{formatTime(duration)}</span>
      </div>
      <div 
        className={`w-full rounded-full h-1 ${disabled ? 'bg-gray-800' : 'bg-gray-800 cursor-pointer'}`}
        onClick={handleClick}
      >
        <div 
          className="bg-white h-1 rounded-full transition-all duration-100"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
};


