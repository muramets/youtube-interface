import React from 'react';
import { Check } from 'lucide-react';

interface VideoFormProps {
    title: string;
    setTitle: (value: string) => void;
    viewCount: string;
    setViewCount: (value: string) => void;
    duration: string;
    setDuration: (value: string) => void;
    isPublished: boolean;
    setIsPublished: (value: boolean) => void;
    publishedUrl: string;
    setPublishedUrl: (value: string) => void;
}

export const VideoForm: React.FC<VideoFormProps> = ({
    title,
    setTitle,
    viewCount,
    setViewCount,
    duration,
    setDuration,
    isPublished,
    setIsPublished,
    publishedUrl,
    setPublishedUrl
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

            {/* Published Video Section */}
            <div className="flex flex-col gap-3 pt-2 border-t border-border">
                <label className="flex items-center gap-3 cursor-pointer w-fit group select-none">
                    <div className="relative flex items-center justify-center w-5 h-5">
                        <input
                            type="checkbox"
                            checked={isPublished}
                            onChange={(e) => setIsPublished(e.target.checked)}
                            className="peer appearance-none w-5 h-5 border-2 border-text-secondary/50 rounded-md checked:bg-text-primary checked:border-text-primary transition-all duration-200 cursor-pointer"
                        />
                        <Check
                            size={14}
                            className="absolute text-bg-primary opacity-0 peer-checked:opacity-100 transition-opacity duration-200 pointer-events-none"
                            strokeWidth={3}
                        />
                    </div>
                    <span className="text-sm font-medium text-text-primary group-hover:text-text-primary/80 transition-colors">
                        Video Published
                    </span>
                </label>

                <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${isPublished ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                    <div className="overflow-hidden">
                        <div className="flex flex-col gap-2 pt-1 pb-1">
                            <label className="text-sm text-text-secondary font-medium">YouTube URL</label>
                            <input
                                type="text"
                                value={publishedUrl}
                                onChange={(e) => setPublishedUrl(e.target.value)}
                                placeholder="https://www.youtube.com/watch?v=..."
                                onKeyDown={(e) => e.stopPropagation()}
                                className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary text-base focus:outline-none focus:border-text-primary transition-colors placeholder:text-text-secondary/50 w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
