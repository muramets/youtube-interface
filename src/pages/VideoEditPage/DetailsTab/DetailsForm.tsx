import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TitleInput } from './TitleInput';
import { DescriptionInput } from './DescriptionInput';
import { ThumbnailSection } from './ThumbnailSection';
import { TagsSection } from './TagsSection';
import { ShowMoreSection } from './ShowMoreSection';

interface DetailsFormProps {
    title: string;
    setTitle: (value: string) => void;
    description: string;
    setDescription: (value: string) => void;
    tags: string[];
    setTags: (value: string[]) => void;
    coverImage: string;
    setCoverImage: (value: string) => void;
    publishedUrl: string;
    setPublishedUrl: (value: string) => void;
    videoRender: string;
    setVideoRender: (value: string) => void;
    audioRender: string;
    setAudioRender: (value: string) => void;
}

export const DetailsForm: React.FC<DetailsFormProps> = ({
    title,
    setTitle,
    description,
    setDescription,
    tags,
    setTags,
    coverImage,
    setCoverImage,
    publishedUrl,
    setPublishedUrl,
    videoRender,
    setVideoRender,
    audioRender,
    setAudioRender,
}) => {
    const [showMore, setShowMore] = useState(false);

    return (
        <div className="space-y-6">
            {/* Title */}
            <TitleInput value={title} onChange={setTitle} />

            {/* Description */}
            <DescriptionInput value={description} onChange={setDescription} />

            {/* Thumbnail */}
            <ThumbnailSection value={coverImage} onChange={setCoverImage} />

            {/* Tags */}
            <TagsSection tags={tags} setTags={setTags} />

            {/* Show More Toggle */}
            <button
                onClick={() => setShowMore(!showMore)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
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
        </div>
    );
};
