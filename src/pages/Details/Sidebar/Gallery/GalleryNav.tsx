import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Image, Plus, Settings, Trash2, ExternalLink } from 'lucide-react';
import { SidebarNavHeader } from '../SidebarNavHeader';
import { SidebarVersionItem } from '../Packaging/SidebarVersionItem';
import { ConfirmationModal } from '../../../../components/ui/organisms/ConfirmationModal';
import type { GallerySource } from '../../../../core/types/gallery';
import { DEFAULT_SOURCE_ID } from '../../../../core/types/gallery';
import { Dropdown } from '../../../../components/ui/molecules/Dropdown';
import { SourceModal } from './SourceModal';

interface GalleryNavProps {
    itemCount: number;
    sources: GallerySource[];
    activeSourceId: string | null;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onSelect: () => void;
    onSourceClick: (sourceId: string | null) => void;
    onAddSource: () => void;
    onDeleteSource: (sourceId: string) => void;
    onUpdateSource: (sourceId: string, data: { type?: import('../../../../core/types/gallery').GallerySourceType; label?: string; url?: string }) => void;
}

/**
 * Droppable wrapper for source items using @dnd-kit.
 * Allows dropping gallery cards to move them to this source.
 */
const DroppableSourceItem: React.FC<{
    source: GallerySource;
    isViewing: boolean;
    isActive: boolean;
    onClick: () => void;
    onOpenMenu: (e: React.MouseEvent) => void;
}> = ({ source, isViewing, isActive, onClick, onOpenMenu }) => {
    // useDroppable from dnd-kit - works with DndContext
    const { setNodeRef, isOver } = useDroppable({
        id: `gallery-source-${source.id}`,
        data: { type: 'gallery-source', sourceId: source.id }
    });

    return (
        <div
            ref={setNodeRef}
            className={`transition-all rounded-lg ${isOver
                ? 'bg-white/10'
                : ''
                }`}
        >
            <SidebarVersionItem
                label={source.label}
                isViewing={isViewing}
                isVideoActive={isActive}
                onClick={onClick}
                onOpenMenu={onOpenMenu}
            />
        </div>
    );
};

/**
 * Sidebar navigation item for Visual Gallery tab.
 * Shows image icon with item count badge and expandable source list.
 * Source items are drop targets for gallery cards via dnd-kit.
 */
export const GalleryNav: React.FC<GalleryNavProps> = ({
    itemCount,
    sources,
    activeSourceId,
    isActive,
    isExpanded,
    onToggle,
    onSelect,
    onSourceClick,
    onAddSource,
    onDeleteSource,
    onUpdateSource
}) => {
    const hasContent = sources.length > 0;

    // Menu State
    const [menuState, setMenuState] = useState<{ anchorEl: HTMLElement | null; sourceId: string | null }>({ anchorEl: null, sourceId: null });

    // Edit Modal State
    const [editModal, setEditModal] = useState<{ isOpen: boolean; source: GallerySource | null }>({ isOpen: false, source: null });

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        sourceId: string | null;
        sourceName: string;
    }>({ isOpen: false, sourceId: null, sourceName: '' });

    const handleMenuOpen = (e: React.MouseEvent, sourceId: string) => {
        if (menuState.sourceId === sourceId) {
            setMenuState({ anchorEl: null, sourceId: null });
        } else {
            setMenuState({ anchorEl: e.currentTarget as HTMLElement, sourceId });
        }
    };

    const handleMenuClose = () => {
        setMenuState({ anchorEl: null, sourceId: null });
    };

    const handleEditClick = () => {
        const source = sources.find(s => s.id === menuState.sourceId);
        if (source) {
            setEditModal({ isOpen: true, source });
        }
        handleMenuClose();
    };

    const handleDeleteClick = () => {
        const source = sources.find(s => s.id === menuState.sourceId);
        if (source) {
            setDeleteConfirm({
                isOpen: true,
                sourceId: source.id,
                sourceName: source.label
            });
        }
        handleMenuClose();
    };

    const handleConfirmDelete = () => {
        if (deleteConfirm.sourceId) {
            onDeleteSource(deleteConfirm.sourceId);
        }
        setDeleteConfirm({ isOpen: false, sourceId: null, sourceName: '' });
    };

    const handleSaveEdit = (data: { type: import('../../../../core/types/gallery').GallerySourceType; label: string; url?: string }) => {
        if (editModal.source) {
            onUpdateSource(editModal.source.id, data);
        }
        setEditModal({ isOpen: false, source: null });
    };

    // Generic sidebar drop zone for ghost opacity
    const { setNodeRef: setSidebarRef } = useDroppable({
        id: 'sidebar-gallery-nav',
        data: { type: 'sidebar-container' }
    });

    return (
        <div ref={setSidebarRef} className="flex flex-col">
            <SidebarNavHeader
                icon={
                    <div className="relative">
                        <Image size={24} />
                        {itemCount > 0 && (
                            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-medium bg-[#3ea6ff] text-white rounded-full">
                                {itemCount > 99 ? '99+' : itemCount}
                            </span>
                        )}
                    </div>
                }
                title="Visual Gallery"
                isActive={isActive}
                isExpanded={isExpanded}
                hasContent={hasContent}
                onClick={() => {
                    onSelect();
                    // If not viewing all (i.e. has active source), reset to view all (null)
                    if (activeSourceId) {
                        onSourceClick(null);
                    }

                    if (!isExpanded && hasContent) {
                        onToggle();
                    }
                }}
                onToggle={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            />

            {/* Source List (expanded) */}
            {isExpanded && hasContent && (
                <div className="flex flex-col gap-1 py-1">
                    {sources.map(source => (
                        <DroppableSourceItem
                            key={source.id}
                            source={source}
                            isViewing={activeSourceId === source.id}
                            isActive={activeSourceId === source.id && isActive}
                            onClick={() => onSourceClick(source.id)}
                            onOpenMenu={(e) => handleMenuOpen(e, source.id)}
                        />
                    ))}

                    {/* Add Source button */}
                    <button
                        onClick={onAddSource}
                        className="flex items-center gap-2 pl-3 pr-2 py-1.5 ml-6 mr-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-colors text-sm"
                    >
                        <Plus size={14} />
                        <span>Add Source</span>
                    </button>
                </div>
            )}

            {/* Actions Dropdown */}
            <Dropdown
                isOpen={!!menuState.anchorEl}
                onClose={handleMenuClose}
                anchorEl={menuState.anchorEl}
                width={160}
            >
                <div className="p-1 space-y-0.5">
                    {/* Go to source (if URL exists) */}
                    {sources.find(s => s.id === menuState.sourceId)?.url && (
                        <button
                            onClick={() => {
                                const source = sources.find(s => s.id === menuState.sourceId);
                                if (source?.url) {
                                    window.open(source.url, '_blank');
                                }
                                handleMenuClose();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                        >
                            <ExternalLink size={14} />
                            <span>Go to source</span>
                        </button>
                    )}

                    <button
                        onClick={handleEditClick}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                    >
                        <Settings size={14} />
                        <span>Settings</span>
                    </button>
                    {/* Only show delete if not default source */}
                    {menuState.sourceId !== DEFAULT_SOURCE_ID && (
                        <button
                            onClick={handleDeleteClick}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                        >
                            <Trash2 size={14} />
                            <span>Delete</span>
                        </button>
                    )}
                </div>
            </Dropdown>

            {/* Edit Modal (Local) */}
            <SourceModal
                isOpen={editModal.isOpen}
                onClose={() => setEditModal({ isOpen: false, source: null })}
                onSave={handleSaveEdit}
                mode="edit"
                initialData={editModal.source ? {
                    label: editModal.source.label,
                    url: editModal.source.url,
                    type: editModal.source.type
                } : undefined}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, sourceId: null, sourceName: '' })}
                onConfirm={handleConfirmDelete}
                title="Delete Source"
                message={
                    <>
                        Are you sure you want to delete <strong>"{deleteConfirm.sourceName}"</strong>?
                        <br /><br />
                        <span className="text-red-400">
                            All images in this source will be permanently deleted.
                        </span>
                    </>
                }
                confirmLabel="Delete"
            />
        </div>
    );
};
