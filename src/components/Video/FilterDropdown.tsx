import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Filter, Check } from 'lucide-react';
import { usePlaylistsStore } from '../../stores/playlistsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useChannelStore } from '../../stores/channelStore';
import { createPortal } from 'react-dom';

export const FilterDropdown: React.FC = () => {
    const { playlists } = usePlaylistsStore();
    const { generalSettings, updateGeneralSettings } = useSettingsStore();
    const { user } = useAuthStore();
    const { currentChannel } = useChannelStore();
    const hiddenPlaylistIds = generalSettings.hiddenPlaylistIds || [];

    const togglePlaylistVisibility = (id: string) => {
        if (!user || !currentChannel) return;
        const currentHidden = generalSettings.hiddenPlaylistIds || [];
        if (currentHidden.includes(id)) {
            updateGeneralSettings(user.uid, currentChannel.id, { hiddenPlaylistIds: currentHidden.filter(hid => hid !== id) });
        } else {
            updateGeneralSettings(user.uid, currentChannel.id, { hiddenPlaylistIds: [...currentHidden, id] });
        }
    };
    const [isOpen, setIsOpen] = useState(false);
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

    const activeFilterCount = hiddenPlaylistIds.length;

    return (
        <>
            <button
                ref={buttonRef}
                className={`category-pill ${isOpen ? 'active' : ''} flex items-center gap-1.5 px-3 py-1.5`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Filter size={16} />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                    <span className="bg-text-primary text-bg-primary rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                        {activeFilterCount}
                    </span>
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="animate-scale-in fixed bg-bg-secondary border border-border rounded-xl py-2 shadow-2xl z-[1000] min-w-[200px] max-h-[300px] overflow-y-auto"
                    style={{
                        top: position.top,
                        right: position.right,
                    }}
                >
                    <div className="px-4 py-2 text-sm font-semibold text-text-primary border-b border-border mb-1">
                        Hide Content From:
                    </div>
                    {playlists.length === 0 ? (
                        <div className="px-4 py-2 text-text-secondary text-[13px]">
                            No playlists found
                        </div>
                    ) : (
                        playlists.map(playlist => {
                            const isHidden = hiddenPlaylistIds.includes(playlist.id);
                            return (
                                <div
                                    key={playlist.id}
                                    onClick={() => togglePlaylistVisibility(playlist.id)}
                                    className="px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors text-text-primary text-sm hover:bg-hover-bg"
                                >
                                    <div className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center ${isHidden ? 'bg-text-primary border-text-primary' : 'bg-transparent border-text-secondary'}`}>
                                        {isHidden && <Check size={12} color="var(--bg-primary)" strokeWidth={3} />}
                                    </div>
                                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                                        {playlist.name}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
