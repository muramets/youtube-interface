import React, { useState, useEffect, useRef } from 'react';
import { type VideoDetails } from '../../../../core/utils/youtubeApi';
import { PackagingForm } from './components/PackagingForm';
import { VideoPreviewCard } from './components/VideoPreviewCard';
import { LanguageTabs } from '../../../../features/Video/LanguageTabs';
import { ABTestingModal } from '../../../../components/Shared/ABTesting';
import { Button } from '../../../../components/ui/atoms/Button';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useAuth } from '../../../../core/hooks/useAuth';
import { uploadImageToStorage } from '../../../../core/services/storageService';
import { resizeImageToBlob } from '../../../../core/utils/imageUtils';
import { usePackagingLocalization } from './hooks/usePackagingLocalization';
import { usePackagingFormState } from './hooks/usePackagingFormState';
import { useABTesting } from './hooks/useABTesting';
import { usePackagingActions } from './hooks/usePackagingActions';
import { useVideos } from '../../../../core/hooks/useVideos';
import { useThumbnailActions } from '../../../../core/hooks/useThumbnailActions';
import {
    type VersionState,
    DEFAULT_TAGS,
    DEFAULT_LOCALIZATIONS,
    DEFAULT_AB_RESULTS,
    DEFAULT_COVER_HISTORY
} from './types';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface PackagingTabProps {
    video: VideoDetails;
    versionState: VersionState;
    onDirtyChange: (isDirty: boolean) => void;  // Sync dirty state to parent for version switch confirmation
    onRestoreVersion?: (version: number) => void; // Callback for restore version button
    onRequestSnapshot?: (versionNumber: number) => Promise<string | null | undefined>; // Callback for CSV snapshot request
}

export const PackagingTab: React.FC<PackagingTabProps> = ({ video, versionState, onDirtyChange, onRestoreVersion, onRequestSnapshot }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { handleLikeThumbnail, handleRemoveThumbnail } = useThumbnailActions(video.id);
    const sentinelRef = useRef<HTMLDivElement>(null);
    // Detect scroll for sticky header shadow
    const [isScrolled, setIsScrolled] = useState(false);

    // Is the user viewing an old version (read-only)?
    const isViewingOldVersion = versionState.viewingVersion !== 'draft' &&
        versionState.viewingVersion !== versionState.activeVersion;

    // 1. Hook: Localization State
    const localization = usePackagingLocalization({
        initialTitle: video.title || '',
        initialDescription: video.description || '',
        initialTags: video.tags || DEFAULT_TAGS,
        initialLocalizations: video.localizations || DEFAULT_LOCALIZATIONS
    });

    // 2. Hook: A/B Testing State
    const abTesting = useABTesting({
        initialTitles: video.abTestTitles || [],
        initialThumbnails: video.abTestThumbnails || [],
        initialResults: video.abTestResults || DEFAULT_AB_RESULTS,
        onResultsSave: (results) => actions.handleSaveResultsOnly(results),
        onTitleChange: (title) => localization.setTitle(title),
        onThumbnailChange: (thumbnail) => formState.setCustomImage(thumbnail)
    });

    // 3. Hook: Form State & Dirty Checking (consolidated)
    const formState = usePackagingFormState({
        video,
        isViewingOldVersion,
        localization,
        abTesting
    });

    // 4. Hook: Actions (Save, Versions, Clone, Restore, Languages)
    const actions = usePackagingActions({
        video,
        versionState,
        localization,
        formState,
        abTesting,
        onRequestSnapshot
    });

    // Detect scroll for sticky header shadow
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsScrolled(!entry.isIntersecting),
            { threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    // Sync dirty state with parent
    useEffect(() => {
        onDirtyChange(formState.isDirty);
    }, [formState.isDirty, onDirtyChange]);


    // ============================================================================
    // BUSINESS LOGIC: Version Loading
    // ============================================================================
    useEffect(() => {
        if (versionState.viewingVersion === 'draft') {
            // Load unsaved drafts from video prop, but only if not dirty (preserve edits)
            if (!formState.isDirty) {
                // Construct a snapshot from current props to check for changes
                const snapshotFromProps = {
                    title: video.title || '',
                    description: video.description || '',
                    tags: video.tags || DEFAULT_TAGS,
                    customImage: video.customImage || '',
                    customImageName: video.customImageName || '',
                    customImageVersion: video.customImageVersion || 1,
                    localizations: video.localizations || DEFAULT_LOCALIZATIONS,
                    abTestTitles: video.abTestTitles || DEFAULT_TAGS,
                    abTestThumbnails: video.abTestThumbnails || DEFAULT_TAGS,
                    abTestResults: video.abTestResults || DEFAULT_AB_RESULTS as { titles: number[], thumbnails: number[] },
                    coverHistory: video.coverHistory || DEFAULT_COVER_HISTORY
                };

                // Only update if prop data is actually different from what we last loaded
                // to prevent infinite loops.
                if (!formState.incomingVideoMatchesSnapshot(snapshotFromProps)) {
                    formState.resetToSnapshot(snapshotFromProps);
                }
            }
        } else {
            // Load historical version
            const versionSnapshot = versionState.getVersionSnapshot(versionState.viewingVersion);
            if (versionSnapshot) {
                const snapshot = {
                    title: versionSnapshot.title,
                    description: versionSnapshot.description,
                    tags: versionSnapshot.tags || DEFAULT_TAGS,
                    customImage: versionSnapshot.coverImage || '',
                    customImageName: versionSnapshot.originalName || '',
                    customImageVersion: typeof versionState.viewingVersion === 'number' ? versionState.viewingVersion : 1,
                    localizations: versionSnapshot.localizations || DEFAULT_LOCALIZATIONS,
                    abTestTitles: versionSnapshot.abTestTitles || DEFAULT_TAGS,
                    abTestThumbnails: versionSnapshot.abTestThumbnails || DEFAULT_TAGS,
                    abTestResults: versionSnapshot.abTestResults || DEFAULT_AB_RESULTS as { titles: number[], thumbnails: number[] },
                    coverHistory: video.coverHistory || DEFAULT_COVER_HISTORY
                };

                if (!formState.incomingVideoMatchesSnapshot(snapshot)) {
                    formState.resetToSnapshot(snapshot);
                }
            }
        }
    }, [
        versionState.viewingVersion,
        video,
        formState.isDirty,
        formState.incomingVideoMatchesSnapshot,
        formState.resetToSnapshot,
        versionState.getVersionSnapshot
    ]);

    // Beforeunload warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (formState.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [formState.isDirty]);

    // Auto-save metadata fields (publishedVideoId, videoRender, audioRender)
    // These fields don't affect packaging versions, so they auto-save independently
    useEffect(() => {
        if (isViewingOldVersion) return;

        const timer = setTimeout(() => {
            const hasMetadataChanges =
                formState.publishedVideoId !== (video.publishedVideoId || '') ||
                formState.videoRender !== (video.videoRender || '') ||
                formState.audioRender !== (video.audioRender || '');

            if (hasMetadataChanges) {
                actions.handleSaveMetadata({
                    publishedVideoId: formState.publishedVideoId,
                    videoRender: formState.videoRender,
                    audioRender: formState.audioRender
                });
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [
        formState.publishedVideoId,
        formState.videoRender,
        formState.audioRender,
        video.publishedVideoId,
        video.videoRender,
        video.audioRender,
        isViewingOldVersion,
        actions
    ]);


    // ============================================================================
    // ACTIONS: Save / Undo / Versions
    // ============================================================================
    // Logic extracted to usePackagingActions hook.


    // Derived UI State
    const isViewingActiveVersion = versionState.viewingVersion === versionState.activeVersion;

    const headerTitle = React.useMemo(() => {
        if (versionState.viewingVersion === 'draft') {
            return 'Video Packaging (Draft)';
        }
        if (typeof versionState.viewingVersion === 'number') {
            // Use the actual version number directly.
            // visualVersionMap logic removed to prevent re-indexing (e.g. v.5 becoming v.4 if v.3 is deleted).
            // This ensures header matches sidebar "v.X".
            return `Video Packaging v.${versionState.viewingVersion}`;
        }
        return 'Video Packaging';
    }, [versionState.viewingVersion]);


    return (
        <div className="flex-1">
            <div ref={sentinelRef} className="h-0" />

            {/* Sticky Header */}
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center gap-4 max-w-[1050px]">
                    <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>

                    {!isViewingActiveVersion && versionState.viewingVersion !== 'draft' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (onRestoreVersion && typeof versionState.viewingVersion === 'number') {
                                    onRestoreVersion(versionState.viewingVersion);
                                }
                            }}
                            className="bg-[#3ea6ff]/20 hover:bg-[#3ea6ff]/30"
                        >
                            Restore this version
                        </Button>
                    )}

                    <div className="flex-1" />

                    <div className="flex-1" />

                    {/* Show actions if viewing Current OR if Editing an Old Version (Dirty) */}
                    {(!isViewingOldVersion || formState.isDirty) && (
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={actions.handleCancel}
                                disabled={!formState.isDirty}
                            >
                                Undo changes
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={actions.handleSave}
                                disabled={!formState.isDirty || actions.isSaving}
                                isLoading={actions.isSavingDraft}
                            >
                                {formState.isDirty ? 'Save as draft' : 'Save'}
                            </Button>

                            {(formState.isDirty || versionState.viewingVersion === 'draft') && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={actions.handleSaveAsNewVersion}
                                    disabled={actions.isSaving}
                                    isLoading={actions.isSavingNewVersion}
                                >
                                    Save as v.{versionState.nextVisualVersionNumber}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                <div className="mb-6">
                    <LanguageTabs
                        activeLanguage={localization.activeLanguage}
                        localizations={localization.localizations}
                        onSwitchLanguage={localization.switchLanguage} // Note: simplified direct pass
                        onAddLanguage={actions.handleAddLanguage}
                        onRemoveLanguage={localization.removeLanguage}
                        savedCustomLanguages={currentChannel?.customLanguages || []}
                        onDeleteCustomLanguage={actions.handleDeleteCustomLanguage}
                    />
                </div>

                <div className="flex gap-8 max-w-[1050px] items-start">
                    <div className="flex-1 min-w-0">
                        <PackagingForm
                            title={localization.title}
                            setTitle={localization.setTitle}
                            description={localization.description}
                            setDescription={localization.setDescription}
                            tags={localization.tags}
                            setTags={localization.setTags}
                            coverImage={formState.customImage}
                            setCoverImage={(url, filename, version) => {
                                formState.setCustomImage(url);

                                // 1. If we have an explicit version (from Restore), use it
                                if (version !== undefined) {
                                    formState.setCustomImageVersion(version);
                                } else {
                                    // 2. New upload - calculate next version
                                    // We must look at BOTH history AND current version to handle the race condition
                                    // where history hasn't updated yet (from onPushToHistory).
                                    const historyMax = formState.pendingHistory.length > 0
                                        ? Math.max(...formState.pendingHistory.map(v => v.version))
                                        : 0;
                                    const currentMax = formState.customImageVersion || 0;

                                    // New version is strictly higher than anything seen so far
                                    const nextVersion = Math.max(historyMax, currentMax) + 1;
                                    formState.setCustomImageVersion(nextVersion);
                                }

                                // 3. Update filename if provided (from Restore)
                                if (filename) {
                                    formState.setCustomImageName(filename);
                                }
                            }}
                            onFileUpload={async (file: File) => {
                                // Resize and compress the image
                                const blob = await resizeImageToBlob(file, 1280, 0.7);
                                // Create path: users/{userId}/channels/{channelId}/videos/{videoId}/{timestamp}_{filename}
                                const timestamp = Date.now();
                                const path = `users/${user?.uid}/channels/${currentChannel?.id}/videos/${video.id}/${timestamp}_${file.name}`;

                                // Capture the real filename immediately
                                formState.setCustomImageName(file.name);

                                // Upload to Firebase Storage and return download URL
                                return uploadImageToStorage(blob, path);
                            }}
                            onPushToHistory={(url) => {
                                // Add current cover to history before it gets replaced
                                // Use the EXISTING version number for the item being pushed to history
                                // Do NOT calculate a new one here.
                                formState.setPendingHistory(prev => {
                                    // Prevent duplicates: specific check for existing URL
                                    // We check primarily the most recent one, but also scan the whole list just in case
                                    // to avoid any identical duplicates cluttering history.
                                    if (prev.some(v => v.url === url)) {
                                        return prev;
                                    }

                                    return [{
                                        url,
                                        version: formState.customImageVersion || 1,
                                        timestamp: Date.now(),
                                        originalName: formState.customImageName
                                    }, ...prev];
                                });
                            }}
                            publishedUrl={formState.publishedVideoId}
                            setPublishedUrl={formState.setPublishedVideoId}
                            videoRender={formState.videoRender}
                            setVideoRender={formState.setVideoRender}
                            audioRender={formState.audioRender}
                            setAudioRender={formState.setAudioRender}
                            // Allow editing even for old versions to support "Forking" (Save as Draft from history)
                            // We only disable if strictly needed, but for now we want to allow edits.
                            readOnly={false}

                            // A/B Test props
                            abTestTitles={abTesting.titles}
                            abTestThumbnails={abTesting.thumbnails}
                            abTestStatus="draft"
                            abTestResults={abTesting.results}
                            onTitleABTestClick={abTesting.openFromTitle}
                            onThumbnailABTestClick={abTesting.openFromThumbnail}

                            // History Props
                            coverHistory={formState.pendingHistory}
                            onDeleteHistoryVersion={(ts) => formState.setPendingHistory(prev => prev.filter(v => v.timestamp !== ts))}
                            onCloneFromVersion={actions.handleCloneFromVersion}
                            cloningVersion={actions.cloningVersion}
                            currentVersionInfo={{
                                // Use the explicitly tracked version from state
                                version: formState.customImageVersion,
                                originalName: formState.customImageName
                            }}
                            // Check if a clone with this thumbnail already exists
                            checkIsCloned={(thumbnailUrl) => {
                                return videos.some(v =>
                                    v.isCloned &&
                                    v.clonedFromId === video.id &&
                                    v.customImage === thumbnailUrl
                                );
                            }}
                            likedThumbnailVersions={video.likedThumbnailVersions}
                            onLikeThumbnail={handleLikeThumbnail}
                            onRemoveThumbnail={handleRemoveThumbnail}
                        />
                    </div>

                    <div className="w-80 flex-shrink-0">
                        <VideoPreviewCard video={video} currentCoverImage={formState.customImage} />
                    </div>
                </div>

                {abTesting.modalOpen && (
                    <ABTestingModal
                        isOpen={abTesting.modalOpen}
                        onClose={abTesting.closeModal}
                        initialTab={abTesting.initialTab}
                        currentTitle={localization.title}
                        currentThumbnail={formState.customImage}
                        titleVariants={abTesting.titles}
                        thumbnailVariants={abTesting.thumbnails}
                        onSave={abTesting.saveChanges}
                        initialResults={abTesting.results}
                    />
                )}
            </div>
        </div>
    );
};
