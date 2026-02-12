// =============================================================================
// TAG TAB: Tag chips by category with inline add & new category
// Sub-component of MusicSettingsModal
// =============================================================================

import React, { useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { MusicTag } from '../../../../core/types/track';

interface TagTabProps {
    localTags: MusicTag[];
    setLocalTags: React.Dispatch<React.SetStateAction<MusicTag[]>>;
}

export const TagTab: React.FC<TagTabProps> = ({ localTags, setLocalTags }) => {
    const [tagSearch, setTagSearch] = useState('');
    const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
    const [inlineTagName, setInlineTagName] = useState('');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    const addTagToCategory = (category: string) => {
        if (!inlineTagName.trim()) return;
        setLocalTags(prev => [...prev, {
            id: uuidv4(),
            name: inlineTagName.trim(),
            category: category === 'Uncategorized' ? undefined : category,
        }]);
        setInlineTagName('');
        setAddingToCategory(null);
    };

    const addNewCategory = () => {
        if (!newCategoryName.trim()) return;
        const catName = newCategoryName.trim();
        setNewCategoryName('');
        setIsAddingCategory(false);
        setAddingToCategory(catName);
        setInlineTagName('');
    };

    const removeTag = (id: string) => {
        setLocalTags(prev => prev.filter((t) => t.id !== id));
    };

    // Group tags for display
    const tagsByCategory = localTags.reduce<Record<string, MusicTag[]>>((acc, tag) => {
        const cat = tag.category || 'Uncategorized';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(tag);
        return acc;
    }, {});

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
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

            {/* Tag pills by category */}
            {Object.entries(tagsByCategory)
                .filter(([category, categoryTags]) => {
                    if (!tagSearch) return true;
                    const q = tagSearch.toLowerCase();
                    return category.toLowerCase().includes(q) ||
                        categoryTags.some(t => t.name.toLowerCase().includes(q));
                })
                .map(([category, categoryTags]) => {
                    const filteredTags = tagSearch
                        ? categoryTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        : categoryTags;
                    if (filteredTags.length === 0 && !category.toLowerCase().includes(tagSearch.toLowerCase())) return null;

                    return (
                        <div key={category}>
                            <span className="text-[10px] text-text-tertiary font-medium uppercase tracking-widest mb-1.5 block">
                                {category}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {(filteredTags.length > 0 ? filteredTags : categoryTags).map((tag) => (
                                    <div
                                        key={tag.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-text-primary bg-white/[0.06] hover:bg-white/[0.1] transition-colors cursor-default"
                                    >
                                        <span>{tag.name}</span>
                                        <button
                                            onClick={() => removeTag(tag.id)}
                                            className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                                            type="button"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                {/* Inline add — same flex row */}
                                {addingToCategory === category ? (
                                    <div className="inline-flex items-center gap-1 bg-white/[0.06] rounded-full pl-2 pr-1">
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
                                            placeholder="Tag name"
                                            className="bg-transparent text-xs text-text-primary outline-none w-[80px] py-1.5"
                                        />
                                        <button
                                            onClick={() => addTagToCategory(category)}
                                            disabled={!inlineTagName.trim()}
                                            className="p-1 rounded-full text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
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
                        </div>
                    );
                })}

            {/* Pending new category — renders when addingToCategory doesn't exist in tagsByCategory */}
            {addingToCategory && !tagsByCategory[addingToCategory] && (
                <div>
                    <span className="text-[10px] text-text-tertiary font-medium uppercase tracking-widest mb-1.5 block">
                        {addingToCategory}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex items-center gap-1 bg-white/[0.06] rounded-full pl-2 pr-1">
                            <input
                                autoFocus
                                type="text"
                                value={inlineTagName}
                                onChange={(e) => setInlineTagName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') addTagToCategory(addingToCategory);
                                    if (e.key === 'Escape') { setAddingToCategory(null); setInlineTagName(''); }
                                }}
                                onBlur={() => { if (!inlineTagName.trim()) { setAddingToCategory(null); setInlineTagName(''); } }}
                                placeholder="Tag name"
                                className="bg-transparent text-xs text-text-primary outline-none w-[80px] py-1.5"
                            />
                            <button
                                onClick={() => addTagToCategory(addingToCategory)}
                                disabled={!inlineTagName.trim()}
                                className="p-1 rounded-full text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Category */}
            <div className="border-t border-border pt-3 mt-2 h-[15px] box-content">
                {isAddingCategory ? (
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
                        className="appearance-none bg-transparent text-[10px] text-text-primary font-medium uppercase tracking-widest outline-none w-full h-[15px] p-0 m-0 border-none block"
                    />
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
