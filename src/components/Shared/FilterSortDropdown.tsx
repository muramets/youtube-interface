import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Filter, Check, ArrowDownUp, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useVideo } from '../../context/VideoContext';
import { createPortal } from 'react-dom';

export interface SortOption {
    label: string;
    value: string;
}

interface FilterSortDropdownProps {
    sortOptions: SortOption[];
    activeSort: string;
    onSortChange: (value: string) => void;
    showPlaylistFilter?: boolean;
}

export const FilterSortDropdown: React.FC<FilterSortDropdownProps> = ({
    sortOptions,
    activeSort,
    onSortChange,
    showPlaylistFilter = false
}) => {
    const { playlists, hiddenPlaylistIds, togglePlaylistVisibility, clearHiddenPlaylists } = useVideo();
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

    const activeFilterCount = showPlaylistFilter ? hiddenPlaylistIds.length : 0;

    return (
        <>
            <button
                ref={buttonRef}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Sort & Filter"
            >
                <SlidersHorizontal size={20} />
                {activeFilterCount > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-bg-primary" />
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="animate-scale-in bg-bg-secondary border border-border rounded-xl shadow-2xl z-[1000] min-w-[240px] overflow-hidden flex flex-col max-h-[80vh]"
                    style={{
                        position: 'fixed',
                        top: position.top,
                        right: position.right,
                    }}
                >
                    {/* Sort Section */}
                    <div className="p-2 border-b border-border">
                        <div className="px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <ArrowDownUp size={14} />
                            Sort By
                        </div>
                        {sortOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSortChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between transition-colors border-none cursor-pointer ${activeSort === option.value ? 'bg-text-primary text-bg-primary' : 'text-text-primary hover:bg-hover-bg bg-transparent'}`}
                            >
                                {option.label}
                                {activeSort === option.value && <Check size={16} />}
                            </button>
                        ))}
                    </div>

                    {/* Filter Section (Optional) */}
                    {showPlaylistFilter && (
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="px-3 py-2 flex items-center justify-between">
                                <div className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                                    <Filter size={14} />
                                    Hide Content From
                                </div>
                                {hiddenPlaylistIds.length > 0 && (
                                    <button
                                        onClick={clearHiddenPlaylists}
                                        className="w-6 h-6 rounded-full bg-hover-bg flex items-center justify-center border-none cursor-pointer text-text-primary hover:bg-text-secondary transition-colors"
                                        title="Reset filters"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                )}
                            </div>
                            {playlists.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-text-secondary italic">
                                    No playlists found
                                </div>
                            ) : (
                                playlists.map(playlist => {
                                    const isHidden = hiddenPlaylistIds.includes(playlist.id);
                                    return (
                                        <button
                                            key={playlist.id}
                                            onClick={() => togglePlaylistVisibility(playlist.id)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3 transition-colors border-none cursor-pointer hover:bg-hover-bg bg-transparent text-text-primary"
                                        >
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isHidden ? 'bg-text-primary border-text-primary' : 'border-text-secondary'}`}>
                                                {isHidden && <Check size={14} className="text-bg-primary" strokeWidth={3} />}
                                            </div>
                                            <span className="truncate flex-1">{playlist.name}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
