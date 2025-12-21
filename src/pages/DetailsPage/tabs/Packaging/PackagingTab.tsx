import React, { useState, useEffect, useRef } from 'react';
import { type VideoDetails } from '../../../../utils/youtubeApi';
import { PackagingForm } from './components/PackagingForm';
import { VideoPreviewCard } from './components/VideoPreviewCard';
import { LanguageTabs } from '../../../../components/Video/LanguageTabs';
import { ABTestingModal } from './modals/ABTestingModal';
import { useChannelStore } from '../../../../stores/channelStore';
import { usePackagingLocalization } from './hooks/usePackagingLocalization';
import { usePackagingFormState } from './hooks/usePackagingFormState';
import { useABTesting } from './hooks/useABTesting';
import { usePackagingActions } from './hooks/usePackagingActions';
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
}

export const PackagingTab: React.FC<PackagingTabProps> = ({ video, versionState, onDirtyChange }) => {
    const { currentChannel } = useChannelStore();
    const sentinelRef = useRef<HTMLDivElement>(null);
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
        initialTitles: video.abTestTitles,
        initialThumbnails: video.abTestThumbnails,
        initialResults: video.abTestResults
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
        abTesting
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


    // ============================================================================
    // ACTIONS: Save / Undo / Versions
    // ============================================================================
    // Logic extracted to usePackagingActions hook.


    // Derived UI State
    const isViewingActiveVersion = versionState.viewingVersion === versionState.activeVersion;
    const headerTitle = versionState.viewingVersion === 'draft'
        ? 'Video Packaging (Draft)'
        : `Video Packaging v.${versionState.viewingVersion}`;


    return (
        <div className="flex-1">
            <div ref={sentinelRef} className="h-0" />

            {/* Sticky Header */}
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center gap-4 max-w-[1050px]">
                    <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>

                    {!isViewingActiveVersion && versionState.viewingVersion !== 'draft' && (
                        <button onClick={actions.handleRestore} className="px-4 py-1.5 rounded-full text-sm font-medium bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 transition-colors">
                            Restore this version
                        </button>
                    )}

                    <div className="flex-1" />

                    {!isViewingOldVersion && (
                        <div className="flex gap-3">
                            <button
                                onClick={actions.handleCancel}
                                disabled={!formState.isDirty}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${formState.isDirty ? 'bg-button-secondary-bg text-text-primary hover:bg-button-secondary-hover' : 'bg-button-secondary-bg text-text-tertiary cursor-not-allowed'}`}
                            >
                                Undo changes
                            </button>
                            <button
                                onClick={actions.handleSave}
                                disabled={!formState.isDirty || actions.isSaving}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${formState.isDirty && !actions.isSaving ? 'bg-text-primary text-bg-primary hover:opacity-90' : 'bg-button-secondary-bg text-text-tertiary cursor-not-allowed'}`}
                            >
                                {actions.isSaving ? 'Saving...' : formState.isDirty ? 'Save as draft' : 'Save'}
                            </button>

                            {(formState.isDirty || versionState.viewingVersion === 'draft') && (
                                <button
                                    onClick={actions.handleSaveAsNewVersion}
                                    disabled={actions.isSaving}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border border-[#3ea6ff] text-[#3ea6ff] hover:bg-[#3ea6ff]/10 ${actions.isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    Save as v.{versionState.currentVersionNumber}
                                </button>
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
                            setCoverImage={formState.setCustomImage}
                            publishedUrl={formState.publishedVideoId}
                            setPublishedUrl={formState.setPublishedVideoId}
                            videoRender={formState.videoRender}
                            setVideoRender={formState.setVideoRender}
                            audioRender={formState.audioRender}
                            setAudioRender={formState.setAudioRender}
                            readOnly={isViewingOldVersion}

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
                                version: video.customImageVersion,
                                originalName: video.customImageName
                            }}
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
