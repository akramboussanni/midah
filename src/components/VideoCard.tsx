import { Download, Clock, Eye, Calendar, User, Check } from 'lucide-react';
import { VideoInfo } from '../types';

interface VideoCardProps {
  video: VideoInfo;
  onDownload: (videoId: string, title: string) => Promise<void>;
  isDownloading: boolean;
  downloadProgress: number;
  isCompleted: boolean;
  onResetDownload: (videoId: string) => void;
}

export const VideoCard = ({ 
  video, 
  onDownload, 
  isDownloading, 
  downloadProgress, 
  isCompleted,
  onResetDownload 
}: VideoCardProps) => {
  const formatDuration = (duration: string) => {
    if (duration.includes(':')) {
      return duration;
    }
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatViewCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
    return `${Math.floor(diffInDays / 365)} years ago`;
  };

  const handleDownload = async () => {
    if (isCompleted) {
      onResetDownload(video.id);
    } else {
      await onDownload(video.id, video.title);
    }
  };

  const getButtonContent = () => {
    if (isCompleted) {
      return (
        <>
          <Check className="w-4 h-4" />
          <span>Download Complete</span>
        </>
      );
    } else if (isDownloading) {
      return (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Downloading... {Math.round(downloadProgress)}%</span>
        </>
      );
    } else {
      return (
        <>
          <Download className="w-4 h-4" />
          <span>Download Audio</span>
        </>
      );
    }
  };

  const getButtonClassName = () => {
    if (isCompleted) {
      return 'bg-green-600 hover:bg-green-700 text-white hover:shadow-lg';
    } else if (isDownloading) {
      return 'bg-gray-800/50 text-gray-400 cursor-not-allowed';
    } else {
      return 'bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors duration-200';
    }
  };

  return (
    <div
      className="border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-all duration-200 group"
      style={{ background: 'rgba(10, 13, 19, 0.98)' }}
    >

      <div className="relative aspect-video bg-gray-800 overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
        

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
            <Clock className="inline w-3 h-3 mr-1" />
            {formatDuration(video.duration)}
          </div>
        )}
      </div>


      <div className="p-4 space-y-3">

        <h3 className="font-medium text-white line-clamp-2 group-hover:text-gray-300 transition-colors duration-200 [&>*]:text-white [&>*]:no-underline">
          {video.title}
        </h3>


        <div className="space-y-2 text-sm text-gray-400 [&>*]:text-gray-400 [&>*]:no-underline">
          <div className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            <span className="truncate">{video.channel_title}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(video.published_at)}</span>
            </div>
            
            {video.view_count && (
              <div className="flex items-center">
                <Eye className="w-4 h-4 mr-1" />
                <span>{formatViewCount(video.view_count)}</span>
              </div>
            )}
          </div>
        </div>


        <p className="text-xs text-gray-500 line-clamp-2 [&>*]:text-gray-500 [&>*]:no-underline">
          {video.description}
        </p>


        <div className="pt-2">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className={`w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-all duration-200 ${getButtonClassName()}`}
          >
            {getButtonContent()}
          </button>
          

          {isDownloading && (
            <div className="mt-2 bg-gray-700 rounded-full h-1">
              <div
                className="bg-gray-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 