import React, { useState, useRef } from 'react';
import { Check, ThumbsDown, Target } from 'lucide-react';
import { NicheItemBase } from '@/pages/Trends/Shared/NicheItemBase';
import type { SuggestedTrafficNiche, TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import { MANUAL_NICHE_PALETTE } from '@/core/stores/trendStore';
import { TrafficNicheContextMenu } from './TrafficNicheContextMenu';
import { ConfirmationModal } from '@/components/Shared/ConfirmationModal';

interface TrafficNicheItemProps {
    niche: SuggestedTrafficNiche;
    isActive: boolean; // Is menu open
    onClick: () => void;
    // Optional view count or other metadata
}

export const TrafficNicheItem: React.FC<TrafficNicheItemProps> = ({
    niche,
    isActive,
    onClick
}) => {
    // Stores & Hooks
    const { updateTrafficNiche, deleteTrafficNiche } = useTrafficNicheStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Local State
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(niche.name);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- Actions ---

    const handleUpdate = async (updates: Partial<SuggestedTrafficNiche>) => {
        if (!user || !currentChannel) return;
        await updateTrafficNiche(niche.id, updates, user.uid, currentChannel.id);
    };

    const handleDelete = async () => {
        if (!user || !currentChannel) return;
        await deleteTrafficNiche(niche.id, user.uid, currentChannel.id);
        setDeleteConfirmOpen(false);
    };

    const handleRenameSubmit = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== niche.name) {
            handleUpdate({ name: trimmed });
        }
        setIsEditing(false);
    };

    // --- Property Icon Logic ---

    const getPropertyIcon = (prop: TrafficNicheProperty) => {
        switch (prop) {
            case 'unrelated':
                return <ThumbsDown size={14} className="text-amber-700/80" />; // Brownish
            case 'targeted':
                return <Target size={14} className="text-yellow-500" />; // Gold
            case 'desired':
                return <Target size={14} className="text-blue-500" />; // Blue
            default:
                return null;
        }
    };

    // --- Context Menu Logic ---

    const handleToggleMenu = (e: React.MouseEvent, pos: { x: number, y: number }) => {
        setIsMenuOpen(!isMenuOpen);
        setMenuPosition(pos);
        setIsColorPickerOpen(false);
    };

    const handleColorClick = () => {
        setIsColorPickerOpen(!isColorPickerOpen);
        setIsMenuOpen(false);
    };

    return (
        <>
            <NicheItemBase
                id={niche.id}
                name={niche.name}
                color={niche.color}
                isActive={isActive || isMenuOpen}
                onClick={onClick}

                // Traffic Specifics
                startIcon={getPropertyIcon(niche.property)}

                // Editing
                isEditing={isEditing}
                editName={editName}
                onEditNameChange={setEditName}
                onEditNameSubmit={handleRenameSubmit}
                onEditKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') {
                        setEditName(niche.name);
                        setIsEditing(false);
                    }
                }}
                inputRef={inputRef as React.RefObject<HTMLInputElement>}

                // Color Picker
                isColorPickerOpen={isColorPickerOpen}
                colorPickerRef={colorPickerRef as React.RefObject<HTMLDivElement>}
                onColorClick={handleColorClick}
                renderColorPicker={() => (
                    <div
                        className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
                        style={{
                            left: colorPickerRef.current?.getBoundingClientRect().left,
                            top: (colorPickerRef.current?.getBoundingClientRect().bottom || 0) + 8,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, min-content)' }}>
                            {MANUAL_NICHE_PALETTE.map(color => (
                                <button
                                    key={color}
                                    onClick={() => {
                                        handleUpdate({ color });
                                        setIsColorPickerOpen(false);
                                    }}
                                    className="w-6 h-6 rounded-full transition-shadow relative hover:ring-2 hover:ring-white/50 ring-offset-1 ring-offset-[#1a1a1a]"
                                    style={{ backgroundColor: color }}
                                >
                                    {niche.color === color && (
                                        <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow-sm" strokeWidth={3} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                // Menu Interactions
                onToggleMenu={handleToggleMenu}
            />

            {/* Context Menu */}
            <TrafficNicheContextMenu
                niche={niche}
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                position={menuPosition}
                onRename={() => {
                    setIsEditing(true);
                    setEditName(niche.name);
                    setIsMenuOpen(false);
                }}
                onDelete={() => {
                    setDeleteConfirmOpen(true);
                    setIsMenuOpen(false);
                }}
                onUpdateProperty={(prop) => handleUpdate({ property: prop })}
            />

            {/* Delete Confirmation */}
            <ConfirmationModal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDelete}
                title="Delete Niche"
                message={`Are you sure you want to delete "${niche.name}"? This will remove it from all suggested traffic videos.`}
                confirmLabel="Delete"
            />
        </>
    );
};
