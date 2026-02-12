// =============================================================================
// MUSIC SETTINGS MODAL: Genre & Tag Management ("Admin")
// Thin shell — tab content lives in settings/GenreTab and settings/TagTab
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Disc, Tag } from 'lucide-react';
import { useMusicStore } from '../../../core/stores/musicStore';
import { Button } from '../../../components/ui/atoms';
import type { MusicGenre, MusicTag, MusicSettings } from '../../../core/types/track';
import { GenreTab } from './settings/GenreTab';
import { TagTab } from './settings/TagTab';

interface MusicSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    channelId: string;
    initialTab?: Tab;
}

type Tab = 'genres' | 'tags';

export const MusicSettingsModal: React.FC<MusicSettingsModalProps> = ({
    isOpen,
    onClose,
    userId,
    channelId,
    initialTab,
}) => {
    const { genres, tags, categoryOrder, featuredCategories, sortableCategories, saveSettings } = useMusicStore();

    const [activeTab, setActiveTab] = useState<Tab>('genres');
    const [isClosing, setIsClosing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Local editable copies
    const [localGenres, setLocalGenresRaw] = useState<MusicGenre[]>([]);
    const [localTags, setLocalTagsRaw] = useState<MusicTag[]>([]);
    const isDirtyRef = useRef(false);
    const [isDirty, setIsDirty] = useState(false);

    // Wrapped setters that track mutations
    const setLocalGenres: typeof setLocalGenresRaw = useCallback((action) => {
        setLocalGenresRaw(action);
        isDirtyRef.current = true;
        setIsDirty(true);
    }, []);

    const setLocalTags: typeof setLocalTagsRaw = useCallback((action) => {
        setLocalTagsRaw(action);
        isDirtyRef.current = true;
        setIsDirty(true);
    }, []);

    const [localCategoryOrder, setLocalCategoryOrderRaw] = useState<string[]>([]);
    const setLocalCategoryOrder: typeof setLocalCategoryOrderRaw = useCallback((action) => {
        setLocalCategoryOrderRaw(action);
        isDirtyRef.current = true;
        setIsDirty(true);
    }, []);

    const [localFeaturedCategories, setLocalFeaturedCategoriesRaw] = useState<string[]>([]);
    const setLocalFeaturedCategories: typeof setLocalFeaturedCategoriesRaw = useCallback((action) => {
        setLocalFeaturedCategoriesRaw(action);
        isDirtyRef.current = true;
        setIsDirty(true);
    }, []);

    const [localSortableCategories, setLocalSortableCategoriesRaw] = useState<string[]>([]);
    const setLocalSortableCategories: typeof setLocalSortableCategoriesRaw = useCallback((action) => {
        setLocalSortableCategoriesRaw(action);
        isDirtyRef.current = true;
        setIsDirty(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab || 'genres');
            setLocalGenresRaw([...genres]);
            setLocalTagsRaw([...tags]);
            setLocalCategoryOrderRaw([...categoryOrder]);
            setLocalFeaturedCategoriesRaw([...featuredCategories]);
            setLocalSortableCategoriesRaw([...sortableCategories]);
            isDirtyRef.current = false;
            setIsDirty(false);
        }
    }, [isOpen, genres, tags, categoryOrder, featuredCategories, sortableCategories, initialTab]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 200);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const settings: MusicSettings = {
                genres: localGenres,
                tags: localTags,
                categoryOrder: localCategoryOrder,
                featuredCategories: localFeaturedCategories,
                sortableCategories: localSortableCategories,
            };
            await saveSettings(userId, channelId, settings);
            handleClose();
        } catch (error) {
            console.error('[MusicSettings] Save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen && !isClosing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onClick={handleClose}
        >
            <div
                className={`relative w-full max-w-[520px] max-h-[85vh] bg-bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? 'animate-scale-out' : 'animate-scale-in'} transition-colors duration-200`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 h-[63px] flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-medium text-text-primary">Music Library Settings</h2>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border px-6">
                    {(['genres', 'tags'] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === tab
                                ? 'text-text-primary'
                                : 'text-text-secondary hover:text-text-primary'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                {tab === 'genres' ? <Disc size={14} /> : <Tag size={14} />}
                                {tab === 'genres' ? 'Genres' : 'Tags'}
                            </span>
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-text-primary rounded-t" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6 h-[40vh]">
                    {activeTab === 'genres' && (
                        <GenreTab localGenres={localGenres} setLocalGenres={setLocalGenres} />
                    )}
                    {activeTab === 'tags' && (
                        <TagTab localTags={localTags} setLocalTags={setLocalTags} categoryOrder={localCategoryOrder} setCategoryOrder={setLocalCategoryOrder} featuredCategories={localFeaturedCategories} setFeaturedCategories={setLocalFeaturedCategories} sortableCategories={localSortableCategories} setSortableCategories={setLocalSortableCategories} />
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 h-[67px] border-t border-border flex items-center justify-end gap-2 bg-bg-secondary">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleClose}
                    >
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSave}
                        disabled={!isDirty}
                        isLoading={isSaving}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
