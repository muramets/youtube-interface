import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { type VideoDetails, type CoverVersion } from '../../../../core/utils/youtubeApi';
import { Toast } from '../../../../components/ui/molecules/Toast';
import { VideoForm } from './components/VideoForm';
import { SaveMenu } from './components/SaveMenu';
import { ConfirmationModal } from '../../../../components/ui/organisms/ConfirmationModal';
import { ThumbnailSection } from '../../../../features/Video/components/Thumbnail/ThumbnailSection';
import { useAddCustomVideo } from './hooks/useAddCustomVideo';
import { ABTestingModal } from '../../../../features/ABTesting';

interface AddCustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (videoData: Omit<VideoDetails, 'id'>, shouldClose?: boolean, expectedRevision?: number) => Promise<string | void>;
    onClone?: (originalVideo: VideoDetails, version: CoverVersion) => Promise<void>;
    initialData?: VideoDetails;
    initialTab?: 'details';
}

export const AddCustomVideoModal: React.FC<AddCustomVideoModalProps> = (props) => {
    const { isOpen } = props;
    const {
        // UI State
        modalRef,
        activeTab, setActiveTab,
        isStatsExpanded, setIsStatsExpanded,
        isSaving,
        cloningVersion,
        deleteConfirmation, setDeleteConfirmation,
        toastMessage, showToast, setShowToast, toastType, toastPosition,
        isEffectivePackagingDirty,
        currentChannel,
        isImageUploading,

        // Data State
        title, setTitle,
        description, setDescription,
        tags, setTags,
        viewCount, setViewCount,
        duration, setDuration,
        coverImage, setCoverImage,
        currentVersion,
        currentOriginalName, setCurrentOriginalName,
        coverHistory, setCoverHistory,


        currentPackagingVersion,
        // packagingHistory removed as it is not used in UI anymore
        isDraft,
        isPublished, setIsPublished,
        publishedUrl, setPublishedUrl,

        activeLanguage,
        localizations,
        switchLanguage,


        videoRender, setVideoRender,
        audioRender, setAudioRender,

        // Handlers
        handleBackdropClick,
        handleClose,
        handleSave,
        handleImageUpload,
        handleDeleteHistoryItem,
        handleCloneWithSave,
        handleSaveAsVersion,
        handleAddLanguage,
        handleDeleteCustomLanguage,
        setToastMessage, setToastType,

        // A/B Testing
        abTestVariants,
        abTestTitles,
        isABModalOpen,
        handleCloseABModal,
        handleOpenTitleABTest,
        handleOpenThumbnailABTest,
        handleABTestSave,
        activeABTab,
    } = useAddCustomVideo(props);

    if (!isOpen) return null;

    // Simplified: Always showing current
    const isShowingCurrent = true;

    // Simplified: Always display current values
    const getDisplayedValue = (key: 'title' | 'description' | 'tags') => {
        return key === 'title' ? title : key === 'description' ? description : tags;
    };

    return createPortal(
        <>
            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, versionNumber: null })}
                onConfirm={() => { }} // No-op as delete version is removed from modal
                title="Delete Version"
                message={`Are you sure you want to delete version ${deleteConfirmation.versionNumber}? This action cannot be undone.`}
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />

            {/* A/B Testing Modal */}
            {isABModalOpen && (
                <ABTestingModal
                    isOpen={isABModalOpen}
                    onClose={handleCloseABModal}
                    initialTab={activeABTab}
                    currentTitle={title}
                    currentThumbnail={coverImage || ''}
                    titleVariants={abTestTitles}
                    thumbnailVariants={abTestVariants}
                    onSave={handleABTestSave}
                    initialResults={{ titles: [], thumbnails: [] }}
                />
            )}

            <div className="fixed inset-0 z-modal flex items-center justify-center bg-modal-overlay backdrop-blur-sm animate-fade-in" onMouseDown={handleBackdropClick}>
                <div
                    ref={modalRef}
                    className="bg-bg-secondary w-full max-w-[1200px] h-[900px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
                    onMouseDown={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-bg-secondary">
                        <h2 className="text-xl font-semibold text-text-primary m-0">
                            Add Video
                        </h2>
                        <div className="flex items-center gap-3">
                            {activeTab === 'details' ? (
                                <SaveMenu
                                    isSaving={isSaving}
                                    isPackagingDirty={isEffectivePackagingDirty}
                                    isDraft={isDraft}
                                    hasCoverImage={!!coverImage}
                                    currentPackagingVersion={currentPackagingVersion}
                                    onSaveDraft={() => handleSave(true, true)}
                                    onSaveVersion={handleSaveAsVersion}
                                    isUploading={isImageUploading}
                                />
                            ) : null}

                            <button
                                onClick={handleClose}
                                className="p-2 rounded-full hover:bg-hover-bg text-text-primary transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/5 flex-shrink-0">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`px-4 pb-3 text-sm font-medium transition-all relative ${activeTab === 'details' ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            Packaging
                            {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-text-primary rounded-t-full" />}
                        </button>


                    </div>

                    {/* Content */}
                    <div
                        className="flex-1 custom-scrollbar overflow-y-auto"
                        style={{ scrollbarGutter: 'stable' }}
                    >
                        <div key={activeTab} className="h-full animate-fade-in">
                            {activeTab === 'details' && (
                                <div className="grid grid-cols-[1fr_352px] gap-8 items-start p-6">
                                    {/* Left Column: Inputs */}
                                    <div className="flex flex-col gap-6">
                                        <VideoForm
                                            title={getDisplayedValue('title') as string}
                                            setTitle={setTitle}
                                            description={getDisplayedValue('description') as string}
                                            setDescription={setDescription}
                                            tags={getDisplayedValue('tags') as string[]}
                                            setTags={setTags}
                                            activeLanguage={activeLanguage}
                                            localizations={localizations}
                                            onSwitchLanguage={switchLanguage}
                                            onAddLanguage={handleAddLanguage}
                                            onRemoveLanguage={handleDeleteCustomLanguage}
                                            savedCustomLanguages={currentChannel?.customLanguages}
                                            isPublished={isPublished}
                                            setIsPublished={setIsPublished}
                                            publishedUrl={publishedUrl}
                                            setPublishedUrl={setPublishedUrl}
                                            isStatsExpanded={isStatsExpanded}
                                            setIsStatsExpanded={setIsStatsExpanded}
                                            viewCount={viewCount}
                                            setViewCount={setViewCount}
                                            duration={duration}
                                            setDuration={setDuration}
                                            videoRender={videoRender}
                                            setVideoRender={setVideoRender}
                                            audioRender={audioRender}
                                            setAudioRender={setAudioRender}
                                            onShowToast={(msg, type) => {
                                                setToastMessage(msg);
                                                setToastType(type);
                                                setShowToast(true);
                                            }}
                                            readOnly={!isShowingCurrent}
                                            abTestTitles={abTestTitles}
                                            onTitleABTestClick={handleOpenTitleABTest}
                                        />
                                    </div>

                                    {/* Right Column: Packaging Preview */}
                                    <div className="w-[352px] mt-[4px]">
                                        <div className="bg-modal-surface rounded-xl shadow-lg p-3">
                                            <ThumbnailSection
                                                value={coverImage || ''}
                                                onChange={(url, filename) => {
                                                    setCoverImage(url);
                                                    if (filename) {
                                                        setCurrentOriginalName(filename);
                                                    }
                                                }}
                                                onFileUpload={handleImageUpload}
                                                onPushToHistory={(url) => {
                                                    const historyVersion: CoverVersion = {
                                                        url: url,
                                                        version: currentVersion,
                                                        timestamp: Date.now(),
                                                        originalName: currentOriginalName
                                                    };
                                                    setCoverHistory(prev => [historyVersion, ...prev]);
                                                }}
                                                history={coverHistory}
                                                onDelete={handleDeleteHistoryItem}
                                                onClone={handleCloneWithSave}
                                                cloningVersion={cloningVersion}
                                                currentVersionInfo={{
                                                    version: currentVersion,
                                                    originalName: currentOriginalName
                                                }}
                                                variants={abTestVariants}
                                                readOnly={!isShowingCurrent}
                                                widthClass="w-full"
                                                onABTestClick={handleOpenThumbnailABTest}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}


                        </div>
                    </div>
                </div>
            </div>

            <Toast
                message={toastMessage}
                isVisible={showToast}
                duration={4000}
                onClose={() => setShowToast(false)}
                type={toastType}
                position={toastPosition}
            />
        </>,
        document.body
    );
};
