import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type VideoDetails, type PackagingVersion, type VideoLocalization } from '../../../utils/youtubeApi';
import { PackagingForm } from './PackagingForm';
import { VideoPreviewCard } from './VideoPreviewCard';
import { LanguageTabs } from '../../../components/Video/LanguageTabs';
import { ABTestingModal } from './ABTestingModal';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { ChannelService } from '../../../services/channelService';
import { useVideos } from '../../../hooks/useVideos';
import { useUIStore } from '../../../stores/uiStore';
import { usePackagingLocalization } from '../../../hooks/usePackagingLocalization';

// Type for the version state from usePackagingVersions hook
interface VersionState {
    packagingHistory: PackagingVersion[];
    sortedVersions: PackagingVersion[];
    currentVersionNumber: number;
    hasDraft: boolean;
    activeVersion: number | 'draft';  // Version currently used by the video
    viewingVersion: number | 'draft';  // Version currently displayed in the form
    switchToVersion: (versionNumber: number | 'draft') => void;
    restoreVersion: (versionNumber: number) => void;  // Make a version the active one
    createVersion: (snapshot: {
        title: string;
        description: string;
        tags: string[];
        coverImage: string | null;
        abTestVariants: string[];
        localizations?: Record<string, VideoLocalization>;
    }) => PackagingVersion;
    saveDraft: () => void;
    deleteVersion: (versionNumber: number) => void;
    markDirty: () => void;
    getVersionSnapshot: (versionNumber: number) => {
        title: string;
        description: string;
        tags: string[];
        coverImage: string | null;
        abTestVariants: string[];
        localizations?: Record<string, VideoLocalization>;
    } | null;
    getVersionsPayload: () => {
        packagingHistory: PackagingVersion[];
        currentPackagingVersion: number;
        isDraft: boolean;
    };
    setPackagingHistory: React.Dispatch<React.SetStateAction<PackagingVersion[]>>;
    setHasDraft: React.Dispatch<React.SetStateAction<boolean>>;
    setActiveVersion: React.Dispatch<React.SetStateAction<number | 'draft'>>;
}

interface PackagingTabProps {
    video: VideoDetails;
    versionState: VersionState;
    onDirtyChange: (isDirty: boolean) => void;
}

export const PackagingTab: React.FC<PackagingTabProps> = ({ video, versionState, onDirtyChange }) => {
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
    const [isScrolled, setIsScrolled] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // A/B Testing state
    const [abTestModalOpen, setAbTestModalOpen] = useState(false);
    const [abTestInitialTab, setAbTestInitialTab] = useState<'title' | 'thumbnail' | 'both'>('title');
    const [abTestTitles, setAbTestTitles] = useState<string[]>([]);
    const [abTestThumbnails, setAbTestThumbnails] = useState<string[]>([]);

    // Reference to the currently loaded data (for dirty state comparison)
    const [loadedSnapshot, setLoadedSnapshot] = useState({
        title: video.title || '',
        description: video.description || '',
        tags: video.tags || [],
        customImage: video.customImage || '',
        localizations: video.localizations || {},
        abTestTitles: [] as string[],
        abTestThumbnails: [] as string[]
    });

    // Is the user viewing an old version (read-only)?
    const isViewingOldVersion = versionState.viewingVersion !== 'draft' &&
        versionState.viewingVersion !== versionState.activeVersion;

    // Track dirty state - compare against loaded snapshot, not video
    useEffect(() => {
        // Old versions are read-only, never dirty
        if (isViewingOldVersion) {
            setIsDirty(false);
            return;
        }

        const { title, description, tags, localizations } = localization.getFullPayload();

        const hasChanges =
            title !== loadedSnapshot.title ||
            description !== loadedSnapshot.description ||
            JSON.stringify(tags) !== JSON.stringify(loadedSnapshot.tags) ||
            customImage !== loadedSnapshot.customImage ||
            JSON.stringify(localizations) !== JSON.stringify(loadedSnapshot.localizations) ||
            JSON.stringify(abTestTitles) !== JSON.stringify(loadedSnapshot.abTestTitles) ||
            JSON.stringify(abTestThumbnails) !== JSON.stringify(loadedSnapshot.abTestThumbnails);

        setIsDirty(hasChanges);
    }, [
        localization,
        customImage,
        loadedSnapshot,
        isViewingOldVersion,
        abTestTitles,
        abTestThumbnails
    ]);

    // Detect scroll for sticky header shadow
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScrolled(!entry.isIntersecting);
            },
            { threshold: 0 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    // Sync dirty state with parent
    useEffect(() => {
        onDirtyChange(isDirty);
    }, [isDirty, onDirtyChange]);

    // Load version snapshot when switching versions
    useEffect(() => {
        if (versionState.viewingVersion === 'draft') {
            // Load from video (current draft state)
            const snapshot = {
                title: video.title || '',
                description: video.description || '',
                tags: video.tags || [],
                customImage: video.customImage || '',
                localizations: video.localizations || {},
                abTestTitles: [] as string[],
                abTestThumbnails: [] as string[]
            };
            localization.resetToSnapshot({
                title: snapshot.title,
                description: snapshot.description,
                tags: snapshot.tags,
                localizations: snapshot.localizations
            });
            setCustomImage(snapshot.customImage);
            setLoadedSnapshot(snapshot);
        } else {
            // Load from version snapshot
            const versionSnapshot = versionState.getVersionSnapshot(versionState.viewingVersion);
            if (versionSnapshot) {
                const snapshot = {
                    title: versionSnapshot.title,
                    description: versionSnapshot.description,
                    tags: versionSnapshot.tags,
                    customImage: versionSnapshot.coverImage || '',
                    localizations: versionSnapshot.localizations || {},
                    abTestTitles: [] as string[],
                    abTestThumbnails: [] as string[]
                };
                localization.resetToSnapshot({
                    title: snapshot.title,
                    description: snapshot.description,
                    tags: snapshot.tags,
                    localizations: snapshot.localizations
                });
                setCustomImage(snapshot.customImage);
                setLoadedSnapshot(snapshot);
            }
        }
        // Reset dirty state after loading
        setIsDirty(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionState.viewingVersion]);

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

            // Mark as draft (switches sidebar to Draft)
            versionState.saveDraft();

            // Get updated version payload after marking as draft
            const versionPayload = versionState.getVersionsPayload();

            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    customImage,
                    publishedVideoId,
                    videoRender,
                    audioRender,
                    // Version data
                    packagingHistory: versionPayload.packagingHistory,
                    currentPackagingVersion: versionPayload.currentPackagingVersion,
                    isDraft: true // Always true when saving as draft
                }
            });

            // Update loaded snapshot to current values
            setLoadedSnapshot({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                customImage,
                localizations: payload.localizations,
                abTestTitles,
                abTestThumbnails
            });

            localization.resetDirty();
            showToast('Saved as draft', 'success');
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to save video:', error);
            showToast('Failed to save video', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Reload from loaded snapshot
        localization.resetToSnapshot({
            title: loadedSnapshot.title,
            description: loadedSnapshot.description,
            tags: loadedSnapshot.tags,
            localizations: loadedSnapshot.localizations
        });
        setCustomImage(loadedSnapshot.customImage);
        // Reset A/B test state
        setAbTestTitles(loadedSnapshot.abTestTitles);
        setAbTestThumbnails(loadedSnapshot.abTestThumbnails);
        setIsDirty(false);
    };

    // Save current form state as a new version
    const handleSaveAsNewVersion = async () => {
        if (!user || !currentChannel || !video.id) return;

        setIsSaving(true);
        try {
            const payload = localization.getFullPayload();

            // Create the new version
            const newVersion = versionState.createVersion({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                coverImage: customImage || null,
                abTestVariants: [],
                localizations: payload.localizations
            });

            // Get updated version payload
            const versionPayload = versionState.getVersionsPayload();

            // Save to database
            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    customImage,
                    publishedVideoId,
                    videoRender,
                    audioRender,
                    packagingHistory: versionPayload.packagingHistory,
                    currentPackagingVersion: versionPayload.currentPackagingVersion,
                    isDraft: versionPayload.isDraft
                }
            });

            // Update loaded snapshot
            setLoadedSnapshot({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                customImage,
                localizations: payload.localizations,
                abTestTitles,
                abTestThumbnails
            });

            localization.resetDirty();
            showToast(`Saved as v.${newVersion.versionNumber}`, 'success');
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to create version:', error);
            showToast('Failed to create version', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // A/B Testing handlers
    const handleOpenABTestFromTitle = useCallback(() => {
        setAbTestInitialTab('title');
        setAbTestModalOpen(true);
    }, []);

    const handleOpenABTestFromThumbnail = useCallback(() => {
        setAbTestInitialTab('thumbnail');
        setAbTestModalOpen(true);
    }, []);

    const handleABTestSave = useCallback((data: {
        mode: 'title' | 'thumbnail' | 'both';
        titles: string[];
        thumbnails: string[];
    }) => {
        setAbTestTitles(data.titles);
        setAbTestThumbnails(data.thumbnails);
        setIsDirty(true);
        showToast('A/B test configured', 'success');
    }, [showToast]);

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

    // Compute header title and whether to show Restore button
    const isViewingActiveVersion = versionState.viewingVersion === versionState.activeVersion;
    const headerTitle = versionState.viewingVersion === 'draft'
        ? 'Video Packaging (Draft)'
        : `Video Packaging v.${versionState.viewingVersion}`;

    const handleRestore = useCallback(() => {
        if (versionState.viewingVersion !== 'draft' && typeof versionState.viewingVersion === 'number') {
            versionState.restoreVersion(versionState.viewingVersion);
            showToast(`Restored to v.${versionState.viewingVersion}`, 'success');
        }
    }, [versionState, showToast]);

    return (
        <div className="flex-1">
            {/* Scroll detection sentinel */}
            <div ref={sentinelRef} className="h-0" />

            {/* Page Header - Sticky */}
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`} style={{ backgroundColor: 'var(--video-edit-bg)' }}>
                <div className="flex items-center gap-4 max-w-[1050px]">
                    <h1 className="text-2xl font-medium text-white">{headerTitle}</h1>

                    {/* Restore button - show when viewing a non-active version */}
                    {!isViewingActiveVersion && versionState.viewingVersion !== 'draft' && (
                        <button
                            onClick={handleRestore}
                            className="px-4 py-1.5 rounded-full text-sm font-medium bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 transition-colors"
                        >
                            Restore this version
                        </button>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Action Buttons - only show when viewing draft or active version */}
                    {!isViewingOldVersion && (
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancel}
                                disabled={!isDirty}
                                className={`
                                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                                ${isDirty
                                        ? 'bg-white text-black hover:bg-gray-200'
                                        : 'bg-white/20 text-text-secondary cursor-not-allowed'
                                    }
                            `}
                            >
                                Undo changes
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!isDirty || isSaving}
                                className={`
                                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                                ${isDirty && !isSaving
                                        ? 'bg-white text-black hover:bg-gray-200'
                                        : 'bg-white/20 text-text-secondary cursor-not-allowed'
                                    }
                            `}
                            >
                                {isSaving ? 'Saving...' : isDirty ? 'Save as draft' : 'Save'}
                            </button>

                            {/* Save as new version button - show when changes or viewing draft */}
                            {(isDirty || versionState.viewingVersion === 'draft') && (
                                <button
                                    onClick={handleSaveAsNewVersion}
                                    disabled={isSaving}
                                    className={`
                                    px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                                    border border-[#3ea6ff] text-[#3ea6ff] hover:bg-[#3ea6ff]/10
                                    ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                                >
                                    Save as v.{versionState.currentVersionNumber}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Content with padding */}
            <div className="p-6">
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
                            readOnly={isViewingOldVersion}
                            abTestTitles={abTestTitles}
                            abTestStatus="draft"
                            onTitleABTestClick={handleOpenABTestFromTitle}
                            onThumbnailABTestClick={handleOpenABTestFromThumbnail}
                        />


                    </div>

                    {/* Video Preview (Right) */}
                    <div className="w-80 flex-shrink-0">
                        <VideoPreviewCard video={video} currentCoverImage={customImage} />
                    </div>
                </div>

                {/* A/B Testing Modal */}
                <ABTestingModal
                    isOpen={abTestModalOpen}
                    onClose={() => setAbTestModalOpen(false)}
                    initialTab={abTestInitialTab}
                    currentTitle={localization.title}
                    currentThumbnail={customImage}
                    titleVariants={abTestTitles}
                    thumbnailVariants={abTestThumbnails}
                    onSave={handleABTestSave}
                />
            </div>
        </div>
    );
};
