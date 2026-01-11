import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X, ThumbsDown, Target } from 'lucide-react';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import type { TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';

interface TrafficNicheSelectorProps {
    videoIds: string[]; // Selected videos to assign
    isOpen: boolean;
    openAbove?: boolean;
    onToggle: () => void;
    onClose: () => void;
    onSelectionClear?: () => void;
}

export const TrafficNicheSelector: React.FC<TrafficNicheSelectorProps> = ({
    videoIds,
    isOpen,
    openAbove = false,
    onClose,
    onSelectionClear
}) => {
    const {
        niches,
        assignments,
        addTrafficNiche,
        assignVideoToTrafficNiche,
        removeVideoFromTrafficNiche
    } = useTrafficNicheStore();

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newNicheName, setNewNicheName] = useState('');

    // New Property Selection State
    const [newNicheProperty, setNewNicheProperty] = useState<TrafficNicheProperty | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- Derived State ---

    // Filter niches
    const filteredNiches = useMemo(() => {
        if (!searchTerm) return niches;
        const lower = searchTerm.toLowerCase();
        return niches.filter(n => n.name.toLowerCase().includes(lower));
    }, [niches, searchTerm]);

    // Assignments Map: nicheId -> 'all' | 'some' | 'none' for the selected videos
    const nicheStatusMap = useMemo(() => {
        const status: Record<string, 'all' | 'some' | 'none'> = {};

        niches.forEach(niche => {
            // Assignments for this niche
            const relevantAssignments = assignments.filter(a => a.nicheId === niche.id);
            const assignedVidIds = relevantAssignments.map(a => a.videoId);

            const count = videoIds.filter(vidId => assignedVidIds.includes(vidId)).length;

            if (count === 0) status[niche.id] = 'none';
            else if (count === videoIds.length) status[niche.id] = 'all';
            else status[niche.id] = 'some';
        });

        return status;
    }, [niches, assignments, videoIds]);

    // Focus input on create
    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setIsCreating(false);
            setSearchTerm('');
            setNewNicheName('');
            setNewNicheProperty(null);
        }
    }, [isOpen]);

    // --- Handlers ---

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newNicheName.trim();
        if (!trimmed || !user || !currentChannel) return;

        // If property not selected, default or error? 
        // Prompt says "property is initially empty... user must intentionally select".
        if (!newNicheProperty) {
            alert("Please select a property (Unrelated, Targeted, or Desired).");
            return;
        }

        try {
            // Note: ID generation is handled by Firestore auto-id if we pass it, 
            // but our service expects ID. We'll generate one here.
            const newId = crypto.randomUUID();

            await addTrafficNiche({
                id: newId,
                name: trimmed,
                channelId: currentChannel.id,
                property: newNicheProperty
            }, user.uid, currentChannel.id);

            // Auto-assign selected videos
            for (const vidId of videoIds) {
                await assignVideoToTrafficNiche(vidId, newId, user.uid, currentChannel.id);
            }

            // Reset
            setIsCreating(false);
            setNewNicheName('');
            setNewNicheProperty(null);
            onSelectionClear?.();
            onClose();

        } catch (error) {
            console.error("Failed to create niche:", error);
            alert("Failed to create niche. Please try again.");
        }
    };

    const handleToggleAssignment = async (nicheId: string, currentStatus: 'all' | 'some' | 'none') => {
        if (!user || !currentChannel) return;

        // Visual Optimism handled by store but we await here
        if (currentStatus === 'all') {
            // Remove from all
            for (const vidId of videoIds) {
                await removeVideoFromTrafficNiche(vidId, nicheId, user.uid, currentChannel.id);
            }
        } else {
            // Add to all (if 'some', add to remaining)
            for (const vidId of videoIds) {
                // Check if already assigned to avoid unnecessary writes? 
                // Firestore setDoc is idempotent so it's fine.
                await assignVideoToTrafficNiche(vidId, nicheId, user.uid, currentChannel.id);
            }
        }
    };

    // --- Render ---

    if (!isOpen) return null;

    return (
        <div
            ref={containerRef}
            className={`
                absolute left-0 w-64 bg-[#1F1F1F] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-200
                ${openAbove ? 'bottom-full mb-2' : 'top-full mt-2'}
            `}
            style={{ maxHeight: '400px' }}
        >
            {/* Header / Search */}
            <div className="p-3 border-b border-white/5 bg-[#1F1F1F] sticky top-0 z-10">
                {!isCreating ? (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" size={14} />
                        <input
                            type="text"
                            placeholder="Search niches..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-8 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-white/20 transition-colors"
                            autoFocus
                        />
                        <button
                            onClick={() => setIsCreating(true)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md text-text-secondary hover:text-white transition-colors"
                            title="Create new niche"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="p-1 hover:bg-white/10 rounded-md text-text-secondary hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                            <span className="text-xs font-medium text-text-primary">New Niche</span>
                        </div>

                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Niche name"
                            value={newNicheName}
                            onChange={(e) => setNewNicheName(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-white/20"
                        />

                        {/* Property Selector */}
                        <div className="flex gap-1">
                            {[
                                { id: 'unrelated', icon: ThumbsDown, color: 'text-amber-700/80', label: 'Unrelated' },
                                { id: 'targeted', icon: Target, color: 'text-yellow-500', label: 'Targeted' },
                                { id: 'desired', icon: Target, color: 'text-blue-500', label: 'Desired' }
                            ].map((prop) => (
                                <button
                                    key={prop.id}
                                    type="button"
                                    onClick={() => setNewNicheProperty(prop.id as TrafficNicheProperty)}
                                    className={`
                                        flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all
                                        ${newNicheProperty === prop.id
                                            ? 'bg-white/10 border-white/30 text-white'
                                            : 'bg-transparent border-transparent hover:bg-white/5 text-text-tertiary'
                                        }
                                    `}
                                >
                                    <prop.icon size={14} className={newNicheProperty === prop.id ? prop.color : 'text-current'} />
                                    <span className="text-[9px] font-medium">{prop.label}</span>
                                </button>
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={!newNicheName.trim() || !newNicheProperty}
                            className={`
                                w-full py-1.5 rounded-lg text-xs font-medium transition-colors
                                ${newNicheName.trim() && newNicheProperty
                                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                    : 'bg-white/5 text-text-disabled cursor-not-allowed'
                                }
                            `}
                        >
                            Create
                        </button>
                    </form>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                {filteredNiches.length === 0 ? (
                    <div className="p-4 text-center text-xs text-text-tertiary">
                        {searchTerm ? 'No niches found' : 'No niches yet'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {filteredNiches.map(niche => {
                            const status = nicheStatusMap[niche.id] || 'none';

                            return (
                                <button
                                    key={niche.id}
                                    onClick={() => handleToggleAssignment(niche.id, status)}
                                    className={`
                                        w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors group
                                        ${status !== 'none' ? 'bg-white/10 text-white' : 'text-text-secondary hover:bg-white/5 hover:text-white'}
                                    `}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: niche.color }}
                                        />
                                        <span className="truncate">{niche.name}</span>
                                    </div>

                                    {/* Valid Checkmark or Partial Dash? kept simple with opacity */}
                                    {status !== 'none' && (
                                        <div className={`
                                            w-4 h-4 rounded-full flex items-center justify-center
                                            ${status === 'all' ? 'bg-blue-500' : 'bg-white/20'}
                                        `}>
                                            <span className="text-[10px] font-bold text-white">
                                                {status === 'all' ? '✓' : '-'}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
