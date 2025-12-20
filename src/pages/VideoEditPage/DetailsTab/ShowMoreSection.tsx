import React from 'react';

interface ShowMoreSectionProps {
    publishedUrl: string;
    setPublishedUrl: (value: string) => void;
    videoRender: string;
    setVideoRender: (value: string) => void;
    audioRender: string;
    setAudioRender: (value: string) => void;
}

export const ShowMoreSection: React.FC<ShowMoreSectionProps> = ({
    publishedUrl,
    setPublishedUrl,
    videoRender,
    setVideoRender,
    audioRender,
    setAudioRender,
}) => {
    return (
        <div className="flex flex-col gap-4 pt-4 border-t border-border animate-fade-in">
            {/* Published URL */}
            <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                    Published URL
                </label>
                <input
                    type="url"
                    value={publishedUrl}
                    onChange={(e) => setPublishedUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                />
            </div>

            {/* Video Render */}
            <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                    Video Render #
                </label>
                <input
                    type="text"
                    value={videoRender}
                    onChange={(e) => setVideoRender(e.target.value)}
                    placeholder="e.g. #1.1"
                    className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                />
            </div>

            {/* Audio Render */}
            <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">
                    Audio Render #
                </label>
                <input
                    type="text"
                    value={audioRender}
                    onChange={(e) => setAudioRender(e.target.value)}
                    placeholder="e.g. #1.0"
                    className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                />
            </div>
        </div>
    );
};
