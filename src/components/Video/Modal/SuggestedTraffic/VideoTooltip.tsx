import { PortalTooltip } from '../../../Shared/PortalTooltip';
import { ExternalLink } from 'lucide-react';
import type { TrafficSource } from '../../../../types/traffic';

interface VideoTooltipProps {
    source: TrafficSource;
    children: React.ReactNode;
}

export const VideoTooltip: React.FC<VideoTooltipProps> = ({ source, children }) => {
    if (!source.videoId) return <>{children}</>;

    const content = (
        <div className="w-[320px] p-3 bg-[#1F1F1F] border border-white/10 rounded-xl shadow-xl">
            {/* Header with Mini Player */}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black mb-3">
                {source.videoId ? (
                    <iframe
                        src={`https://www.youtube.com/embed/${source.videoId}?autoplay=0&mute=0&controls=1&modestbranding=1&rel=0`}
                        title={source.sourceTitle}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                ) : source.thumbnail ? (
                    <img src={source.thumbnail} alt={source.sourceTitle} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                        No Preview
                    </div>
                )}
            </div>

            {/* Title */}
            <h4 className="text-sm font-medium text-white mb-3 line-clamp-2 leading-snug">
                {source.sourceTitle}
            </h4>

            {/* Action */}
            <a
                href={`https://www.youtube.com/watch?v=${source.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-1.5 bg-white/10 hover:bg-white/20 text-xs font-medium text-white rounded transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <ExternalLink size={12} />
                Open in YouTube
            </a>
        </div>
    );

    return (
        <PortalTooltip
            align="left"
            content={content}
            className="!p-0 !bg-transparent !border-0 !shadow-none"
            triggerClassName="w-full block"
            enterDelay={500}
        >
            <div className="w-full">
                {children}
            </div>
        </PortalTooltip>
    );
};
