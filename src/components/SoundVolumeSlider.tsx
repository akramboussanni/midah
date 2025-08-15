import { useState } from 'react';
import { VolumeSlider } from './VolumeSlider';

interface SoundVolumeSliderProps {
  soundId: string;
  volume: number;
  onVolumeChange: (soundId: string, volume: number) => void;
  containerClassName?: string;
}

export const SoundVolumeSlider = ({
  soundId,
  volume,
  onVolumeChange,
  containerClassName = "",
}: SoundVolumeSliderProps) => {
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);

  return (
    <div className={`${containerClassName} ${isVolumeDragging ? 'volume-dragging' : ''}`}>
      <VolumeSlider
        value={volume}
        onChange={(v) => onVolumeChange(soundId, v)}
        onDraggingChange={setIsVolumeDragging}
      />
    </div>
  );
};
