// =============================================================================
// GENRE TAB: Genre list with DnD reordering, search, inline add
// Sub-component of MusicSettingsModal
// =============================================================================

import React, { useState, useCallback } from 'react';
import { X, Plus, Trash2, GripVertical, Search } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MusicGenre } from '../../../../core/types/track';
import { PRESET_COLORS } from '../../utils/constants';
import { ColorPickerPopover } from '../../../../components/ui/molecules/ColorPickerPopover';

// --- Sortable Genre Item ---
interface SortableGenreItemProps {
    genre: MusicGenre;
    onUpdateColor: (id: string, color: string) => void;
    onUpdateName: (id: string, name: string) => void;
    onRemove: (id: string) => void;
    showHandle: boolean;
}

const SortableGenreItem: React.FC<SortableGenreItemProps> = ({ genre, onUpdateColor, onUpdateName, onRemove, showHandle }) => {
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: genre.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 50 : isColorPickerOpen ? 20 : 1,
    };

    const handleColorChange = useCallback((color: string) => {
        onUpdateColor(genre.id, color);
        setIsColorPickerOpen(false);
    }, [genre.id, onUpdateColor]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-hover-bg group ${!isDragging ? 'transition-colors' : ''}`}
        >
            <div
                {...(showHandle ? { ...attributes, ...listeners } : {})}
                className={`shrink-0 w-[14px] ${showHandle ? 'cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-primary touch-none opacity-0 group-hover:opacity-100' : 'invisible'} transition-colors`}
            >
                <GripVertical size={14} />
            </div>

            {/* Color picker */}
            <div className="relative">
                <div
                    role="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsColorPickerOpen(!isColorPickerOpen);
                    }}
                    className="w-5 h-5 rounded-full cursor-pointer ring-1 ring-white/10 hover:ring-white/30 hover:scale-110 transition-all"
                    style={{ backgroundColor: genre.color }}
                />

                {isColorPickerOpen && (
                    <ColorPickerPopover
                        currentColor={genre.color}
                        colors={PRESET_COLORS}
                        onColorChange={handleColorChange}
                        onClose={() => setIsColorPickerOpen(false)}
                    />
                )}
            </div>

            {/* Name */}
            <input
                type="text"
                value={genre.name}
                onChange={(e) => onUpdateName(genre.id, e.target.value)}
                className="flex-1 bg-transparent text-sm text-text-primary outline-none border-none focus:bg-input-bg px-2 py-1 rounded transition-colors"
            />

            {/* Delete */}
            <button
                onClick={() => onRemove(genre.id)}
                className="p-1 text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
};

// --- Genre Tab ---
interface GenreTabProps {
    localGenres: MusicGenre[];
    setLocalGenres: React.Dispatch<React.SetStateAction<MusicGenre[]>>;
}

export const GenreTab: React.FC<GenreTabProps> = ({ localGenres, setLocalGenres }) => {
    const [genreSearch, setGenreSearch] = useState('');
    const [isAddingGenre, setIsAddingGenre] = useState(false);
    const [inlineGenreName, setInlineGenreName] = useState('');

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 3 } })
    );

    const addGenre = () => {
        if (!inlineGenreName.trim()) return;
        const name = inlineGenreName.trim();
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const color = PRESET_COLORS[localGenres.length % PRESET_COLORS.length];
        setLocalGenres(prev => [...prev, {
            id: id || (crypto.randomUUID?.() ?? `genre-${Date.now()}`),
            name,
            color,
            order: prev.length,
        }]);
        setInlineGenreName('');
        setIsAddingGenre(false);
    };

    const removeGenre = (id: string) => {
        setLocalGenres(prev => prev.filter((g) => g.id !== id));
    };

    const updateGenreColor = (id: string, color: string) => {
        setLocalGenres(prev => prev.map((g) => g.id === id ? { ...g, color } : g));
    };

    const updateGenreName = (id: string, name: string) => {
        setLocalGenres(prev => prev.map((g) => g.id === id ? { ...g, name } : g));
    };

    const handleGenreDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setLocalGenres(prev => {
                const oldIndex = prev.findIndex((g) => g.id === active.id);
                const newIndex = prev.findIndex((g) => g.id === over.id);
                return arrayMove(prev, oldIndex, newIndex);
            });
        }
    };

    const filteredGenres = genreSearch
        ? localGenres.filter(g => g.name.toLowerCase().includes(genreSearch.toLowerCase()))
        : localGenres;

    return (
        <div className="space-y-3">
            {/* Search */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                    type="text"
                    value={genreSearch}
                    onChange={(e) => setGenreSearch(e.target.value)}
                    placeholder="Search genres..."
                    className="modal-input w-full !pl-9 pr-8"
                />
                {genreSearch && (
                    <button
                        onClick={() => setGenreSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Genre list with DnD */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleGenreDragEnd}
                modifiers={[restrictToVerticalAxis]}
            >
                <SortableContext
                    items={filteredGenres.map(g => g.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-0.5">
                        {filteredGenres.map((genre) => (
                            <SortableGenreItem
                                key={genre.id}
                                genre={genre}
                                onUpdateColor={updateGenreColor}
                                onUpdateName={updateGenreName}
                                onRemove={removeGenre}
                                showHandle={!genreSearch && filteredGenres.length > 1}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* New Genre */}
            {isAddingGenre ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hover-bg">
                    <div
                        className="w-5 h-5 rounded-full ring-1 ring-white/10 shrink-0"
                        style={{ backgroundColor: PRESET_COLORS[localGenres.length % PRESET_COLORS.length] }}
                    />
                    <input
                        autoFocus
                        type="text"
                        value={inlineGenreName}
                        onChange={(e) => setInlineGenreName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') addGenre();
                            if (e.key === 'Escape') { setIsAddingGenre(false); setInlineGenreName(''); }
                        }}
                        onBlur={() => { if (!inlineGenreName.trim()) { setIsAddingGenre(false); setInlineGenreName(''); } }}
                        placeholder="Genre name..."
                        className="flex-1 bg-transparent text-sm text-text-primary outline-none border-none px-2 py-1"
                    />
                </div>
            ) : (
                <button
                    onClick={() => setIsAddingGenre(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg w-full text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-colors"
                >
                    <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center">
                        <Plus size={12} />
                    </div>
                    <span className="text-sm">New Genre</span>
                </button>
            )}
        </div>
    );
};
