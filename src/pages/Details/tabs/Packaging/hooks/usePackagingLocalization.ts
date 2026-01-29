import { useState, useCallback, useMemo } from 'react';
import { type VideoLocalization } from '../../../../../core/utils/youtubeApi';

interface LocalizationState {
    title: string;
    description: string;
    tags: string[];
}

interface UsePackagingLocalizationOptions {
    initialTitle: string;
    initialDescription: string;
    initialTags: string[];
    initialLocalizations?: Record<string, VideoLocalization>;
}

export const usePackagingLocalization = ({
    initialTitle,
    initialDescription,
    initialTags,
    initialLocalizations = {}
}: UsePackagingLocalizationOptions) => {
    // Current form values (shared across all languages)
    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState(initialDescription);
    const [tags, setTags] = useState<string[]>(initialTags);

    // Active language ('default' for primary, or language code like 'es', 'ru')
    const [activeLanguage, setActiveLanguage] = useState<string>('default');

    // Localizations storage (excludes default)
    const [localizations, setLocalizations] = useState<Record<string, VideoLocalization>>(
        initialLocalizations
    );

    // Default data backup (for switching back to default)
    const [defaultData, setDefaultData] = useState<LocalizationState>({
        title: initialTitle,
        description: initialDescription,
        tags: initialTags
    });

    // Track if there are unsaved changes in current language
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Switch language with optional confirmation
    const switchLanguage = useCallback((newLang: string, skipConfirmation = false): boolean => {
        if (newLang === activeLanguage) return true;

        // Check for unsaved changes if confirmation is required
        if (hasUnsavedChanges && !skipConfirmation) {
            const confirmed = window.confirm(
                'You have unsaved changes. Switch language anyway? Changes will be saved.'
            );
            if (!confirmed) return false;
        }

        // Save current language values before switching
        if (activeLanguage === 'default') {
            setDefaultData({ title, description, tags });
        } else {
            setLocalizations(prev => ({
                ...prev,
                [activeLanguage]: {
                    ...prev[activeLanguage], // Preserve flag, displayName
                    languageCode: activeLanguage,
                    title,
                    description,
                    tags
                }
            }));
        }

        // Load new language values
        if (newLang === 'default') {
            setTitle(defaultData.title);
            setDescription(defaultData.description);
            setTags(defaultData.tags);
        } else {
            const loc = localizations[newLang];
            if (loc) {
                setTitle(loc.title);
                setDescription(loc.description);
                setTags(loc.tags);
            } else {
                // New language - copy from default
                const source = activeLanguage === 'default'
                    ? { title, description, tags }
                    : defaultData;
                setTitle(source.title);
                setDescription(source.description);
                setTags(source.tags);
            }
        }

        setActiveLanguage(newLang);
        setHasUnsavedChanges(false);
        return true;
    }, [activeLanguage, hasUnsavedChanges, title, description, tags, defaultData, localizations]);

    // Add new language (copies current content)
    const addLanguage = useCallback((
        code: string,
        customName?: string,
        customFlag?: string
    ) => {
        if (localizations[code]) return;

        // Copy current content to new language
        const sourceTitle = title;
        const sourceDescription = description;
        const sourceTags = tags;

        setLocalizations(prev => ({
            ...prev,
            [code]: {
                languageCode: code,
                displayName: customName,
                flag: customFlag,
                title: sourceTitle,
                description: sourceDescription,
                tags: sourceTags
            }
        }));

        // Switch to new language immediately
        switchLanguage(code, true);
    }, [localizations, title, description, tags, switchLanguage]);

    // Remove language
    const removeLanguage = useCallback((code: string) => {
        if (activeLanguage === code) {
            // Switch to default without saving deleted language
            setTitle(defaultData.title);
            setDescription(defaultData.description);
            setTags(defaultData.tags);
            setActiveLanguage('default');
        }

        setLocalizations(prev => {
            const newLocs = { ...prev };
            delete newLocs[code];
            return newLocs;
        });
    }, [activeLanguage, defaultData]);

    // Mark as having unsaved changes (call when form fields change)
    const markDirty = useCallback(() => {
        setHasUnsavedChanges(true);
    }, []);

    // Get full payload for saving (syncs current active language first)
    const getFullPayload = useCallback(() => {
        // Sync current values
        const effectiveDefault = activeLanguage === 'default'
            ? { title, description, tags }
            : defaultData;

        const effectiveLocalizations = { ...localizations };
        if (activeLanguage !== 'default') {
            effectiveLocalizations[activeLanguage] = {
                ...localizations[activeLanguage], // Preserve flag, displayName
                languageCode: activeLanguage,
                title,
                description,
                tags
            };
        }

        return {
            title: effectiveDefault.title,
            description: effectiveDefault.description,
            tags: effectiveDefault.tags,
            localizations: effectiveLocalizations
        };
    }, [activeLanguage, title, description, tags, defaultData, localizations]);

    // Reset state (e.g., after save)
    const resetDirty = useCallback(() => {
        setHasUnsavedChanges(false);
    }, []);

    // Reset all form data from a snapshot (used when switching versions)
    const resetToSnapshot = useCallback((snapshot: {
        title: string;
        description: string;
        tags: string[];
        localizations?: Record<string, VideoLocalization>;
    }) => {
        setTitle(snapshot.title);
        setDescription(snapshot.description);
        setTags(snapshot.tags);
        setDefaultData({
            title: snapshot.title,
            description: snapshot.description,
            tags: snapshot.tags
        });
        setLocalizations(snapshot.localizations || {});
        setActiveLanguage('default'); // Reset to default language
        setHasUnsavedChanges(false);
    }, []);

    // Stable setters
    const setFormTitle = useCallback((val: string) => {
        setTitle(val);
        markDirty();
    }, [markDirty]);

    const setFormDescription = useCallback((val: string) => {
        setDescription(val);
        markDirty();
    }, [markDirty]);

    const setFormTags = useCallback((val: string[]) => {
        setTags(val);
        markDirty();
    }, [markDirty]);

    // Memoize the return object to keep references stable
    return useMemo(() => ({
        // Current form values
        title,
        setTitle: setFormTitle,
        description,
        setDescription: setFormDescription,
        tags,
        setTags: setFormTags,

        // Language management
        activeLanguage,
        localizations,
        switchLanguage,
        addLanguage,
        removeLanguage,

        // State helpers
        hasUnsavedChanges,
        getFullPayload,
        resetDirty,
        resetToSnapshot
    }), [
        title, setFormTitle,
        description, setFormDescription,
        tags, setFormTags,
        activeLanguage,
        localizations,
        switchLanguage,
        addLanguage,
        removeLanguage,
        hasUnsavedChanges,
        getFullPayload,
        resetDirty,
        resetToSnapshot
    ]);
};

export type UsePackagingLocalizationResult = ReturnType<typeof usePackagingLocalization>;
