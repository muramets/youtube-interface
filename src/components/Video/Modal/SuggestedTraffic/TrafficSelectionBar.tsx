import React, { useState, useRef, useEffect } from 'react';
import { FolderPlus, Plus, X, ChevronDown, Check } from 'lucide-react';
import type { TrafficGroup } from '../../../../types/traffic';

interface TrafficSelectionBarProps {
    selectedCount: number;
    groups: TrafficGroup[];
    onAddToGroup: (groupId: string) => void;
    onCreateGroup: (name: string) => void;
    onClearSelection: () => void;
    onRemoveFromGroup?: () => void;
    activeGroupId?: string;
}

export const TrafficSelectionBar: React.FC<TrafficSelectionBarProps> = ({
    selectedCount,
    groups,
    onAddToGroup,
    onCreateGroup,
    onClearSelection,
    onRemoveFromGroup,
    activeGroupId
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('click', handleClickOutside, true);
            // Focus input when dropdown opens
            setTimeout(() => inputRef.current?.focus(), 50);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside, true);
        };
    }, [isDropdownOpen]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newGroupName.trim()) {
            onCreateGroup(newGroupName.trim());
            setNewGroupName('');
            setIsDropdownOpen(false);
        }
    };

    if (selectedCount === 0) return null;

    return (
        <div className="absolute bottom-6 left-0 right-0 mx-auto w-fit z-50 animate-scale-in">
            <div className="flex items-center gap-2 bg-[#1F1F1F] border border-white/10 shadow-2xl rounded-full px-4 py-2">
                <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                    <span className="text-sm font-medium text-white whitespace-nowrap">
                        {selectedCount} selected
                    </span>
                    <button
                        onClick={onClearSelection}
                        className="text-text-secondary hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${isDropdownOpen ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}
                        `}
                    >
                        <FolderPlus size={16} />
                        Assign Niche
                        <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? '' : 'rotate-180'}`} />
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1F1F1F] border border-white/10 rounded-xl shadow-xl overflow-hidden flex flex-col animate-fade-in">
                            {/* Quick Create Input */}
                            <div className="p-2 border-b border-white/10">
                                <form onSubmit={handleCreateSubmit} className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Create new niche..."
                                        className="w-full bg-white/5 text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:bg-white/10 placeholder:text-text-secondary"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                    />
                                    <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                                </form>
                            </div>

                            {/* Groups List */}
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                {groups.length === 0 ? (
                                    <div className="px-4 py-3 text-center text-xs text-text-secondary">
                                        No niches yet
                                    </div>
                                ) : (
                                    groups.map(group => (
                                        <button
                                            key={group.id}
                                            onClick={() => {
                                                onAddToGroup(group.id);
                                                setIsDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors group"
                                        >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                                            <span className="truncate flex-1">{group.name}</span>
                                            {activeGroupId === group.id && <Check size={12} className="text-white" />}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {activeGroupId && onRemoveFromGroup && (
                    <button
                        onClick={onRemoveFromGroup}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-medium rounded-full transition-colors whitespace-nowrap"
                    >
                        Remove from Niche
                    </button>
                )}
            </div>
        </div>
    );
};
