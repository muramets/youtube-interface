// =============================================================================
// TAG TAB: Tag chips by category with inline edit, reorder & cross-category drag
// Sub-component of MusicSettingsModal
//
// Single DndContext handles BOTH category and tag drags:
//   - IDs prefixed with "cat-order:" → category reorder
//   - Tag IDs → tag reorder / cross-category move
// =============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { X, Plus, Search, GripVertical, Pencil, Trash2, Star } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
    DndContext,
    useDroppable,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragOverEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    arrayMove,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CollapsibleSection } from '../../../../components/ui/molecules/CollapsibleSection';
import type { MusicTag } from '../../../../core/types/track';

interface TagTabProps {
    localTags: MusicTag[];
    setLocalTags: React.Dispatch<React.SetStateAction<MusicTag[]>>;
    categoryOrder: string[];
    setCategoryOrder: React.Dispatch<React.SetStateAction<string[]>>;
    featuredCategories: string[];
    setFeaturedCategories: React.Dispatch<React.SetStateAction<string[]>>;
}

// ID helpers
const CAT_PREFIX = 'cat-order:';
const ZONE_PREFIX = 'category:';
const isCatDragId = (id: string) => id.startsWith(CAT_PREFIX);
const catFromDragId = (id: string) => id.replace(CAT_PREFIX, '');
const isZoneId = (id: string) => id.startsWith(ZONE_PREFIX);
const catFromZoneId = (id: string) => id.replace(ZONE_PREFIX, '');

// --------------- Sortable Tag Chip ---------------
const SortableTagChip: React.FC<{
    tag: MusicTag;
    onRemove: (id: string) => void;
    editingTagId: string | null;
    editingName: string;
    onStartEdit: (tag: MusicTag) => void;
    onEditChange: (value: string) => void;
    onEditCommit: () => void;
    onEditCancel: () => void;
}> = ({ tag, onRemove, editingTagId, editingName, onStartEdit, onEditChange, onEditCommit, onEditCancel }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tag.id });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 9999 : 'auto',
        position: isDragging ? 'relative' : undefined,
        touchAction: 'none',
    };

    const isEditing = editingTagId === tag.id;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-text-primary bg-white/[0.06] hover:bg-white/[0.1] cursor-grab outline-none ${isDragging ? '' : 'transition-colors'}`}
        >
            {isEditing ? (
                <span className="relative inline-flex items-center">
                    <span className="invisible whitespace-pre text-xs">{editingName || ' '}</span>
                    <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => onEditChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onEditCommit();
                            if (e.key === 'Escape') onEditCancel();
                        }}
                        onBlur={onEditCommit}
                        className="absolute inset-0 bg-transparent text-xs text-text-primary outline-none border-none p-0 m-0 w-full"
                    />
                </span>
            ) : (
                <span
                    onClick={() => onStartEdit(tag)}
                    className="cursor-text hover:text-white transition-colors"
                >
                    {tag.name}
                </span>
            )}

            <button
                onClick={() => onRemove(tag.id)}
                className="p-0.5 rounded-full hover:text-red-500 transition-colors flex-shrink-0"
                type="button"
            >
                <X size={12} />
            </button>
        </div>
    );
};

// --------------- Droppable Category Zone (for cross-category tag drops) ----
const DroppableCategoryZone: React.FC<{
    category: string;
    isTagDragActive: boolean;
    isSourceCategory: boolean;
    children: React.ReactNode;
}> = ({ category, isTagDragActive, isSourceCategory, children }) => {
    const { setNodeRef, isOver } = useDroppable({ id: `${ZONE_PREFIX}${category}` });

    return (
        <div
            ref={setNodeRef}
            className={`rounded-lg transition-colors duration-150 ${isTagDragActive && isOver && !isSourceCategory ? 'bg-white/[0.04] ring-1 ring-white/10' : ''}`}
        >
            {children}
        </div>
    );
};

const toTitleCase = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1);

// --------------- Sortable Category Wrapper ---------------
const SortableCategorySection: React.FC<{
    category: string;
    children: React.ReactNode;
    isCatDragging: boolean;
    isEmpty: boolean;
    editingCategory: string | null;
    editingCatName: string;
    onStartEdit: (category: string) => void;
    onEditChange: (value: string) => void;
    onEditCommit: () => void;
    onEditCancel: () => void;
    onDelete: (category: string) => void;
    isFeatured: boolean;
    onToggleFeatured: (category: string) => void;
}> = ({ category, children, isCatDragging, isEmpty, editingCategory, editingCatName, onStartEdit, onEditChange, onEditCommit, onEditCancel, onDelete, isFeatured, onToggleFeatured }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `${CAT_PREFIX}${category}` });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : (isCatDragging ? transition : undefined),
        zIndex: isDragging ? 50 : 'auto',
        opacity: isCatDragging && !isDragging ? 0.4 : 1,
        position: 'relative',
    };

    const isEditing = editingCategory === category;

    const titleEl = isEditing ? (
        <input
            autoFocus
            type="text"
            value={editingCatName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') onEditCommit();
                if (e.key === 'Escape') onEditCancel();
            }}
            onBlur={onEditCommit}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent text-[10px] font-medium uppercase tracking-widest text-text-primary outline-none border-b border-text-tertiary w-full"
        />
    ) : category;

    const trailingEl = (
        <div className="flex items-center gap-1">
            {!isEditing && (
                <button
                    onClick={() => onToggleFeatured(category)}
                    className={`opacity-0 group-hover:opacity-100 transition-all p-0.5 ${isFeatured ? 'text-amber-400 opacity-100' : 'text-text-tertiary hover:text-amber-400'}`}
                >
                    <Star size={10} fill={isFeatured ? 'currentColor' : 'none'} />
                </button>
            )}
            {!isEditing && (
                <button
                    onClick={() => onStartEdit(category)}
                    className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-primary transition-all p-0.5"
                >
                    <Pencil size={10} />
                </button>
            )}
            {isEmpty && !isEditing && (
                <button
                    onClick={() => onDelete(category)}
                    className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-400 transition-all p-0.5"
                >
                    <Trash2 size={10} />
                </button>
            )}
            <div {...listeners} {...attributes} className="cursor-grab outline-none text-text-tertiary group-hover:text-text-primary transition-colors duration-200">
                <GripVertical size={12} />
            </div>
        </div>
    );

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? '[&_*]:!text-text-primary' : ''}>
            <CollapsibleSection
                variant="micro"
                title={titleEl}
                trailing={trailingEl}
            >
                {children}
            </CollapsibleSection>
        </div>
    );
};

// --------------- Main TagTab ---------------
export const TagTab: React.FC<TagTabProps> = ({ localTags, setLocalTags, categoryOrder, setCategoryOrder, featuredCategories, setFeaturedCategories }) => {
    const [tagSearch, setTagSearch] = useState('');
    const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
    const [inlineTagName, setInlineTagName] = useState('');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Inline edit state
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Category editing state
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editingCatName, setEditingCatName] = useState('');

    // Unified drag state
    const [dragType, setDragType] = useState<'category' | 'tag' | null>(null);
    const [tagDragSourceCategory, setTagDragSourceCategory] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // --- Derive ordered categories ---
    // Include ALL categories from categoryOrder (even empty ones) + any from tags not yet in order
    const allCategories = useMemo(() => {
        const existingCats = new Set<string>();
        localTags.forEach(t => existingCats.add(t.category || 'Uncategorized'));

        const ordered = [...categoryOrder];
        existingCats.forEach(c => {
            if (!ordered.includes(c)) ordered.push(c);
        });
        return ordered;
    }, [localTags, categoryOrder]);

    // Group tags
    const tagsByCategory = useMemo(() => {
        return localTags.reduce<Record<string, MusicTag[]>>((acc, tag) => {
            const cat = tag.category || 'Uncategorized';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(tag);
            return acc;
        }, {});
    }, [localTags]);

    // --- Tag actions ---
    const addTagToCategory = (category: string) => {
        if (!inlineTagName.trim()) return;
        setLocalTags(prev => [...prev, {
            id: uuidv4(),
            name: inlineTagName.trim(),
            category: category === 'Uncategorized' ? undefined : category,
        }]);
        // Ensure categoryOrder contains all existing categories before adding new ones.
        // Without this, adding to a category when categoryOrder is empty/partial
        // would put only that category in the order, making it jump to the top.
        setCategoryOrder(prev => {
            if (prev.includes(category)) return prev;
            // Bootstrap: if order is incomplete, fill in all existing categories first
            const full = [...prev];
            allCategories.forEach(c => { if (!full.includes(c)) full.push(c); });
            if (!full.includes(category)) full.push(category);
            return full;
        });
        setInlineTagName('');
        setAddingToCategory(null);
    };

    const addNewCategory = () => {
        if (!newCategoryName.trim()) return;
        const catName = toTitleCase(newCategoryName.trim());
        setNewCategoryName('');
        setIsAddingCategory(false);
        setAddingToCategory(catName);
        setCategoryOrder(prev => {
            if (prev.includes(catName)) return prev;
            const full = [...prev];
            allCategories.forEach(c => { if (!full.includes(c)) full.push(c); });
            if (!full.includes(catName)) full.push(catName);
            return full;
        });
        setInlineTagName('');
    };

    const removeTag = (id: string) => {
        setLocalTags(prev => prev.filter(t => t.id !== id));
    };

    const startEdit = (tag: MusicTag) => {
        setEditingTagId(tag.id);
        setEditingName(tag.name);
    };

    const commitEdit = () => {
        if (editingTagId && editingName.trim()) {
            setLocalTags(prev => prev.map(t =>
                t.id === editingTagId ? { ...t, name: editingName.trim() } : t
            ));
        }
        setEditingTagId(null);
        setEditingName('');
    };

    const cancelEdit = () => {
        setEditingTagId(null);
        setEditingName('');
    };

    // --- Category actions ---
    const startCategoryEdit = (category: string) => {
        setEditingCategory(category);
        setEditingCatName(category);
    };

    const commitCategoryEdit = () => {
        if (editingCategory && editingCatName.trim() && editingCatName.trim() !== editingCategory) {
            const oldName = editingCategory;
            const newName = toTitleCase(editingCatName.trim());
            // Update categoryOrder
            setCategoryOrder(prev => prev.map(c => c === oldName ? newName : c));
            // Update featuredCategories
            setFeaturedCategories(prev => prev.map(c => c === oldName ? newName : c));
            // Update tags belonging to this category
            setLocalTags(prev => prev.map(t =>
                (t.category || 'Uncategorized') === oldName
                    ? { ...t, category: newName === 'Uncategorized' ? undefined : newName }
                    : t
            ));
        }
        setEditingCategory(null);
        setEditingCatName('');
    };

    const cancelCategoryEdit = () => {
        setEditingCategory(null);
        setEditingCatName('');
    };

    const deleteCategory = (category: string) => {
        setCategoryOrder(prev => prev.filter(c => c !== category));
    };

    const getTagCategory = useCallback((tagId: string, tags: MusicTag[]) => {
        const tag = tags.find(t => t.id === tagId);
        return tag ? (tag.category || 'Uncategorized') : null;
    }, []);

    // --- Unified drag handlers ---
    const handleDragStart = (event: DragStartEvent) => {
        const activeId = event.active.id as string;
        if (isCatDragId(activeId)) {
            setDragType('category');
        } else {
            setDragType('tag');
            setTagDragSourceCategory(getTagCategory(activeId, localTags));
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // --- Category drag: reorder categories ---
        if (isCatDragId(activeId) && isCatDragId(overId)) {
            const activeCat = catFromDragId(activeId);
            const overCat = catFromDragId(overId);
            setCategoryOrder(prev => {
                const current = [...allCategories];
                const oldIdx = current.indexOf(activeCat);
                const newIdx = current.indexOf(overCat);
                if (oldIdx === -1 || newIdx === -1) return prev;
                return arrayMove(current, oldIdx, newIdx);
            });
            return;
        }

        // --- Tag drag ---
        if (!isCatDragId(activeId)) {
            // Drop on category zone → move tag to that category
            if (isZoneId(overId)) {
                const targetCat = catFromZoneId(overId);
                setLocalTags(prev => {
                    const tag = prev.find(t => t.id === activeId);
                    if (!tag) return prev;
                    const currentCat = tag.category || 'Uncategorized';
                    if (currentCat === targetCat) return prev;
                    return prev.map(t =>
                        t.id === activeId
                            ? { ...t, category: targetCat === 'Uncategorized' ? undefined : targetCat }
                            : t
                    );
                });
                return;
            }

            // Drop on another tag → reorder or cross-category move
            if (!isCatDragId(overId) && !isZoneId(overId)) {
                setLocalTags(prev => {
                    const oldIdx = prev.findIndex(t => t.id === activeId);
                    const newIdx = prev.findIndex(t => t.id === overId);
                    if (oldIdx === -1 || newIdx === -1) return prev;

                    const activeTag = prev[oldIdx];
                    const overTag = prev[newIdx];
                    const activeCat = activeTag.category || 'Uncategorized';
                    const overCat = overTag.category || 'Uncategorized';

                    const updated = [...prev];
                    if (activeCat !== overCat) {
                        updated[oldIdx] = { ...activeTag, category: overTag.category };
                    }

                    return arrayMove(updated, oldIdx, newIdx);
                });
            }
        }
    };

    const handleDragEnd = () => {
        setDragType(null);
        setTagDragSourceCategory(null);
    };

    // IDs for SortableContext
    const categorySortableIds = useMemo(
        () => allCategories.map(c => `${CAT_PREFIX}${c}`),
        [allCategories]
    );

    // All tag IDs across all categories for a single flat SortableContext
    const allTagIds = useMemo(
        () => allCategories.flatMap(c => (tagsByCategory[c] || []).map(t => t.id)),
        [allCategories, tagsByCategory]
    );

    const isTagDragActive = dragType === 'tag';
    const isCatDragging = dragType === 'category';

    return (
        <div className={dragType ? 'pointer-events-none' : ''}>
            {/* Search */}
            <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    className="modal-input w-full !pl-9 pr-8"
                />
                {tagSearch && (
                    <button
                        onClick={() => setTagSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Single DndContext for both categories and tags */}
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={categorySortableIds} strategy={verticalListSortingStrategy}>
                    <SortableContext items={allTagIds}>
                        <div className="space-y-4">
                            {allCategories
                                .filter(category => {
                                    if (!tagSearch) return true;
                                    const q = tagSearch.toLowerCase();
                                    const catTags = tagsByCategory[category] || [];
                                    return category.toLowerCase().includes(q) ||
                                        catTags.some(t => t.name.toLowerCase().includes(q));
                                })
                                .map(category => {
                                    const categoryTags = tagsByCategory[category] || [];
                                    const filteredTags = tagSearch
                                        ? categoryTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                                        : categoryTags;
                                    const displayTags = filteredTags.length > 0 ? filteredTags : categoryTags;

                                    return (
                                        <DroppableCategoryZone
                                            key={category}
                                            category={category}
                                            isTagDragActive={isTagDragActive}
                                            isSourceCategory={tagDragSourceCategory === category}
                                        >
                                            <SortableCategorySection
                                                category={category}
                                                isCatDragging={isCatDragging}
                                                isEmpty={categoryTags.length === 0}
                                                editingCategory={editingCategory}
                                                editingCatName={editingCatName}
                                                onStartEdit={startCategoryEdit}
                                                onEditChange={setEditingCatName}
                                                onEditCommit={commitCategoryEdit}
                                                onEditCancel={cancelCategoryEdit}
                                                onDelete={deleteCategory}
                                                isFeatured={featuredCategories.includes(category)}
                                                onToggleFeatured={(cat) => setFeaturedCategories(prev =>
                                                    prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                                                )}
                                            >
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {displayTags.map(tag => (
                                                        <SortableTagChip
                                                            key={tag.id}
                                                            tag={tag}
                                                            onRemove={removeTag}
                                                            editingTagId={editingTagId}
                                                            editingName={editingName}
                                                            onStartEdit={startEdit}
                                                            onEditChange={setEditingName}
                                                            onEditCommit={commitEdit}
                                                            onEditCancel={cancelEdit}
                                                        />
                                                    ))}
                                                    {/* Inline add */}
                                                    {addingToCategory === category ? (
                                                        <div className="inline-flex items-center gap-1 bg-white/[0.06] rounded-full pl-3 pr-1 py-1.5">
                                                            <span className="relative inline-flex items-center">
                                                                <span className="invisible whitespace-pre text-xs min-w-[3ch]">{inlineTagName || '···'}</span>
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    value={inlineTagName}
                                                                    onChange={(e) => setInlineTagName(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') addTagToCategory(category);
                                                                        if (e.key === 'Escape') { setAddingToCategory(null); setInlineTagName(''); }
                                                                    }}
                                                                    onBlur={() => { if (!inlineTagName.trim()) { setAddingToCategory(null); setInlineTagName(''); } }}
                                                                    placeholder="Tag"
                                                                    className="absolute inset-0 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none border-none p-0 m-0 w-full"
                                                                />
                                                            </span>
                                                            <button
                                                                onClick={() => addTagToCategory(category)}
                                                                disabled={!inlineTagName.trim()}
                                                                className="p-0.5 rounded-full text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setAddingToCategory(category); setInlineTagName(''); }}
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.04] text-text-tertiary hover:bg-white/[0.1] hover:text-text-primary transition-colors"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </SortableCategorySection>
                                        </DroppableCategoryZone>
                                    );
                                })}
                        </div>
                    </SortableContext>
                </SortableContext>
            </DndContext>


            {/* New Category */}
            <div className="border-t border-border pt-3 mt-4 h-[15px] box-content">
                {isAddingCategory ? (
                    <div className="flex items-center gap-1 h-[15px] text-text-secondary">
                        <Plus size={10} className="shrink-0" />
                        <input
                            autoFocus
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') addNewCategory();
                                if (e.key === 'Escape') { setIsAddingCategory(false); setNewCategoryName(''); }
                            }}
                            onBlur={() => { if (!newCategoryName.trim()) { setIsAddingCategory(false); setNewCategoryName(''); } }}
                            placeholder="Category name..."
                            className="appearance-none bg-transparent text-[10px] text-text-secondary placeholder:text-text-tertiary font-medium uppercase tracking-widest outline-none w-full h-[15px] p-0 m-0 border-none block"
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAddingCategory(true)}
                        className="text-[10px] text-text-tertiary font-medium uppercase tracking-widest hover:text-text-secondary transition-colors flex items-center gap-1 h-[15px] p-0 m-0"
                    >
                        <Plus size={10} />
                        New Category
                    </button>
                )}
            </div>
        </div>
    );
};
