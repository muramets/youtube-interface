import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type CoverVersion } from '../../../../../core/utils/youtubeApi';
import { ImageActionOverlay } from '../components/ImageActionOverlay';
import { Button } from '../../../../../components/ui/atoms/Button';

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

export const ThumbnailHistoryModal: React.FC<ThumbnailHistoryModalProps> = ({
    isOpen,
    onClose,
    currentThumbnail, // Restored
    history,
    onApply,
    onDelete,
    onClone,
    cloningVersion,
    currentVersionInfo
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [openTooltipTimestamp, setOpenTooltipTimestamp] = useState<number | null>(null);
    const [isCurrentTooltipOpen, setIsCurrentTooltipOpen] = useState(false);
    const [isHistoricalTooltipOpen, setIsHistoricalTooltipOpen] = useState(false);

    // Sync selectedIndex when history changes or on initial open
    useEffect(() => {
        if (!isOpen || !history.length) return;

        // If we haven't selected anything yet, try to find current thumbnail
        const currentIdx = history.findIndex(v => v.url === currentThumbnail);
        if (currentIdx !== -1 && selectedIndex === 0 && direction === 0) {
            setSelectedIndex(currentIdx);
        } else if (selectedIndex >= history.length) {
            // If history shrank (deletion), pull index back
            setSelectedIndex(Math.max(0, history.length - 1));
        }
    }, [history.length, currentThumbnail, isOpen]);

    // Synchronized slide animation with significant overlap to eliminate gap
    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? '90%' : '-90%',
            zIndex: 2, // Entering image on top
            filter: 'blur(16px)'
        }),
        center: {
            zIndex: 1,
            x: 0,
            filter: 'blur(0px)',
            transition: {
                x: { duration: 0.5, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
                filter: { duration: 0.4 }
            }
        },
        exit: (direction: number) => ({
            zIndex: 0, // Exiting image below
            x: direction < 0 ? '90%' : '-90%',
            filter: 'blur(16px)',
            transition: {
                x: { duration: 0.5, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
                filter: { duration: 0.4 }
            }
        })
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.045,
                delayChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                duration: 0.3,
                ease: 'easeOut' as const
            }
        }
    };

    // Filter out current thumbnail from history to avoid redundant comparison if needed
    // But usually history includes everything. Let's keep it simple.

    useEffect(() => {
        if (isOpen && history.length > 0) {
            setSelectedIndex(0);
        }
    }, [isOpen, history.length]);

    // Keyboard navigation: Arrow keys to browse thumbnails
    // Must be before the early return to maintain hook order
    useEffect(() => {
        if (!isOpen || history.length <= 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isAnimating) return; // Block navigation during animation

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsAnimating(true);
                setDirection(1);
                setSelectedIndex((prev) => (prev + 1) % history.length);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setIsAnimating(true);
                setDirection(-1);
                setSelectedIndex((prev) => (prev - 1 + history.length) % history.length);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, history.length, isAnimating]);

    if (!isOpen) return null;

    const selectedVersion = history[selectedIndex];

    const handleNext = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setDirection(1);
        setSelectedIndex((prev) => (prev + 1) % history.length);
    };

    const handlePrev = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setDirection(-1);
        setSelectedIndex((prev) => (prev - 1 + history.length) % history.length);
    };

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
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
                        onClick={onClose}
                        className="!p-2 !rounded-full"
                    >
                        <X size={24} />
                    </Button>
                </div>

                {/* Main Comparison Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-10">
                    <div className={`grid gap-16 items-center relative transition-all duration-300
                        ${currentThumbnail ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 flex justify-center'}`}>
                        {/* Current (Left) - Only show if currentThumbnail exists */}
                        {currentThumbnail && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">Current Version</span>
                                </div>
                                <div className={`aspect-video rounded-xl overflow-hidden border transition-all bg-black/40 shadow-inner group relative
                                ${isCurrentTooltipOpen ? 'border-white/20 ring-1 ring-white/10' : 'border-white/10'}`}>
                                    {currentThumbnail ? (
                                        <img src={currentThumbnail} alt="Current" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-modal-text-secondary italic">
                                            No current thumbnail
                                        </div>
                                    )}
                                    <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />

                                    {/* Overlay for Current Version */}
                                    <ImageActionOverlay
                                        version={currentVersionInfo?.version || history.find(v => v.url === currentThumbnail)?.version || 0}
                                        originalName={currentVersionInfo?.originalName || history.find(v => v.url === currentThumbnail)?.originalName}
                                        onDelete={() => {
                                            if (onDelete) {
                                                const item = history.find(v => v.url === currentThumbnail);
                                                if (item) onDelete(item.timestamp);
                                                onApply('', false); // Clear from form without closing modal
                                            } else {
                                                onApply('', false);
                                            }
                                        }}
                                        onTooltipOpenChange={setIsCurrentTooltipOpen}
                                    // No clone for current as per request
                                    />
                                </div>
                            </div>
                        )}

                        {/* Historical (Right) */}
                        <div className={`space-y-4 relative ${!currentThumbnail ? 'w-full max-w-xl mx-auto' : ''}`}>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#3ea6ff]">
                                    Historical
                                </span>
                                <span className="text-[10px] text-modal-text-secondary font-medium">
                                    {selectedVersion ? new Date(selectedVersion.timestamp).toLocaleDateString() : ''}
                                </span>
                            </div>

                            <div className="relative group z-20">
                                <div className={`aspect-video rounded-xl overflow-hidden border transition-all bg-black/40 shadow-2xl relative
                                    ${isHistoricalTooltipOpen ? 'border-[#3ea6ff]/60 ring-1 ring-[#3ea6ff]/20' : 'border-[#3ea6ff]/30'}`}>
                                    <AnimatePresence initial={false} custom={direction}>
                                        <motion.img
                                            key={selectedVersion?.url}
                                            custom={direction}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            onAnimationComplete={() => setIsAnimating(false)}
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
                                                if (onDelete) {
                                                    onDelete(selectedVersion.timestamp);
                                                    if (selectedVersion.url === currentThumbnail) {
                                                        onApply('', false); // Clear from form without closing modal
                                                    }
                                                }
                                            }}
                                            onClone={() => onClone && onClone(selectedVersion)}
                                            isCloning={cloningVersion === selectedVersion.version}
                                            className="z-30" // Ensure above arrows if needed, or manage z-index carefully
                                            onTooltipOpenChange={setIsHistoricalTooltipOpen}
                                        />
                                    )}
                                </div>

                                {/* Quick Nav Arrows - sleek frozen blur style from timeline controls */}
                                {history.length > 1 && (
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

                        {/* Comparison Indicator (Middle) - Only if comparing */}
                        {currentThumbnail && (
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

                <div className="px-8 bg-modal-surface/50 border-t border-modal-border">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between py-4">
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="flex gap-1.5 overflow-x-auto p-2 scrollbar-hide -mx-2 px-2"
                            >
                                {history.map((version, index) => (
                                    <motion.div
                                        key={version.timestamp}
                                        variants={itemVariants}
                                        onClick={() => {
                                            setDirection(index > selectedIndex ? 1 : -1);
                                            setSelectedIndex(index);
                                        }}
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

                                        {/* Overlay for Carousel Items - No Clone button requested */}
                                        <ImageActionOverlay
                                            version={version.version}
                                            originalName={version.originalName}
                                            onDelete={() => {
                                                if (onDelete) {
                                                    onDelete(version.timestamp);
                                                    if (version.url === currentThumbnail) {
                                                        onApply('', false); // Clear from form without closing modal
                                                    }
                                                }
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
                                {history.length} versions in history
                            </div>
                            <div className="flex gap-3">
                                <Button variant="secondary" size="sm" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        if (selectedVersion) {
                                            onApply(selectedVersion.url);
                                            onClose();
                                        }
                                    }}
                                    disabled={!selectedVersion}
                                    className="!bg-[#3ea6ff] !text-[#1f1f1f] hover:!bg-[#65b8ff]"
                                >
                                    Apply Version
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div >,
        document.body
    );
};
