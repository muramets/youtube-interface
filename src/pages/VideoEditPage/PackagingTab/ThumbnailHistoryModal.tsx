import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type CoverVersion } from '../../../utils/youtubeApi';

interface ThumbnailHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentThumbnail: string;
    history: CoverVersion[];
    onApply: (url: string) => void;
}

export const ThumbnailHistoryModal: React.FC<ThumbnailHistoryModalProps> = ({
    isOpen,
    onClose,
    currentThumbnail,
    history,
    onApply
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [direction, setDirection] = useState(0);

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? '100%' : '-100%'
        }),
        center: {
            zIndex: 1,
            x: 0
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? '100%' : '-100%'
        })
    };

    // Filter out current thumbnail from history to avoid redundant comparison if needed
    // But usually history includes everything. Let's keep it simple.

    useEffect(() => {
        if (isOpen && history.length > 0) {
            setSelectedIndex(0);
        }
    }, [isOpen, history.length]);

    if (!isOpen) return null;

    const selectedVersion = history[selectedIndex];

    const handleNext = () => {
        setDirection(1);
        setSelectedIndex((prev) => (prev + 1) % history.length);
    };

    const handlePrev = () => {
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
                className="relative bg-[#1f1f1f] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-white/5">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Compare Version History</h2>
                        <p className="text-sm text-text-secondary mt-0.5">Compare your current thumbnail with previous versions</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors text-text-secondary hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Main Comparison Area */}
                <div className="flex-1 overflow-y-auto p-5 lg:p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative">
                        {/* Current (Left) */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Current Version</span>
                            </div>
                            <div className="aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group relative">
                                {currentThumbnail ? (
                                    <img src={currentThumbnail} alt="Current" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-text-secondary italic">
                                        No current thumbnail
                                    </div>
                                )}
                                <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />
                            </div>
                        </div>

                        {/* Historical (Right) */}
                        <div className="space-y-4 relative">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#3ea6ff]">
                                    Historical: v{selectedVersion?.version || '?'}
                                </span>
                                <span className="text-[10px] text-text-secondary font-medium">
                                    {selectedVersion ? new Date(selectedVersion.timestamp).toLocaleDateString() : ''}
                                </span>
                            </div>

                            <div className="relative group">
                                <div className="aspect-video rounded-xl overflow-hidden border border-[#3ea6ff]/30 bg-black/40 shadow-2xl relative">
                                    <AnimatePresence initial={false} custom={direction}>
                                        <motion.img
                                            key={selectedVersion?.url}
                                            custom={direction}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{
                                                x: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
                                            }}
                                            src={selectedVersion?.url}
                                            alt={`Version ${selectedVersion?.version}`}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    </AnimatePresence>
                                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
                                </div>

                                {/* Quick Nav Arrows */}
                                {history.length > 1 && (
                                    <>
                                        <button
                                            onClick={handlePrev}
                                            className="absolute left-[-20px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white backdrop-blur-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all z-10"
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button
                                            onClick={handleNext}
                                            className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white backdrop-blur-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all z-10"
                                        >
                                            <ChevronRight size={24} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Comparison Indicator (Middle) */}
                        <div className="hidden lg:flex absolute inset-0 items-center justify-center z-10 pointer-events-none">
                            <span className="text-text-secondary font-bold text-[10px] tracking-widest opacity-50 mt-6">
                                VS
                            </span>
                        </div>
                    </div>
                </div>

                {/* Version Selector Ribbon (Bottom) */}
                <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-1.5 overflow-x-auto p-2 scrollbar-hide -mx-2 px-2">
                                {history.map((version, index) => (
                                    <button
                                        key={version.timestamp}
                                        onClick={() => {
                                            setDirection(index > selectedIndex ? 1 : -1);
                                            setSelectedIndex(index);
                                        }}
                                        className={`flex-shrink-0 w-28 aspect-video rounded-lg overflow-hidden border-2 transition-all relative group/item
                                            ${selectedIndex === index
                                                ? 'border-[#3ea6ff] scale-105 z-10 shadow-lg shadow-[#3ea6ff]/10'
                                                : 'border-transparent opacity-60 hover:opacity-100 hover:border-white/20'}`}
                                    >
                                        <img src={version.url} alt={`v${version.version}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/20 group-hover/item:bg-transparent transition-colors" />
                                        {selectedIndex === index && (
                                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#3ea6ff] flex items-center justify-center shadow-lg">
                                                <Check size={10} strokeWidth={3} className="text-[#1f1f1f]" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10">
                                            v{version.version}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-6">
                            <div className="text-sm text-text-secondary font-medium">
                                {history.length} versions in history
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-full text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (selectedVersion) {
                                            onApply(selectedVersion.url);
                                            onClose();
                                        }
                                    }}
                                    disabled={!selectedVersion}
                                    className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all
                                        ${selectedVersion
                                            ? 'bg-[#3ea6ff] text-[#1f1f1f] hover:bg-[#65b8ff] active:scale-95'
                                            : 'bg-white/10 text-text-secondary cursor-not-allowed'}`}
                                >
                                    Apply Version
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};
