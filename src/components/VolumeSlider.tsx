import React, { useState } from 'react';
import { Volume2 } from 'lucide-react';

interface VolumeSliderProps {
  value: number; // 0..1
  onChange: (value: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({ value, onChange, onDraggingChange }) => {
  const [isDragging, setIsDragging] = useState(false);

  const setDragging = (d: boolean) => {
    setIsDragging(d);
    onDraggingChange?.(d);
  };

  return (
    <div className={`flex items-center space-x-2 p-2 rounded border volume-control ${
      isDragging ? 'bg-gray-700/50 border-gray-600/50' : 'bg-gray-800/30 border-gray-700/30'
    }`}>
      <Volume2 className={`h-3 w-3 flex-shrink-0 ${isDragging ? 'text-white' : 'text-gray-400'}`} />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(parseFloat(e.target.value));
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setDragging(true);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          setDragging(false);
        }}
        onMouseLeave={() => setDragging(false)}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        style={{ pointerEvents: 'auto' }}
      />
      <span className="text-xs text-gray-400 font-mono w-8 flex-shrink-0">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
};


