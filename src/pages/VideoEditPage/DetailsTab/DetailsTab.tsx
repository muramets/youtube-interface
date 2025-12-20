import React, { useState, useEffect } from 'react';
import { type VideoDetails } from '../../../utils/youtubeApi';
import { DetailsForm } from './DetailsForm';
import { VideoPreviewCard } from './VideoPreviewCard';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { useVideos } from '../../../hooks/useVideos';
import { useUIStore } from '../../../stores/uiStore';

interface DetailsTabProps {
    video: VideoDetails;
}

export const DetailsTab: React.FC<DetailsTabProps> = ({ video }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // Form state - using correct property names from VideoDetails
    const [title, setTitle] = useState(video.title || '');
    const [description, setDescription] = useState(video.description || '');
    const [tags, setTags] = useState<string[]>(video.tags || []);
    const [customImage, setCustomImage] = useState(video.customImage || '');
    const [publishedVideoId, setPublishedVideoId] = useState(video.publishedVideoId || '');
    const [videoRender, setVideoRender] = useState(video.videoRender || '');
    const [audioRender, setAudioRender] = useState(video.audioRender || '');

    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Track dirty state
    useEffect(() => {
        const hasChanges =
            title !== (video.title || '') ||
            description !== (video.description || '') ||
            JSON.stringify(tags) !== JSON.stringify(video.tags || []) ||
            customImage !== (video.customImage || '') ||
            publishedVideoId !== (video.publishedVideoId || '') ||
            videoRender !== (video.videoRender || '') ||
            audioRender !== (video.audioRender || '');

        setIsDirty(hasChanges);
    }, [title, description, tags, customImage, publishedVideoId, videoRender, audioRender, video]);

    const handleSave = async () => {
        if (!user || !currentChannel || !video.id) return;

        setIsSaving(true);
        try {
            await updateVideo({
                videoId: video.id,
                updates: {
                    title,
                    description,
                    tags,
                    customImage,
                    publishedVideoId,
                    videoRender,
                    audioRender,
                }
            });
            showToast('Video saved successfully', 'success');
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to save video:', error);
            showToast('Failed to save video', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Reset to original values
        setTitle(video.title || '');
        setDescription(video.description || '');
        setTags(video.tags || []);
        setCustomImage(video.customImage || '');
        setPublishedVideoId(video.publishedVideoId || '');
        setVideoRender(video.videoRender || '');
        setAudioRender(video.audioRender || '');
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            {/* Page Header */}
            <h1 className="text-2xl font-medium text-white mb-6">Video details</h1>


            <div className="flex gap-8 max-w-[1050px] items-start">
                {/* Main Form (Left) */}
                <div className="flex-1 min-w-0">
                    <DetailsForm
                        title={title}
                        setTitle={setTitle}
                        description={description}
                        setDescription={setDescription}
                        tags={tags}
                        setTags={setTags}
                        coverImage={customImage}
                        setCoverImage={setCustomImage}
                        publishedUrl={publishedVideoId}
                        setPublishedUrl={setPublishedVideoId}
                        videoRender={videoRender}
                        setVideoRender={setVideoRender}
                        audioRender={audioRender}
                        setAudioRender={setAudioRender}
                    />

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-6 pt-6 border-t border-border">
                        <button
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                            className={`
              px-6 py-2 rounded-full font-medium transition-colors
              ${isDirty && !isSaving
                                    ? 'bg-white text-black hover:bg-gray-200'
                                    : 'bg-white/20 text-text-secondary cursor-not-allowed'
                                }
            `}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={!isDirty}
                            className={`
              px-6 py-2 rounded-full font-medium transition-colors
              ${isDirty
                                    ? 'text-text-primary hover:bg-hover-bg'
                                    : 'text-text-secondary cursor-not-allowed'
                                }
            `}
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                {/* Video Preview (Right) */}
                <div className="w-80 flex-shrink-0">
                    <VideoPreviewCard video={video} currentCoverImage={customImage} />
                </div>
            </div>
        </div>
    );
};
