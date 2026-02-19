import React from 'react';
import { PictureInPicture2 } from 'lucide-react';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useVideoPlayer } from '../../core/hooks/useVideoPlayer';

interface WatchPageVideoPlayerProps {
    video: VideoDetails;
}

export const WatchPageVideoPlayer: React.FC<WatchPageVideoPlayerProps> = ({ video }) => {
    const { minimize } = useVideoPlayer();

    const handleMinimize = () => {
        minimize(video.id, video.title);
    };

    return (
        <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-4 relative group">
            {video.isCustom ? (
                <div className="w-full h-full relative group cursor-default">
                    <img
                        src={video.customImage || video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
            ) : (
                <>
                    <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${video.id}`}
                        title={video.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                    />
                    {/* Minimize to mini-player button */}
                    <button
                        onClick={handleMinimize}
                        title="Mini Player"
                        className="
                            absolute bottom-3 right-3 z-10
                            flex items-center gap-1.5
                            px-2.5 py-1.5
                            bg-black/60 hover:bg-black/85
                            text-white/80 hover:text-white
                            rounded-lg
                            backdrop-blur-sm
                            text-xs font-medium
                            opacity-0 group-hover:opacity-100
                            transition-all duration-200
                            cursor-pointer
                            select-none
                        "
                    >
                        <PictureInPicture2 size={14} />
                        <span>Mini Player</span>
                    </button>
                </>
            )}
        </div>
    );
};
