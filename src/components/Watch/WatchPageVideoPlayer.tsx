import React from 'react';
import type { VideoDetails } from '../../utils/youtubeApi';

interface WatchPageVideoPlayerProps {
    video: VideoDetails;
}

export const WatchPageVideoPlayer: React.FC<WatchPageVideoPlayerProps> = ({ video }) => {
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
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${video.id}`}
                    title={video.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                ></iframe>
            )}
        </div>
    );
};
