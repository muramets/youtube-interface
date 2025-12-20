import React, { useState, useEffect, useCallback } from 'react';
import { type VideoDetails } from '../../../utils/youtubeApi';
import { PackagingForm } from './PackagingForm';
import { VideoPreviewCard } from './VideoPreviewCard';
import { LanguageTabs } from '../../../components/Video/LanguageTabs';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { ChannelService } from '../../../services/channelService';
import { useVideos } from '../../../hooks/useVideos';
import { useUIStore } from '../../../stores/uiStore';
import { usePackagingLocalization } from '../../../hooks/usePackagingLocalization';

interface PackagingTabProps {
    video: VideoDetails;
}

export const PackagingTab: React.FC<PackagingTabProps> = ({ video }) => {
    const { user } = useAuth();
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // Localization hook for title/description/tags per language
    const localization = usePackagingLocalization({
        initialTitle: video.title || '',
        initialDescription: video.description || '',
        initialTags: video.tags || [],
        initialLocalizations: video.localizations || {}
    });

    // Other form state (not localized)
    const [customImage, setCustomImage] = useState(video.customImage || '');
    const [publishedVideoId, setPublishedVideoId] = useState(video.publishedVideoId || '');
    const [videoRender, setVideoRender] = useState(video.videoRender || '');
    const [audioRender, setAudioRender] = useState(video.audioRender || '');

    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Track dirty state (includes localization changes)
    useEffect(() => {
        const { title, description, tags, localizations } = localization.getFullPayload();

        const hasChanges =
            title !== (video.title || '') ||
            description !== (video.description || '') ||
            JSON.stringify(tags) !== JSON.stringify(video.tags || []) ||
            customImage !== (video.customImage || '') ||
            publishedVideoId !== (video.publishedVideoId || '') ||
            videoRender !== (video.videoRender || '') ||
            audioRender !== (video.audioRender || '') ||
            JSON.stringify(localizations) !== JSON.stringify(video.localizations || {});

        setIsDirty(hasChanges);
    }, [
        localization,
        customImage,
        publishedVideoId,
        videoRender,
        audioRender,
        video
    ]);

    // Beforeunload warning for unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleSave = async () => {
        if (!user || !currentChannel || !video.id) return;

        setIsSaving(true);
        try {
            const payload = localization.getFullPayload();
            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    customImage,
                    publishedVideoId,
                    videoRender,
                    audioRender,
                }
            });
            localization.resetDirty();
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
        // TODO: Reset localization state to initial
        setCustomImage(video.customImage || '');
        setPublishedVideoId(video.publishedVideoId || '');
        setVideoRender(video.videoRender || '');
        setAudioRender(video.audioRender || '');
    };

    // Handle language switch
    const handleSwitchLanguage = useCallback((code: string) => {
        localization.switchLanguage(code);
    }, [localization]);

    // Handle add language - also save custom languages to channel
    const handleAddLanguage = useCallback(async (code: string, customName?: string, customFlag?: string) => {
        // First add to video localizations
        localization.addLanguage(code, customName, customFlag);

        // If it's a custom language (has customName), save to channel
        if (customName && user && currentChannel) {
            const existingCustomLanguages = currentChannel.customLanguages || [];
            const alreadyExists = existingCustomLanguages.some(l => l.code === code);

            if (!alreadyExists) {
                const updatedLanguages = [
                    ...existingCustomLanguages,
                    { code, name: customName, flag: customFlag || '' }
                ];

                try {
                    await ChannelService.updateChannel(user.uid, currentChannel.id, {
                        customLanguages: updatedLanguages
                    });
                    // Update local state
                    setCurrentChannel({
                        ...currentChannel,
                        customLanguages: updatedLanguages
                    });
                } catch (error) {
                    console.error('Failed to save custom language to channel:', error);
                }
            }
        }
    }, [localization, user, currentChannel, setCurrentChannel]);

    // Handle delete custom language from channel
    const handleDeleteCustomLanguage = useCallback(async (code: string) => {
        if (!user || !currentChannel) return;

        const updatedLanguages = (currentChannel.customLanguages || []).filter(
            lang => lang.code !== code
        );

        try {
            await ChannelService.updateChannel(user.uid, currentChannel.id, {
                customLanguages: updatedLanguages
            });
            // Update local state so UI reflects change immediately
            setCurrentChannel({
                ...currentChannel,
                customLanguages: updatedLanguages
            });
            showToast(`Language "${code.toUpperCase()}" deleted`, 'success');
        } catch (error) {
            console.error('Failed to delete custom language:', error);
            showToast('Failed to delete language', 'error');
        }
    }, [user, currentChannel, showToast, setCurrentChannel]);

    return (
        <div className="flex-1 overflow-y-auto p-6">
            {/* Page Header */}
            <h1 className="text-2xl font-medium text-white mb-4">Video Packaging</h1>

            {/* Language Tabs */}
            <div className="mb-6">
                <LanguageTabs
                    activeLanguage={localization.activeLanguage}
                    localizations={localization.localizations}
                    onSwitchLanguage={handleSwitchLanguage}
                    onAddLanguage={handleAddLanguage}
                    onRemoveLanguage={localization.removeLanguage}
                    savedCustomLanguages={currentChannel?.customLanguages || []}
                    onDeleteCustomLanguage={handleDeleteCustomLanguage}
                />
            </div>

            <div className="flex gap-8 max-w-[1050px] items-start">
                {/* Main Form (Left) */}
                <div className="flex-1 min-w-0">
                    <PackagingForm
                        title={localization.title}
                        setTitle={localization.setTitle}
                        description={localization.description}
                        setDescription={localization.setDescription}
                        tags={localization.tags}
                        setTags={localization.setTags}
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
