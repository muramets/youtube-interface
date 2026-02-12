// =============================================================================
// TAG SECTION: Tag chips organized by category with inline add
// Uncontrolled component — owns its own ephemeral UI state,
// parent only controls selectedTags via onChange callback.
// =============================================================================

import React, { useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { MusicGenre, MusicTag, MusicSettings } from '../../../../core/types/track';

interface TagSectionProps {
    tags: MusicTag[];
    genres: MusicGenre[];
    selectedTags: string[];
    onSelectedChange: (tags: string[]) => void;
    // Persist new tags to settings
    userId: string;
    channelId: string;
    onSaveSettings: (userId: string, channelId: string, settings: MusicSettings) => Promise<void>;
}

export const TagSection: React.FC<TagSectionProps> = ({
    tags,
    genres,
    selectedTags,
    onSelectedChange,
    userId,
    channelId,
    onSaveSettings,
}) => {
    // --- Internal ephemeral UI state ---
    const [addingTagCategory, setAddingTagCategory] = useState<string | null>(null);
    const [newTagName, setNewTagName] = useState('');
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const toggleTag = (tagName: string) => {
        onSelectedChange(
            selectedTags.includes(tagName)
                ? selectedTags.filter((t) => t !== tagName)
                : [...selectedTags, tagName]
        );
    };

    // Group tags by category, filtered by search
    const filteredTags = searchQuery.trim()
        ? tags.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : tags;

    const tagsByCategory = filteredTags.reduce<Record<string, typeof tags>>((acc, tag) => {
        const cat = tag.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(tag);
        return acc;
    }, {});

    // Ensure new category appears even if it has no tags yet
    if (addingTagCategory && !tagsByCategory[addingTagCategory]) {
        tagsByCategory[addingTagCategory] = [];
    }

    return (
        <div>
            <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2 block">
                Tags
            </label>
            <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tags..."
                    className="modal-input !pl-9 !py-1.5 text-xs"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            <div className="space-y-2.5">
                {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
                    <div key={category}>
                        <span className="text-[10px] text-text-tertiary uppercase tracking-widest">
                            {category}
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {categoryTags.map((tag) => {
                                const isSelected = selectedTags.includes(tag.name);
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleTag(tag.name)}
                                        className={`text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer border-none font-medium ${isSelected
                                            ? 'bg-text-primary text-bg-primary'
                                            : 'bg-[#F2F2F2]/10 text-text-primary hover:bg-[#F2F2F2]/20'
                                            }`}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}
                            {/* Inline add tag to this category */}
                            {addingTagCategory === category ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (!newTagName.trim()) return;
                                                const newTag = {
                                                    id: uuidv4(),
                                                    name: newTagName.trim(),
                                                    category: category === 'Uncategorized' ? undefined : category,
                                                };
                                                const updatedTags = [...tags, newTag];
                                                onSaveSettings(userId, channelId, { genres, tags: updatedTags });
                                                onSelectedChange([...selectedTags, newTag.name]);
                                                setNewTagName('');
                                                setAddingTagCategory(null);
                                            }
                                            if (e.key === 'Escape') {
                                                setAddingTagCategory(null);
                                                setNewTagName('');
                                            }
                                        }}
                                        placeholder="Tag name..."
                                        className="text-xs px-2 py-1 rounded-lg bg-[#F2F2F2]/10 border border-border text-text-primary w-24 outline-none focus:border-text-secondary"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => { setAddingTagCategory(null); setNewTagName(''); }}
                                        className="text-text-tertiary hover:text-text-primary"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setAddingTagCategory(category); setNewTagName(''); }}
                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-[#F2F2F2]/5 text-text-tertiary hover:text-text-primary hover:bg-[#F2F2F2]/10 transition-colors flex items-center gap-1 border-none cursor-pointer"
                                >
                                    <Plus size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {/* Add new category */}
                {isAddingCategory ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (!newCategoryName.trim()) return;
                                    setIsAddingCategory(false);
                                    setNewCategoryName('');
                                    setAddingTagCategory(newCategoryName.trim());
                                    setNewTagName('');
                                }
                                if (e.key === 'Escape') {
                                    setIsAddingCategory(false);
                                    setNewCategoryName('');
                                }
                            }}
                            placeholder="Category name..."
                            className="text-xs px-2 py-1 rounded-lg bg-[#F2F2F2]/10 border border-border text-text-primary w-32 outline-none focus:border-text-secondary"
                            autoFocus
                        />
                        <button
                            onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}
                            className="text-text-tertiary hover:text-text-primary"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAddingCategory(true)}
                        className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none mt-1"
                    >
                        <Plus size={10} />
                        New category
                    </button>
                )}
            </div>
        </div>
    );
};
