import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Plus, Youtube, Upload, ListPlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AddYouTubeVideoModal } from '../Video/AddYouTubeVideoModal';
import { CustomVideoModal } from '../Video/CustomVideoModal';
import { CreatePlaylistModal } from '../Playlist/CreatePlaylistModal';
import { useVideoActions } from '../../context/VideoActionsContext';

interface AddContentMenuProps {
    showVideo?: boolean;
    showPlaylist?: boolean;
    directPlaylist?: boolean;
}

export const AddContentMenu: React.FC<AddContentMenuProps> = ({
    showVideo = true,
    showPlaylist = true,
    directPlaylist = false
}) => {
    const { addCustomVideo } = useVideoActions();
    const [isOpen, setIsOpen] = useState(false);
    const [activeModal, setActiveModal] = useState<'youtube' | 'custom' | 'playlist' | null>(null);

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
    }, [isOpen]);

    const handleOptionClick = (modal: 'youtube' | 'custom' | 'playlist') => {
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
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                onClick={handleButtonClick}
                title={directPlaylist ? "Create Playlist" : "Add Content"}
            >
                {directPlaylist ? <ListPlus size={24} /> : <Plus size={24} />}
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
                    <div className="p-2">
                        <div className="px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wider">
                            Create
                        </div>

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
                onSave={addCustomVideo}
            />

            <CreatePlaylistModal
                isOpen={activeModal === 'playlist'}
                onClose={() => setActiveModal(null)}
            />
        </>
    );
};
