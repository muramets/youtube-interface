import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type CoverVersion } from '../../../../../core/utils/youtubeApi';
import { ImageActionOverlay } from '../components/ImageActionOverlay';
import { Button } from '../../../../../components/ui/atoms/Button';
import { useThumbnailHistoryModalState } from './hooks';
import { slideVariants, containerVariants, itemVariants } from './constants';

export interface ThumbnailHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentThumbnail: string | null;
    history: CoverVersion[];
    onApply: (url: string, close?: boolean) => void;
    onDelete?: (timestamp: number) => void;
    onClone?: (version: CoverVersion) => void;
    cloningVersion?: number | null;
    currentVersionInfo?: {
        version?: number;
        originalName?: string;
    };
}

/**
 * Modal for comparing and applying thumbnail versions from history.
 * 
 * BUSINESS LOGIC: Pending Changes Pattern
 * ----------------------------------------
 * All changes (deletions, version selection) are tracked as "pending"
 * and NOT applied until the user clicks "Apply Version":
 * 
 * - Cancel → discards all changes, closes modal (no side effects)
 * - Apply Version → commits changes to parent, closes modal
 * - X button → same as Cancel
 * 
 * This ensures users can safely explore and modify without fear
 * of accidental changes being persisted.
 */
export const ThumbnailHistoryModal: React.FC<ThumbnailHistoryModalProps> = ({
    isOpen,
    onClose,
    currentThumbnail,
    history,
    onApply,
    onDelete,
    onClone,
    cloningVersion,
    currentVersionInfo
}) => {
    const {
        selectedIndex,
        direction,
        selectedVersion,
        visibleHistory,
        effectiveCurrentThumbnail,
        pendingChanges,
        openTooltipTimestamp,
        isCurrentTooltipOpen,
        isHistoricalTooltipOpen,
        handleNext,
        handlePrev,
        handleThumbnailSelect,
        setOpenTooltipTimestamp,
        setIsCurrentTooltipOpen,
        setIsHistoricalTooltipOpen,
        onAnimationComplete,
        markForDeletion,
        discardChanges,
        getChangesToApply
    } = useThumbnailHistoryModalState({
        isOpen,
        history,
        currentThumbnail
    });

    if (!isOpen) return null;

    /**
     * Handle Cancel: discard all pending changes and close.
     */
    const handleCancel = () => {
        discardChanges();
        onClose();
    };

    /**
     * Handle Apply: commit all pending changes and close.
     * 
     * BUSINESS LOGIC: Delete Current = Replace with Selected
     * --------------------------------------------------------
     * When user deletes the current thumbnail in this modal, we don't
     * just clear it — we replace it with the currently selected
     * historical version. This is the expected behavior:
     * 
     * - User wants to "undo" current thumbnail → picks historical → Apply
     * - User deletes current from overlay → the selected historical becomes new current
     * - User deletes ALL versions → Apply clears the current thumbnail
     * 
     * To actually clear the thumbnail, user should use "More" > "Remove"
     * in the main Packaging tab, not this History modal.
     */
    const handleApply = () => {
        const changes = getChangesToApply();

        // 1. Execute pending deletions from history
        if (onDelete && changes.deletedTimestamps.length > 0) {
            changes.deletedTimestamps.forEach(timestamp => {
                onDelete(timestamp);
            });
        }

        // 2. Determine what thumbnail to apply
        if (selectedVersion) {
            // Apply selected historical version
            onApply(selectedVersion.url);
        } else if (visibleHistory.length === 0) {
            // All versions deleted → clear the thumbnail
            // This is an explicit user action: they deleted everything
            onApply('');
        } else if (changes.thumbnailUrl !== null && changes.thumbnailUrl !== '') {
            // Explicit pending thumbnail URL (not empty)
            onApply(changes.thumbnailUrl);
        }

        onClose();
    };

    // Check if all versions have been deleted (for empty state)
    const allVersionsDeleted = visibleHistory.length === 0;

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            {/* Backdrop - same as Cancel */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCancel}
                className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />

            {/* Modal Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-modal-bg border border-modal-border rounded-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-modal-border">
                    <div>
                        <h2 className="text-xl font-semibold text-modal-text-primary">Compare Version History</h2>
                        <p className="text-sm text-modal-text-secondary mt-0.5">Compare your current thumbnail with previous versions</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancel}
                        className="!p-2 !rounded-full"
                    >
                        <X size={24} />
                    </Button>
                </div>

                {/* Main Comparison Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-10">
                    <div className={`grid gap-16 items-center relative transition-all duration-300
                        ${effectiveCurrentThumbnail ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 flex justify-center'}`}>

                        {/* Current (Left) - Only show if current thumbnail exists */}
                        {effectiveCurrentThumbnail && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">Current Version</span>
                                </div>
                                <div className={`aspect-video rounded-xl overflow-hidden border transition-all bg-black/40 shadow-inner group relative
                                ${isCurrentTooltipOpen ? 'border-white/20 ring-1 ring-white/10' : 'border-white/10'}`}>
                                    <img src={effectiveCurrentThumbnail} alt="Current" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />

                                    {/* Overlay for Current Version */}
                                    <ImageActionOverlay
                                        version={currentVersionInfo?.version || history.find(v => v.url === effectiveCurrentThumbnail)?.version || 0}
                                        originalName={currentVersionInfo?.originalName || history.find(v => v.url === effectiveCurrentThumbnail)?.originalName}
                                        onDelete={() => {
                                            // Mark for deletion (pending, not immediate)
                                            const item = history.find(v => v.url === effectiveCurrentThumbnail);
                                            if (item) {
                                                markForDeletion(item.timestamp, item.url);
                                            } else {
                                                // Current thumbnail not in history, just clear it
                                                markForDeletion(0, effectiveCurrentThumbnail);
                                            }
                                        }}
                                        onTooltipOpenChange={setIsCurrentTooltipOpen}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Historical (Right) */}
                        <div className={`space-y-4 relative ${!effectiveCurrentThumbnail ? 'w-full max-w-xl mx-auto' : ''}`}>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#3ea6ff]">
                                    {allVersionsDeleted ? 'No Versions' : 'Historical'}
                                </span>
                                <span className="text-[10px] text-modal-text-secondary font-medium">
                                    {selectedVersion ? new Date(selectedVersion.timestamp).toLocaleDateString() : ''}
                                </span>
                            </div>

                            <div className="relative group z-20">
                                <div className={`aspect-video rounded-xl overflow-hidden border transition-all bg-black/40 shadow-2xl relative
                                    ${allVersionsDeleted
                                        ? 'border-white/10'
                                        : (isHistoricalTooltipOpen ? 'border-[#3ea6ff]/60 ring-1 ring-[#3ea6ff]/20' : 'border-[#3ea6ff]/30')}`}>

                                    {/* Empty State - All versions deleted */}
                                    {allVersionsDeleted ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                                <svg
                                                    className="w-8 h-8 text-modal-text-secondary opacity-60"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                    />
                                                </svg>
                                            </div>
                                            <p className="text-modal-text-secondary text-sm font-medium mb-1">
                                                All versions removed
                                            </p>
                                            <p className="text-modal-text-secondary/60 text-xs">
                                                Click Apply to clear the current thumbnail
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <AnimatePresence initial={false} custom={direction}>
                                                <motion.img
                                                    key={selectedVersion?.url}
                                                    custom={direction}
                                                    variants={slideVariants}
                                                    initial="enter"
                                                    animate="center"
                                                    exit="exit"
                                                    onAnimationComplete={onAnimationComplete}
                                                    transition={{
                                                        x: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
                                                    }}
                                                    src={selectedVersion?.url}
                                                    alt={`Version ${selectedVersion?.version}`}
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                />
                                            </AnimatePresence>
                                            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />

                                            {/* Overlay for Historical Preview */}
                                            {selectedVersion && (
                                                <ImageActionOverlay
                                                    version={selectedVersion.version}
                                                    originalName={selectedVersion.originalName}
                                                    onDelete={() => {
                                                        // Mark for deletion (pending)
                                                        markForDeletion(selectedVersion.timestamp, selectedVersion.url);
                                                    }}
                                                    onClone={() => onClone && onClone(selectedVersion)}
                                                    isCloning={cloningVersion === selectedVersion.version}
                                                    className="z-30"
                                                    onTooltipOpenChange={setIsHistoricalTooltipOpen}
                                                />
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Quick Nav Arrows - only show if more than 1 visible version */}
                                {visibleHistory.length > 1 && (
                                    <>
                                        <div className="absolute left-[-40px] top-0 bottom-0 w-[80px] flex items-center justify-start z-10">
                                            <button
                                                onClick={handlePrev}
                                                className="ml-4 w-10 h-10 rounded-full bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg 
                                                    flex items-center justify-center text-text-secondary
                                                    transition-all hover:brightness-125 hover:text-text-primary hover:scale-110 hover:animate-none
                                                    animate-[pulse-subtle_2s_ease-in-out_infinite]"
                                            >
                                                <ChevronLeft size={24} />
                                            </button>
                                        </div>
                                        <div className="absolute right-[-40px] top-0 bottom-0 w-[80px] flex items-center justify-end z-10">
                                            <button
                                                onClick={handleNext}
                                                className="mr-4 w-10 h-10 rounded-full bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg 
                                                    flex items-center justify-center text-text-secondary
                                                    transition-all hover:brightness-125 hover:text-text-primary hover:scale-110 hover:animate-none
                                                    animate-[pulse-subtle_2s_ease-in-out_infinite]"
                                            >
                                                <ChevronRight size={24} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Comparison Indicator (Middle) */}
                        {effectiveCurrentThumbnail && (
                            <div className="hidden lg:flex absolute inset-0 items-center justify-center z-10 pointer-events-none">
                                <div className="px-3 py-1.5 rounded-full">
                                    <span className="text-modal-text-secondary font-bold text-xs tracking-widest opacity-80">
                                        VS
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 bg-modal-surface/50 border-t border-modal-border">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between py-4">
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="flex gap-1.5 overflow-x-auto p-2 scrollbar-hide -mx-2 px-2"
                            >
                                {visibleHistory.map((version, index) => (
                                    <motion.div
                                        key={version.timestamp}
                                        variants={itemVariants}
                                        onClick={() => handleThumbnailSelect(index)}
                                        className={`flex-shrink-0 w-36 aspect-video rounded-lg overflow-hidden border-2 transition-all relative group group/item cursor-pointer
                                            ${selectedIndex === index
                                                ? 'border-[#3ea6ff] scale-105 z-10 shadow-lg shadow-[#3ea6ff]/10'
                                                : (openTooltipTimestamp === version.timestamp
                                                    ? 'opacity-100 border-white/20 ring-1 ring-white/10'
                                                    : 'border-transparent opacity-60 hover:opacity-100 hover:border-white/20')}`}
                                    >
                                        <img
                                            src={version.url}
                                            alt={`v.${version.version}`}
                                            className="w-full h-full object-cover"
                                        />

                                        {/* Overlay for Carousel Items */}
                                        <ImageActionOverlay
                                            version={version.version}
                                            originalName={version.originalName}
                                            onDelete={() => {
                                                // Mark for deletion (pending)
                                                markForDeletion(version.timestamp, version.url);
                                            }}
                                            isCloning={cloningVersion === version.version}
                                            size="small"
                                            onTooltipOpenChange={(open) => setOpenTooltipTimestamp(open ? version.timestamp : null)}
                                        />

                                        {selectedIndex === index && (
                                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#3ea6ff] flex items-center justify-center shadow-lg pointer-events-none">
                                                <Check size={10} strokeWidth={3} className="text-[#1f1f1f]" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 pointer-events-none">
                                            v{version.version}
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>

                        <div className="flex items-center justify-between border-t border-modal-border py-4">
                            <div className="text-sm text-modal-text-secondary font-medium">
                                {visibleHistory.length} versions in history
                            </div>
                            <div className="flex gap-3">
                                <Button variant="secondary" size="sm" onClick={handleCancel}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleApply}
                                    disabled={!selectedVersion && !allVersionsDeleted && pendingChanges.thumbnailUrl === null}
                                    className="!bg-[#3ea6ff] !text-[#1f1f1f] hover:!bg-[#65b8ff]"
                                >
                                    {allVersionsDeleted ? 'Clear Thumbnail' : 'Apply Version'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};
