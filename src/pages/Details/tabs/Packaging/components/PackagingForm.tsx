import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type CoverVersion } from '../../../../../core/utils/youtubeApi';
import { TitleInput } from './TitleInput';
import { DescriptionInput } from './DescriptionInput';
import { ThumbnailSection } from '../../../../../features/Video/components/Thumbnail/ThumbnailSection';
import { TagsSection } from './TagsSection';
import { ShowMoreSection } from './ShowMoreSection';
import { ABTitlesDisplay } from './ABTitlesDisplay';

interface PackagingFormProps {
    title: string;
    setTitle: (value: string) => void;
    description: string;
    setDescription: (value: string) => void;
    tags: string[];
    setTags: (value: string[]) => void;
    coverImage: string;
    setCoverImage: (value: string, filename?: string, version?: number) => void;
    /** Callback to handle file upload to Firebase Storage. Returns the download URL. */
    onFileUpload?: (file: File) => Promise<string>;
    /** Callback to push current thumbnail to history before replacing it */
    onPushToHistory?: (url: string) => void;
    publishedUrl: string;
    setPublishedUrl: (value: string) => void;
    videoRender: string;
    setVideoRender: (value: string) => void;
    audioRender: string;
    setAudioRender: (value: string) => void;
    readOnly?: boolean;
    /** YouTube thumbnail URL for read-only display */
    youtubeThumbnailUrl?: string;
    // A/B Testing props
    abTestTitles?: string[];
    abTestStatus?: 'running' | 'completed' | 'draft';
    onTitleABTestClick?: () => void;
    onThumbnailABTestClick?: () => void;
    abTestThumbnails?: string[];
    abTestResults?: {
        titles: number[];
        thumbnails: number[];
    };
    coverHistory?: CoverVersion[];
    onDeleteHistoryVersion?: (timestamp: number) => void;
    onCloneFromVersion?: (version: CoverVersion) => void;
    cloningVersion?: number | null;
    currentVersionInfo?: {
        version?: number;
        originalName?: string;
    };
    checkIsCloned?: (thumbnailUrl: string) => boolean;
    likedThumbnailVersions?: number[];
    onLikeThumbnail?: (version: number) => void;
    onRemoveThumbnail?: (version: number) => void;
    expandShowMore?: boolean;
    /** Callback to notify parent when thumbnail upload state changes */
    onUploadingChange?: (isUploading: boolean) => void;
}

export const PackagingForm: React.FC<PackagingFormProps> = ({
    title,
    setTitle,
    description,
    setDescription,
    tags,
    setTags,
    coverImage,
    setCoverImage,
    onFileUpload,
    onPushToHistory,
    publishedUrl,
    setPublishedUrl,
    videoRender,
    setVideoRender,
    audioRender,
    setAudioRender,
    readOnly = false,
    youtubeThumbnailUrl,
    abTestTitles = [],
    abTestStatus = 'draft',
    onTitleABTestClick,
    onThumbnailABTestClick,
    abTestThumbnails = [],
    abTestResults = { titles: [], thumbnails: [] },
    coverHistory = [],
    onDeleteHistoryVersion,
    onCloneFromVersion,
    cloningVersion,
    currentVersionInfo,
    checkIsCloned,
    likedThumbnailVersions,
    onLikeThumbnail,
    onRemoveThumbnail,
    expandShowMore = false,
    onUploadingChange
}) => {
    const [showMore, setShowMore] = useState(false);

    // Auto-expand if requested (e.g. from deep link)
    React.useEffect(() => {
        if (expandShowMore) {
            setShowMore(true);
        }
    }, [expandShowMore]);

    const hasABTestTitles = abTestTitles.length >= 2;

    return (
        <div className="space-y-6">
            {/* Title - show A/B display if testing is active */}
            {hasABTestTitles ? (
                <ABTitlesDisplay
                    titles={abTestTitles}
                    status={abTestStatus}
                    onEditClick={onTitleABTestClick || (() => { })}
                    readOnly={readOnly}
                    results={abTestResults.titles}
                />
            ) : (
                <TitleInput
                    value={title}
                    onChange={setTitle}
                    onABTestClick={onTitleABTestClick}
                    readOnly={readOnly}
                />
            )}

            {/* Description */}
            <DescriptionInput value={description} onChange={setDescription} readOnly={readOnly} />

            {/* Thumbnail */}
            <ThumbnailSection
                value={coverImage}
                onChange={setCoverImage}
                onFileUpload={onFileUpload}
                onPushToHistory={onPushToHistory}
                readOnly={readOnly}
                youtubeThumbnailUrl={youtubeThumbnailUrl}
                onABTestClick={onThumbnailABTestClick}
                variants={abTestThumbnails}
                history={coverHistory}
                onDelete={onDeleteHistoryVersion}
                onClone={onCloneFromVersion}
                cloningVersion={cloningVersion}
                currentVersionInfo={currentVersionInfo}
                checkIsCloned={checkIsCloned}
                likedThumbnailVersions={likedThumbnailVersions}
                onLikeThumbnail={onLikeThumbnail}
                onRemoveThumbnail={onRemoveThumbnail}
                onUploadingChange={onUploadingChange}
            />

            {/* Tags */}
            <TagsSection tags={tags} setTags={setTags} readOnly={readOnly} />

            {/* Show More Toggle - only for editable videos */}
            {!readOnly && (
                <>
                    <button
                        onClick={() => setShowMore(!showMore)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-button-secondary-bg text-button-secondary-text hover:bg-button-secondary-hover transition-colors"
                    >
                        {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        <span>{showMore ? 'Show less' : 'Show more'}</span>
                    </button>

                    {/* Collapsible Section */}
                    {showMore && (
                        <ShowMoreSection
                            publishedUrl={publishedUrl}
                            setPublishedUrl={setPublishedUrl}
                            videoRender={videoRender}
                            setVideoRender={setVideoRender}
                            audioRender={audioRender}
                            setAudioRender={setAudioRender}
                        />
                    )}
                </>
            )}
        </div>
    );
};
