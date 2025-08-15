interface WaveformAnimationProps {
  isPlaying: boolean;
  size?: 'small' | 'medium';
}

export const WaveformAnimation = ({ isPlaying, size = 'medium' }: WaveformAnimationProps) => {
  const containerSize = size === 'small' ? 'h-4 w-4' : 'h-6 w-6';
  const waveHeight = size === 'small' ? '6px' : '8px';
  const barWidth = size === 'small' ? 'w-0.5' : 'w-0.5';

  return (
    <div className={`relative ${containerSize} flex items-center justify-center`}>
      <div className="flex items-center space-x-1 h-4">
        {[1, 2, 3, 4, 5].map((i) => {
          const duration = (Math.random() * 0.3 + 0.5).toFixed(2);
          const delay = (Math.random() * 0.3).toFixed(2);
          const scale = (2.0 + Math.random() * 1.5).toFixed(2);

          return (
            <div
              key={i}
              className={`${barWidth} rounded-full transition-colors duration-200 ${
                isPlaying ? 'bg-white' : 'bg-gray-600'
              }`}
              style={{
                height: isPlaying ? waveHeight : '4px',
                transform: isPlaying ? `scaleY(${scale})` : 'scaleY(1)',
                animation: isPlaying
                  ? `waveMotion-${i} ${duration}s ease-in-out ${delay}s infinite`
                  : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
