import React from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { TagsInput } from '../../TagsInput';
import { LanguageTabs } from '../LanguageTabs';
import { type VideoLocalization } from '../../../utils/youtubeApi';
import { type CustomLanguage } from '../../../services/channelService';

interface VideoFormProps {
    title: string;
    setTitle: (val: string) => void;
    description: string;
    setDescription: (val: string) => void;
    tags: string[];
    setTags: (val: string[]) => void;
    activeLanguage: string;
    localizations: Record<string, VideoLocalization>;
    onSwitchLanguage: (code: string) => void;
    onAddLanguage: (code: string, customName?: string, customFlag?: string) => void;
    onRemoveLanguage: (code: string) => void;
    savedCustomLanguages?: CustomLanguage[];
    onDeleteCustomLanguage?: (code: string) => void;
    isPublished: boolean;
    setIsPublished: (val: boolean) => void;
    publishedUrl: string;
    setPublishedUrl: (val: string) => void;
    isStatsExpanded: boolean;
    setIsStatsExpanded: (val: boolean) => void;
    viewCount: string;
    setViewCount: (val: string) => void;
    duration: string;
    setDuration: (val: string) => void;
    videoRender: string;
    setVideoRender: (val: string) => void;
    audioRender: string;
    setAudioRender: (val: string) => void;
    onShowToast: (message: string, type: 'success' | 'error') => void;
    readOnly?: boolean;
}

export const VideoForm: React.FC<VideoFormProps> = ({
    title,
    setTitle,
    description,
    setDescription,
    tags,
    setTags,
    activeLanguage,
    localizations,
    onSwitchLanguage,
    onAddLanguage,
    onRemoveLanguage,
    savedCustomLanguages,
    onDeleteCustomLanguage,
    isPublished,
    setIsPublished,
    publishedUrl,
    setPublishedUrl,
    isStatsExpanded,
    setIsStatsExpanded,
    viewCount,
    setViewCount,
    duration,
    setDuration,
    videoRender,
    setVideoRender,
    audioRender,
    setAudioRender,
    onShowToast,
    readOnly = false
}) => {
    return (
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar pr-2">
            <LanguageTabs
                activeLanguage={activeLanguage}
                localizations={localizations}
                onSwitchLanguage={onSwitchLanguage}
                onAddLanguage={onAddLanguage}
                onRemoveLanguage={onRemoveLanguage}
                savedCustomLanguages={savedCustomLanguages}
                onDeleteCustomLanguage={onDeleteCustomLanguage}
            />

            {/* Title */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Title</label>
                    <span className="text-xs text-text-secondary">{title.length}/100</span>
                </div>
                <input
                    type="text"
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                    placeholder="Add a title that describes your video"
                    disabled={readOnly}
                />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full h-32 bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none resize-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                    placeholder="Tell viewers about your video"
                    disabled={readOnly}
                />
            </div>

            {/* Tags */}
            <TagsInput
                tags={tags}
                onChange={setTags}
                onShowToast={onShowToast}
                readOnly={readOnly}
            />

            {/* Published Status - Only for default language */}
            {activeLanguage === 'default' && (
                <div className="flex flex-col gap-3">
                    <div
                        className="flex items-center gap-3 cursor-pointer group"
                        onClick={() => setIsPublished(!isPublished)}
                    >
                        <div
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isPublished ? 'bg-text-primary border-text-primary' : 'border-text-secondary group-hover:border-text-primary'}`}
                        >
                            {isPublished && <Check size={14} className="text-bg-primary" />}
                        </div>
                        <span className="text-sm text-text-primary font-medium">Video Published</span>
                    </div>

                    {isPublished && (
                        <div className="animate-scale-in origin-top">
                            <input
                                type="text"
                                value={publishedUrl}
                                onChange={(e) => setPublishedUrl(e.target.value)}
                                className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-base text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                                placeholder="https://www.youtube.com/watch?v=..."
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Stats Section - Only for default language */}
            {activeLanguage === 'default' && (
                <div className="border-t border-border pt-4">
                    <button
                        onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-modal-button-bg text-white text-sm font-medium hover:bg-modal-button-hover transition-colors mb-4"
                    >
                        {isStatsExpanded ? 'Show less' : 'Show more'}
                        {isStatsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {isStatsExpanded && (
                        <div className="grid grid-cols-2 gap-4 animate-fade-in pb-2">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Video Render #</label>
                                <input
                                    type="text"
                                    value={videoRender}
                                    onChange={(e) => setVideoRender(e.target.value)}
                                    className="modal-input"
                                    placeholder="e.g. #1.1"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Audio Render #</label>
                                <input
                                    type="text"
                                    value={audioRender}
                                    onChange={(e) => setAudioRender(e.target.value)}
                                    className="modal-input"
                                    placeholder="e.g. #1.0"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">View Count</label>
                                <input
                                    type="text"
                                    value={viewCount}
                                    onChange={(e) => setViewCount(e.target.value)}
                                    className="modal-input"
                                    placeholder="e.g. 1.2M"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase">Duration</label>
                                <input
                                    type="text"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    className="modal-input"
                                    placeholder="e.g. 10:05"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
