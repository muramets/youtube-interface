import { useReducer, useCallback, useMemo, useEffect } from 'react';
import type { PackagingVersion, VideoLocalization } from '../../../../../core/utils/youtubeApi';

interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string | null;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles: number[];
        thumbnails: number[];
    };
    abTestVariants?: string[];
    localizations?: Record<string, VideoLocalization>;
    originalName?: string;
}

interface UsePackagingVersionsOptions {
    initialHistory: PackagingVersion[];
    initialCurrentVersion: number;
    isDraft: boolean;
}

// State managed by reducer
interface VersionsState {
    packagingHistory: PackagingVersion[];
    currentVersionNumber: number;
    hasDraft: boolean;
    activeVersion: number | 'draft';
    viewingVersion: number | 'draft';
    navSortedVersions: PackagingVersion[]; // Pre-computed for atomic updates
}

// Actions
type VersionsAction =
    | { type: 'SYNC_FROM_PROPS'; payload: { history: PackagingVersion[]; currentVersion: number; isDraft: boolean } }
    | { type: 'CREATE_VERSION'; payload: { newVersion: PackagingVersion; updatedHistory: PackagingVersion[] } }
    | { type: 'DELETE_VERSION'; payload: { versionNumber: number } }
    | { type: 'RESTORE_VERSION'; payload: { versionNumber: number } }
    | { type: 'SWITCH_TO_VERSION'; payload: { versionNumber: number | 'draft' } }
    | { type: 'SAVE_DRAFT' }
    | { type: 'MARK_DIRTY' }
    | { type: 'SET_CURRENT_VERSION_NUMBER'; payload: number }
    | { type: 'SET_HAS_DRAFT'; payload: boolean }
    | { type: 'SET_ACTIVE_VERSION'; payload: number | 'draft' };

// Helper: Compute sidebar-sorted versions (active first, then desc by number)
function computeNavSorted(history: PackagingVersion[], activeVersion: number | 'draft'): PackagingVersion[] {
    return [...history].sort((a, b) => {
        const aIsActive = a.versionNumber === activeVersion;
        const bIsActive = b.versionNumber === activeVersion;
        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;
        return b.versionNumber - a.versionNumber;
    });
}

// Reducer - single source of truth for all state transitions
function versionsReducer(state: VersionsState, action: VersionsAction): VersionsState {
    switch (action.type) {
        case 'SYNC_FROM_PROPS': {
            const { history, currentVersion, isDraft } = action.payload;
            const computedActive = isDraft ? 'draft' : (history.length > 0
                ? Math.max(...history.map(v => v.versionNumber))
                : 'draft');

            // Smart sync: preserve local selection if still valid
            const isActiveValid = state.activeVersion === 'draft' ||
                history.some(v => v.versionNumber === state.activeVersion);
            const isViewingValid = state.viewingVersion === 'draft' ||
                history.some(v => v.versionNumber === state.viewingVersion);

            const newActive = isActiveValid ? state.activeVersion : computedActive;

            return {
                packagingHistory: history,
                currentVersionNumber: currentVersion,
                hasDraft: isDraft,
                activeVersion: newActive,
                viewingVersion: isViewingValid ? state.viewingVersion : computedActive,
                navSortedVersions: computeNavSorted(history, newActive)
            };
        }

        case 'CREATE_VERSION': {
            const { newVersion, updatedHistory } = action.payload;
            return {
                ...state,
                packagingHistory: updatedHistory,
                currentVersionNumber: state.currentVersionNumber + 1,
                hasDraft: false,
                activeVersion: newVersion.versionNumber,
                viewingVersion: newVersion.versionNumber,
                navSortedVersions: computeNavSorted(updatedHistory, newVersion.versionNumber)
            };
        }

        case 'DELETE_VERSION': {
            const { versionNumber } = action.payload;
            const remaining = state.packagingHistory.filter(v => v.versionNumber !== versionNumber);
            const newest = remaining.length > 0 ? Math.max(...remaining.map(v => v.versionNumber)) : null;
            const newActive = state.activeVersion === versionNumber ? (newest ?? 'draft') : state.activeVersion;

            return {
                ...state,
                packagingHistory: remaining,
                currentVersionNumber: remaining.length === 0 ? 1 : (newest! + 1),
                hasDraft: remaining.length === 0,
                activeVersion: newActive,
                viewingVersion: state.viewingVersion === versionNumber
                    ? (newest ?? 'draft')
                    : state.viewingVersion,
                navSortedVersions: computeNavSorted(remaining, newActive)
            };
        }

        case 'RESTORE_VERSION': {
            const { versionNumber } = action.payload;
            const now = Date.now();

            const updatedHistory = state.packagingHistory.map(v => {
                if (v.versionNumber === state.activeVersion && typeof state.activeVersion === 'number') {
                    return { ...v, endDate: now };
                }
                if (v.versionNumber === versionNumber) {
                    return { ...v, endDate: now };
                }
                return v;
            });

            return {
                ...state,
                packagingHistory: updatedHistory,
                hasDraft: false,
                activeVersion: versionNumber,
                viewingVersion: versionNumber,
                navSortedVersions: computeNavSorted(updatedHistory, versionNumber)
            };
        }

        case 'SWITCH_TO_VERSION':
            return {
                ...state,
                viewingVersion: action.payload.versionNumber
            };

        case 'SAVE_DRAFT':
            return {
                ...state,
                hasDraft: true,
                activeVersion: 'draft',
                viewingVersion: 'draft',
                navSortedVersions: computeNavSorted(state.packagingHistory, 'draft')
            };

        case 'MARK_DIRTY':
            return state.viewingVersion !== 'draft' ? { ...state, hasDraft: true } : state;

        case 'SET_CURRENT_VERSION_NUMBER':
            return { ...state, currentVersionNumber: action.payload };

        case 'SET_HAS_DRAFT':
            return { ...state, hasDraft: action.payload };

        case 'SET_ACTIVE_VERSION':
            return {
                ...state,
                activeVersion: action.payload,
                navSortedVersions: computeNavSorted(state.packagingHistory, action.payload)
            };

        default:
            return state;
    }
}

export const usePackagingVersions = ({
    initialHistory,
    initialCurrentVersion,
    isDraft: initialIsDraft
}: UsePackagingVersionsOptions) => {
    const initialActive = initialIsDraft ? 'draft' : (initialHistory.length > 0
        ? Math.max(...initialHistory.map(v => v.versionNumber))
        : 'draft');

    // Single reducer for atomic state management
    const [state, dispatch] = useReducer(versionsReducer, {
        packagingHistory: initialHistory,
        currentVersionNumber: initialCurrentVersion,
        hasDraft: initialIsDraft,
        activeVersion: initialActive,
        viewingVersion: initialActive,
        navSortedVersions: computeNavSorted(initialHistory, initialActive)
    });

    // Sync with props
    useEffect(() => {
        dispatch({
            type: 'SYNC_FROM_PROPS',
            payload: {
                history: initialHistory,
                currentVersion: initialCurrentVersion,
                isDraft: initialIsDraft
            }
        });
    }, [initialHistory, initialCurrentVersion, initialIsDraft]);

    // Derived values - always in sync with state
    const sortedVersions = useMemo(() =>
        [...state.packagingHistory].sort((a, b) => b.versionNumber - a.versionNumber),
        [state.packagingHistory]
    );

    // Actions
    const getVersionSnapshot = useCallback((versionNumber: number): PackagingSnapshot | null => {
        const version = state.packagingHistory.find(v => v.versionNumber === versionNumber);
        return version?.configurationSnapshot || null;
    }, [state.packagingHistory]);

    const switchToVersion = useCallback((versionNumber: number | 'draft') => {
        dispatch({ type: 'SWITCH_TO_VERSION', payload: { versionNumber } });
    }, []);

    const restoreVersion = useCallback((versionNumber: number) => {
        dispatch({ type: 'RESTORE_VERSION', payload: { versionNumber } });
    }, []);

    const createVersion = useCallback((snapshot: PackagingSnapshot): {
        newVersion: PackagingVersion;
        updatedHistory: PackagingVersion[];
        currentPackagingVersion: number;
    } => {
        let updatedHistory = state.packagingHistory;
        if (state.activeVersion !== 'draft') {
            updatedHistory = state.packagingHistory.map(v =>
                v.versionNumber === state.activeVersion
                    ? { ...v, endDate: Date.now() }
                    : v
            );
        }

        const newVersion: PackagingVersion = {
            versionNumber: state.currentVersionNumber,
            startDate: Date.now(),
            checkins: [],
            configurationSnapshot: snapshot
        };

        updatedHistory = [...updatedHistory, newVersion];

        dispatch({ type: 'CREATE_VERSION', payload: { newVersion, updatedHistory } });

        return {
            newVersion,
            updatedHistory,
            currentPackagingVersion: state.currentVersionNumber + 1
        };
    }, [state.currentVersionNumber, state.activeVersion, state.packagingHistory]);

    const saveDraft = useCallback(() => {
        dispatch({ type: 'SAVE_DRAFT' });
    }, []);

    const deleteVersion = useCallback((versionNumber: number) => {
        dispatch({ type: 'DELETE_VERSION', payload: { versionNumber } });
    }, []);

    const markDirty = useCallback(() => {
        dispatch({ type: 'MARK_DIRTY' });
    }, []);

    const getVersionsPayload = useCallback(() => ({
        packagingHistory: state.packagingHistory,
        currentPackagingVersion: state.currentVersionNumber,
        isDraft: state.hasDraft
    }), [state.packagingHistory, state.currentVersionNumber, state.hasDraft]);

    // Direct setters for external sync
    const setPackagingHistory = useCallback((history: PackagingVersion[] | ((prev: PackagingVersion[]) => PackagingVersion[])) => {
        const newHistory = typeof history === 'function' ? history(state.packagingHistory) : history;
        dispatch({
            type: 'SYNC_FROM_PROPS',
            payload: {
                history: newHistory,
                currentVersion: state.currentVersionNumber,
                isDraft: state.hasDraft
            }
        });
    }, [state.packagingHistory, state.currentVersionNumber, state.hasDraft]);

    const setHasDraft = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const newValue = typeof value === 'function' ? value(state.hasDraft) : value;
        dispatch({ type: 'SET_HAS_DRAFT', payload: newValue });
    }, [state.hasDraft]);

    const setActiveVersion = useCallback((value: (number | 'draft') | ((prev: number | 'draft') => number | 'draft')) => {
        const newValue = typeof value === 'function' ? value(state.activeVersion) : value;
        dispatch({ type: 'SET_ACTIVE_VERSION', payload: newValue });
    }, [state.activeVersion]);

    const setCurrentVersionNumber = useCallback((value: number | ((prev: number) => number)) => {
        const newValue = typeof value === 'function' ? value(state.currentVersionNumber) : value;
        dispatch({ type: 'SET_CURRENT_VERSION_NUMBER', payload: newValue });
    }, [state.currentVersionNumber]);

    return useMemo(() => ({
        // State
        packagingHistory: state.packagingHistory,
        sortedVersions,
        navSortedVersions: state.navSortedVersions,
        currentVersionNumber: state.currentVersionNumber,
        hasDraft: state.hasDraft,
        activeVersion: state.activeVersion,
        viewingVersion: state.viewingVersion,

        // Actions
        switchToVersion,
        restoreVersion,
        createVersion,
        saveDraft,
        deleteVersion,
        markDirty,
        getVersionSnapshot,
        getVersionsPayload,

        // Direct setters
        setPackagingHistory,
        setHasDraft,
        setActiveVersion,
        setCurrentVersionNumber
    }), [
        state,
        sortedVersions,
        switchToVersion,
        restoreVersion,
        createVersion,
        saveDraft,
        deleteVersion,
        markDirty,
        getVersionSnapshot,
        getVersionsPayload,
        setPackagingHistory,
        setHasDraft,
        setActiveVersion,
        setCurrentVersionNumber
    ]);
};
