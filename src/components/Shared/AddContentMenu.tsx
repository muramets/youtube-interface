import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Plus, Youtube, Upload, ListPlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AddYouTubeVideoModal } from '../Video/AddYouTubeVideoModal';
import { CustomVideoModal } from '../Video/CustomVideoModal';
import { CreatePlaylistModal } from '../Playlist/CreatePlaylistModal';
import { useVideos } from '../../hooks/useVideos';
import { useSettings } from '../../hooks/useSettings';
import type { VideoDetails } from '../../utils/youtubeApi';

import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';

interface AddContentMenuProps {
    showVideo?: boolean;
    showPlaylist?: boolean;
    directPlaylist?: boolean;
    icon?: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

export const AddContentMenu: React.FC<AddContentMenuProps> = ({
    showVideo = true,
    showPlaylist = true,
    directPlaylist = false,
    icon,
    isOpen: controlledIsOpen,
    onOpenChange
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { addCustomVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { uploadDefaults } = useSettings();
    const [internalIsOpen, setInternalIsOpen] = useState(false);

    const isControlled = controlledIsOpen !== undefined;
    const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
    const setIsOpen = React.useCallback((value: boolean) => {
        if (onOpenChange) {
            onOpenChange(value);
        }
        if (!isControlled) {
            setInternalIsOpen(value);
        }

    }, [onOpenChange, isControlled]);
    const [activeModal, setActiveModal] = useState<'youtube' | 'custom' | 'playlist' | null>(null);
    const [customVideoInitialData, setCustomVideoInitialData] = useState<VideoDetails | undefined>(undefined);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
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
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', () => setIsOpen(false), true);
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', () => setIsOpen(false), true);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen, setIsOpen]);

    const handleOptionClick = (modal: 'youtube' | 'custom' | 'playlist') => {
        if (modal === 'custom') {
            // Apply upload defaults
            const defaults: Partial<VideoDetails> = {
                title: uploadDefaults.title || '',
                description: uploadDefaults.description || '',
                tags: uploadDefaults.tags || []
            };
            // We need to cast this to VideoDetails because CustomVideoModal expects a full object
            // but useVideoForm handles partial data gracefully if we pass it as initialData
            // However, useVideoForm expects initialData to have an ID if it's an edit.
            // For creation, we can pass these defaults.
            // But CustomVideoModal props say initialData?: VideoDetails.
            // Let's cast it for now, as useVideoForm uses it as effectiveData.
            setCustomVideoInitialData(defaults as VideoDetails);
        } else {
            setCustomVideoInitialData(undefined);
        }
        setActiveModal(modal);
        setIsOpen(false);
    };

    const handleButtonClick = () => {
        if (directPlaylist) {
            setActiveModal('playlist');
        } else {
            setIsOpen(!isOpen);
        }
    };

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

            {isOpen && position && !directPlaylist && createPortal(
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
                                    onClick={() => handleOptionClick('youtube')}
                                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                                >
                                    <Youtube size={18} />
                                    Add YouTube Video
                                </button>

                                <button
                                    onClick={() => handleOptionClick('custom')}
                                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                                >
                                    <Upload size={18} />
                                    Create Custom Video
                                </button>
                            </>
                        )}

                        {showPlaylist && (
                            <button
                                onClick={() => handleOptionClick('playlist')}
                                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors border-none cursor-pointer text-text-primary hover:bg-hover-bg bg-transparent"
                            >
                                <ListPlus size={18} />
                                Create Playlist
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}

            <AddYouTubeVideoModal
                isOpen={activeModal === 'youtube'}
                onClose={() => setActiveModal(null)}
            />

            <CustomVideoModal
                isOpen={activeModal === 'custom'}
                onClose={() => setActiveModal(null)}
                onSave={async (videoData) => {
                    if (user && currentChannel) {
                        return await addCustomVideo(videoData);
                    }
                }}
                initialData={customVideoInitialData}
            />

            <CreatePlaylistModal
                isOpen={activeModal === 'playlist'}
                onClose={() => setActiveModal(null)}
            />
        </>
    );
};
