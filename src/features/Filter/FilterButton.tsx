import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronRight, X, Calendar, Clock, Eye, Type, List, MonitorPlay, ChevronLeft } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useFilterStore, type FilterType, type FilterOperator } from '../../core/stores/filterStore';
import { FilterInputTitle } from './FilterInputs/FilterInputTitle';
import { FilterInputNumeric } from './FilterInputs/FilterInputNumeric';
import { FilterInputDate } from './FilterInputs/FilterInputDate';
import { FilterInputList } from './FilterInputs/FilterInputList';
import { useVideos } from '../../core/hooks/useVideos';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

export const FilterButton: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    // State for Navigation (Main vs Submenu)
    const [activeView, setActiveView] = useState<FilterType | 'main'>('main');

    const { addFilter, activeFilters } = useFilterStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Data hooks for lists
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    // Prepare list options
    const channelOptions = Array.from(new Set(videos.map(v => v.channelTitle))).map(name => ({
        id: name,
        label: name
    })).sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    const playlistOptions = playlists.map(p => ({
        id: p.id,
        label: p.name,
        description: `${p.videoIds.length} videos`
    }));


    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        } else {
            // Reset view when closed
            const timeout = setTimeout(() => setActiveView('main'), 200);
            return () => clearTimeout(timeout);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // IGNORE clicks inside the CustomSelect dropdown portal
            const target = event.target as Element;
            if (target.closest('#custom-select-dropdown')) {
                return;
            }

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
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    const handleAddFilter = (type: FilterType, operator: FilterOperator, value: import('../../core/stores/filterStore').FilterValue, label: string) => {
        addFilter({ type, operator, value, label });
        setIsOpen(false);
    };

    const filterTypes: { type: FilterType; label: string; icon: React.ElementType }[] = [
        { type: 'channel', label: 'Channel', icon: MonitorPlay },
        { type: 'playlist', label: 'Playlist', icon: List },
        { type: 'title', label: 'Title', icon: Type },
        { type: 'duration', label: 'Duration', icon: Clock },
        { type: 'date', label: 'Publish Date', icon: Calendar },
        { type: 'views', label: 'Views', icon: Eye },
        { type: 'videoType', label: 'Video Type', icon: MonitorPlay }, // Reusing icon for now
    ];

    const getTitleForView = (view: FilterType) => {
        const match = filterTypes.find(t => t.type === view);
        return match ? match.label : 'Filter';
    };

    return (
        <>
            <button
                ref={buttonRef}
                className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Filter"
            >
                <Filter size={20} />
                {activeFilters.length > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-bg-primary" />
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-dropdown bg-[#1F1F1F] rounded-xl shadow-2xl overflow-hidden animate-scale-in flex flex-col"
                    style={{
                        top: position.top,

                        right: position.right,
                        width: activeView === 'date' ? '288px' : 'auto'
                    }}
                >
                    {/* Header for Submenus */}
                    {/* Header for Submenus */}
                    {activeView !== 'main' && (
                        <div className="flex items-center justify-between px-2 py-2 border-b border-[#333333]">
                            <button
                                onClick={() => setActiveView('main')}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-text-primary">{getTitleForView(activeView)}</span>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex flex-col">
                        {activeView === 'main' ? (
                            <div className="py-2">
                                {filterTypes.map(({ type, label, icon: Icon }) => (
                                    <button
                                        key={type}
                                        onClick={() => setActiveView(type)}
                                        className="w-full text-left px-4 py-3 text-sm font-medium flex items-center justify-between gap-8 transition-colors border-none cursor-pointer text-text-primary hover:bg-[#161616] bg-transparent"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon size={18} className="text-text-secondary" />
                                            {label}
                                        </div>
                                        <ChevronRight size={16} className="text-text-secondary" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                {activeView === 'title' && (
                                    <FilterInputTitle
                                        value=""
                                        onApply={(val) => handleAddFilter('title', 'contains', val, `Title: ${val}`)}
                                    />
                                )}
                                {activeView === 'views' && (
                                    <FilterInputNumeric
                                        onApply={(op, val, max) => {
                                            const opLabel = op === 'between' ? `${val}-${max}` : `${op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : op === 'lt' ? '<' : '='} ${val}`;
                                            const finalValue: import('../../core/stores/filterStore').FilterValue = op === 'between' ? [val!, max!] : val!;
                                            handleAddFilter('views', op, finalValue, `Views ${opLabel}`);
                                        }}
                                    />
                                )}
                                {activeView === 'duration' && (
                                    <FilterInputNumeric
                                        isDuration
                                        onApply={(op, val, max) => {
                                            const opLabel = op === 'between' ? `${val}-${max}m` : `${op} ${val}m`;
                                            const finalValue: import('../../core/stores/filterStore').FilterValue = op === 'between' ? [val!, max!] : val!;
                                            handleAddFilter('duration', op, finalValue, `Duration ${opLabel}`);
                                        }}
                                    />
                                )}
                                {activeView === 'date' && (
                                    <FilterInputDate
                                        onApply={(start, end) => {
                                            const startStr = new Date(start).toLocaleDateString();
                                            const endStr = new Date(end).toLocaleDateString();
                                            const label = start === end ? `Date: ${startStr}` : `Date: ${startStr} - ${endStr}`;
                                            handleAddFilter('date', 'between', [start, end], label);
                                        }}
                                        onClose={() => setIsOpen(false)}
                                    />
                                )}
                                {activeView === 'channel' && (
                                    <FilterInputList
                                        options={channelOptions}
                                        placeholder="Search channels"
                                        onApply={(ids) => handleAddFilter('channel', 'equals', ids, `Channel: ${ids.length > 1 ? `${ids.length} Selected` : ids[0]}`)}
                                    />
                                )}
                                {activeView === 'playlist' && (
                                    <FilterInputList
                                        options={playlistOptions}
                                        placeholder="Search playlists"
                                        onApply={(ids) => {
                                            const names = ids.map(id => playlists.find(p => p.id === id)?.name || id);
                                            handleAddFilter('playlist', 'equals', ids, `Playlist: ${ids.length > 1 ? `${ids.length} Selected` : names[0]}`);
                                        }}
                                    />
                                )}
                                {activeView === 'videoType' && (
                                    <FilterInputList
                                        options={[
                                            { id: 'custom_video', label: 'Custom Video' },
                                            { id: 'published_custom_video', label: 'Published Custom Video' },
                                            { id: 'other_youtube', label: 'Other YouTube Video' }
                                        ]}
                                        placeholder="Search types"
                                        onApply={(ids) => {
                                            const labelMap: Record<string, string> = {
                                                'custom_video': 'Custom Video',
                                                'published_custom_video': 'Published Custom',
                                                'other_youtube': 'Other YouTube'
                                            };
                                            const labels = ids.map(id => labelMap[id] || id);
                                            handleAddFilter('videoType', 'equals', ids, `Type: ${ids.length > 1 ? `${ids.length} Selected` : labels[0]}`);
                                        }}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
