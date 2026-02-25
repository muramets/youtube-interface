import React, { useState } from 'react';
import { Trash2, ListPlus, Home } from 'lucide-react';
import { FloatingBar } from '../../../components/ui/organisms/FloatingBar';
import { AddToPlaylistModal } from '../../Playlists/modals/AddToPlaylistModal';
import { CanvasPageSelector } from '../../Canvas/components/CanvasPageSelector';

interface VideoSelectionFloatingBarProps {
    selectedIds: Set<string>;
    onClearSelection: () => void;
    onDelete?: (ids: string[]) => void;
    isDeleting?: boolean;
    onAddToHome?: (ids: string[]) => void;
    onAddToCanvas?: (ids: string[], pageId: string, pageTitle: string) => void;
}

export const VideoSelectionFloatingBar: React.FC<VideoSelectionFloatingBarProps> = ({
    selectedIds,
    onClearSelection,
    onDelete,
    isDeleting = false,
    onAddToHome,
    onAddToCanvas,
}) => {
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);

    // Show for 1+ selected (canvas action makes sense for single video too)
    if (selectedIds.size < 1) return null;

    return (
        <>
            <FloatingBar
                title={selectedIds.size === 1 ? '1 selected' : `${selectedIds.size} selected`}
                position={{ x: 0, y: 0 }}
                onClose={onClearSelection}
                isDocked={true}
                dockingStrategy="fixed"
            >
                {({ openAbove }) => (
                    <>
                        <button
                            onClick={() => setShowPlaylistModal(true)}
                            className="p-2 hover:bg-white/10 rounded-full text-text-primary transition-colors border-none cursor-pointer flex items-center justify-center"
                            title="Save to playlist"
                        >
                            <ListPlus size={20} />
                        </button>

                        {onAddToHome && (
                            <button
                                onClick={() => onAddToHome(Array.from(selectedIds))}
                                className="p-2 hover:bg-white/10 rounded-full text-text-primary transition-colors border-none cursor-pointer flex items-center justify-center"
                                title="Add to Home"
                            >
                                <Home size={20} />
                            </button>
                        )}

                        {onAddToCanvas && (
                            <CanvasPageSelector
                                isOpen={canvasMenuOpen}
                                openAbove={openAbove}
                                onToggle={() => setCanvasMenuOpen(!canvasMenuOpen)}
                                onSelectPage={(pageId, pageTitle) => {
                                    onAddToCanvas(Array.from(selectedIds), pageId, pageTitle);
                                    setCanvasMenuOpen(false);
                                }}
                                buttonClassName="text-text-primary hover:text-white hover:bg-white/10"
                                selectedVideoIds={Array.from(selectedIds)}
                            />
                        )}

                        {onDelete && (
                            <>
                                <div className="w-px h-6 bg-white/10 mx-1" />

                                <button
                                    onClick={() => onDelete(Array.from(selectedIds))}
                                    disabled={isDeleting}
                                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors disabled:opacity-50 border-none cursor-pointer flex items-center justify-center"
                                    title="Delete"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </>
                        )}
                    </>
                )}
            </FloatingBar>

            {showPlaylistModal && (
                <AddToPlaylistModal
                    videoIds={Array.from(selectedIds)}
                    onClose={() => setShowPlaylistModal(false)}
                />
            )}
        </>
    );
};
