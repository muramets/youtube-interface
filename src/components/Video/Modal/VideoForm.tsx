import React from 'react';

interface VideoFormProps {
    title: string;
    setTitle: (value: string) => void;
    viewCount: string;
    setViewCount: (value: string) => void;
    duration: string;
    setDuration: (value: string) => void;
}

export const VideoForm: React.FC<VideoFormProps> = ({
    title,
    setTitle,
    viewCount,
    setViewCount,
    duration,
    setDuration
}) => {
    return (
        <div className="flex flex-col gap-5">
            {/* Title Input */}
            <div className="flex flex-col gap-2">
                <label className="text-sm text-text-secondary font-medium">Video Title</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Very good playlist for you"
                    onKeyDown={(e) => e.stopPropagation()}
                    className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-text-primary transition-colors placeholder:text-text-secondary/50"
                />
            </div>

            {/* View Count Input */}
            <div className="flex flex-col gap-2">
                <label className="text-sm text-text-secondary font-medium">View Count</label>
                <input
                    type="text"
                    value={viewCount}
                    onChange={(e) => setViewCount(e.target.value)}
                    placeholder="1M"
                    onKeyDown={(e) => e.stopPropagation()}
                    className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-text-primary transition-colors placeholder:text-text-secondary/50"
                />
            </div>

            {/* Duration Input */}
            <div className="flex flex-col gap-2">
                <label className="text-sm text-text-secondary font-medium">Duration</label>
                <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="1:02:11"
                    onKeyDown={(e) => e.stopPropagation()}
                    className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-text-primary transition-colors placeholder:text-text-secondary/50"
                />
            </div>
        </div>
    );
};
