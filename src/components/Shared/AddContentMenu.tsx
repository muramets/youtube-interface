import React, { useState, useRef, useEffect, useLayoutEffect, memo, useCallback, useMemo } from 'react';
import { Plus, Youtube, Upload, ListPlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AddYouTubeVideoModal } from '../../features/Video/Modals/AddYouTubeVideoModal';
import { AddCustomVideoModal } from '../../features/Video/Modals/AddCustomVideo/AddCustomVideoModal';
import { CreatePlaylistModal } from '../../features/Playlist/CreatePlaylistModal';
import { useVideos } from '../../core/hooks/useVideos';
import { useSettings } from '../../core/hooks/useSettings';
import type { VideoDetails } from '../../core/utils/youtubeApi';

import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

// --- Custom Hooks ---

function useMenuPosition(
    isOpen: boolean,
    buttonRef: React.RefObject<HTMLButtonElement | null>
) {
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    useLayoutEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        } else {
            setPosition(null);
        }
    }, [isOpen, buttonRef]);

    return position;
}

function useClickOutside(
    isOpen: boolean,
    onClose: () => void,
    refs: React.RefObject<HTMLElement | null>[]
) {
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const isOutside = refs.every(ref => ref.current && !ref.current.contains(target));

            if (isOutside) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [isOpen, onClose, refs]);
}

// --- Sub-Components ---

interface MenuDropdownProps {
    position: { top: number; right: number };
    showVideo: boolean;
    showPlaylist: boolean;
    onOptionClick: (modal: 'youtube' | 'custom' | 'playlist') => void;
    dropdownRef: React.RefObject<HTMLDivElement | null>;
}

const MenuDropdown: React.FC<MenuDropdownProps> = memo(({
    position,
    showVideo,
    showPlaylist,
    onOptionClick,
    dropdownRef
}) => {
    return createPortal(
        <div
            ref={dropdownRef}
            className="animate-scale-in bg-bg-secondary border border-border rounded-xl shadow-2xl z-[1000] min-w-[220px] overflow-hidden flex flex-col"
            style={{
                position: 'fixed',
                top: position.top,
                right: position.right,
            }}
        >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-bg-secondary/95 backdrop-blur sticky top-0 z-10 flex-shrink-0">
                <h3 className="font-medium text-text-primary m-0 text-base">Create</h3>
            </div>
            <div className="p-2">
                {showVideo && (
                    <>
                        <button
                            onClick={() => onOptionClick('youtube')}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                        >
                            <Youtube size={18} />
                            Add YouTube Video
                        </button>

                        <button
                            onClick={() => onOptionClick('custom')}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                        >
                            <Upload size={18} />
                            Create Custom Video
                        </button>
                    </>
                )}

                {showPlaylist && (
                    <button
                        onClick={() => onOptionClick('playlist')}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                    >
                        <ListPlus size={18} />
                        Create Playlist
                    </button>
                )}
            </div>
        </div>,
        document.body
    );
});

MenuDropdown.displayName = 'MenuDropdown';

// --- Main Component ---

interface AddContentMenuProps {
    showVideo?: boolean;
    showPlaylist?: boolean;
    directPlaylist?: boolean;
    icon?: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

export const AddContentMenu: React.FC<AddContentMenuProps> = memo(({
    showVideo = true,
    showPlaylist = true,
    directPlaylist = false,
    icon,
    isOpen: controlledIsOpen,
    onOpenChange
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { addCustomVideo, cloneVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { uploadDefaults, cloneSettings } = useSettings();

    // State
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const [activeModal, setActiveModal] = useState<'youtube' | 'custom' | 'playlist' | null>(null);
    const [customVideoInitialData, setCustomVideoInitialData] = useState<VideoDetails | undefined>(undefined);

    // Refs
    // Initialize with null to match RefObject | null expectations generally,
    // but React.useRef<T>(null) returns RefObject<T> where current is T | null.
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Derived State
    const isControlled = controlledIsOpen !== undefined;
    const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

    // Handlers
    const setIsOpen = useCallback((value: boolean) => {
        if (onOpenChange) {
            onOpenChange(value);
        }
        if (!isControlled) {
            setInternalIsOpen(value);
        }
    }, [onOpenChange, isControlled]);

    const position = useMenuPosition(isOpen, buttonRef);

    // Explicitly cast refs to RefObject<HTMLElement | null> to satisfy strict requirements if necessary,
    // or adjust the hook. Since HTMLButtonElement extends HTMLElement, a simple array literal usually works
    // but strict checks on RefObject types can be finicky.
    const refs = useMemo(() => [buttonRef, dropdownRef] as React.RefObject<HTMLElement | null>[], [buttonRef, dropdownRef]);
    useClickOutside(isOpen, () => setIsOpen(false), refs);

    const handleCloneVideo = async (originalVideo: VideoDetails, version: any) => {
        const duration = cloneSettings?.cloneDurationSeconds;
        console.warn('DEBUG: Cloning video with duration (s):', duration);
        await cloneVideo({
            originalVideo,
            coverVersion: version,
            cloneDurationSeconds: duration || 3600
        });
    };

    const handleOptionClick = useCallback((modal: 'youtube' | 'custom' | 'playlist') => {
        if (modal === 'custom') {
            const defaults: Partial<VideoDetails> = {
                title: uploadDefaults.title || '',
                description: uploadDefaults.description || '',
                tags: uploadDefaults.tags || []
            };
            setCustomVideoInitialData(defaults as VideoDetails);
        } else {
            setCustomVideoInitialData(undefined);
        }
        setActiveModal(modal);
        setIsOpen(false);
    }, [uploadDefaults, setIsOpen]);

    const handleButtonClick = useCallback(() => {
        if (directPlaylist) {
            setActiveModal('playlist');
        } else {
            setIsOpen(!isOpen);
        }
    }, [directPlaylist, isOpen, setIsOpen]);

    return (
        <>
            <button
                ref={buttonRef}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 bg-transparent text-text-primary hover:bg-hover-bg"
                onClick={handleButtonClick}
                title={directPlaylist ? "Create Playlist" : "Add Content"}
            >
                {icon ? icon : (directPlaylist ? <ListPlus size={24} /> : <Plus size={24} />)}
            </button>

            {isOpen && position && !directPlaylist && (
                <MenuDropdown
                    position={position}
                    showVideo={showVideo}
                    showPlaylist={showPlaylist}
                    onOptionClick={handleOptionClick}
                    dropdownRef={dropdownRef}
                />
            )}

            <AddYouTubeVideoModal
                isOpen={activeModal === 'youtube'}
                onClose={() => setActiveModal(null)}
            />

            {activeModal === 'custom' && (
                <AddCustomVideoModal
                    isOpen={true}
                    onClose={() => setActiveModal(null)}
                    onSave={async (videoData) => {
                        if (user && currentChannel) {
                            return await addCustomVideo(videoData);
                        }
                    }}
                    onClone={handleCloneVideo}
                    initialData={customVideoInitialData}
                />
            )}

            <CreatePlaylistModal
                isOpen={activeModal === 'playlist'}
                onClose={() => setActiveModal(null)}
            />
        </>
    );
});

AddContentMenu.displayName = 'AddContentMenu';
