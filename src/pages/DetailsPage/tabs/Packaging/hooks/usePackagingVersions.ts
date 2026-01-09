import { useReducer, useCallback, useMemo, useEffect } from 'react';
import type { PackagingVersion, VideoLocalization } from '../../../../../core/utils/youtubeApi';
import { VersionService } from '../../../services/VersionService';

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
    initialActiveVersion?: number | 'draft';
}

// State managed by reducer
interface VersionsState {
    packagingHistory: PackagingVersion[];
    currentVersionNumber: number;
    hasDraft: boolean;
    activeVersion: number | 'draft';
    viewingVersion: number | 'draft';
    viewingPeriodIndex?: number;
    navSortedVersions: PackagingVersion[]; // Pre-computed for atomic updates
}

// Actions
type VersionsAction =
    | { type: 'SYNC_FROM_PROPS'; payload: { history: PackagingVersion[]; currentVersion: number; isDraft: boolean; initialActiveVersion?: number | 'draft' } }
    | { type: 'CREATE_VERSION'; payload: { newVersion: PackagingVersion; updatedHistory: PackagingVersion[]; closingSnapshotId?: string | null } }
    | { type: 'DELETE_VERSION'; payload: { versionNumbers: number[] } }
    | { type: 'RESTORE_VERSION'; payload: { versionNumber: number; closingSnapshotId?: string | null } }
    | { type: 'SWITCH_TO_VERSION'; payload: { versionNumber: number | 'draft'; periodIndex?: number } }
    | { type: 'SAVE_DRAFT'; payload: { closingSnapshotId?: string | null } }
    | { type: 'MARK_DIRTY' }
    | { type: 'SET_CURRENT_VERSION_NUMBER'; payload: number }
    | { type: 'SET_HAS_DRAFT'; payload: boolean }
    | { type: 'SET_ACTIVE_VERSION'; payload: { versionNumber: number | 'draft'; closingSnapshotId?: string | null } };

/**
 * BUSINESS LOGIC: Helper Functions for Active Periods Management (Aliased from VersionService)
 */
const { ensureActivePeriods, closeAllPeriods, addNewActivePeriod } = VersionService;

// Helper: Compute sidebar-sorted versions (active first, then desc by number)


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
            const { history, currentVersion, isDraft, initialActiveVersion } = action.payload;

            // Priority: 
            // 1. initialActiveVersion from props (if provided)
            // 2. 'draft' if isDraft is true
            // 3. Max version if history exists
            // 4. Fallback to 'draft'
            const computedActive = initialActiveVersion || (isDraft ? 'draft' : (history.length > 0
                ? Math.max(...history.map(v => v.versionNumber))
                : 'draft'));

            console.log('[usePackagingVersions] SYNC_FROM_PROPS:', {
                isDraft,
                initialActiveVersion,
                computedActive,
                historyCount: history.length
            });

            // Smart sync: preserve local selection if still valid AND we are not forcing a specific initialActiveVersion
            const isActiveValid = state.activeVersion === 'draft' ||
                history.some(v => v.versionNumber === state.activeVersion);
            const isViewingValid = state.viewingVersion === 'draft' ||
                history.some(v => v.versionNumber === state.viewingVersion);

            // If we have an explicit initialActiveVersion from props (e.g. from fresh data fetch), use it.
            // Otherwise, if our local state is valid, keep it.
            // This prevents "flicker" where props might temporarily show old state (isDraft=true) 
            // after we locally set it to false.
            let newActive = computedActive;
            if (initialActiveVersion !== undefined && initialActiveVersion !== null) {
                newActive = initialActiveVersion;
            } else if (isActiveValid) {
                newActive = state.activeVersion;
            }

            // Fix for "Draft persisting after Restore" race condition:
            // 1. If local history has more items than props history, it means we just created/restored a version locally (Immutable)
            // 2. If local hasDraft is false but props say true, but the active version is a number matching our local, it's stale (Legacy Restore)
            let newHasDraft = isDraft;
            const isLocalHistoryAhead = state.packagingHistory.length > history.length;
            const isStaleDraftProp = state.hasDraft === false &&
                isDraft === true &&
                typeof state.activeVersion === 'number' &&
                newActive === state.activeVersion;

            if (isLocalHistoryAhead || isStaleDraftProp) {
                newHasDraft = state.hasDraft;
            }

            // Sanitize history: ensure at most one version is active (has open period)
            const sanitizedHistory = history.map(v => {
                if (v.versionNumber !== newActive) {
                    return closeAllPeriods(v);
                }

                // If this IS the active version, ensure it has an OPEN period
                const withPeriods = ensureActivePeriods(v);
                const hasOpen = withPeriods.activePeriods!.some(p => !p.endDate);
                if (!hasOpen) {
                    return addNewActivePeriod(withPeriods);
                }
                return withPeriods;
            });

            return {
                packagingHistory: sanitizedHistory,
                currentVersionNumber: currentVersion,
                hasDraft: newHasDraft,
                activeVersion: newActive,
                viewingVersion: isViewingValid ? state.viewingVersion : computedActive,
                viewingPeriodIndex: isViewingValid ? state.viewingPeriodIndex : 0,
                navSortedVersions: computeNavSorted(sanitizedHistory, newActive)
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
                viewingPeriodIndex: 0,
                navSortedVersions: computeNavSorted(updatedHistory, newVersion.versionNumber)
            };
        }

        case 'DELETE_VERSION': {
            const { versionNumbers } = action.payload;
            const remaining = state.packagingHistory.filter(v => !versionNumbers.includes(v.versionNumber));
            const newest = remaining.length > 0 ? Math.max(...remaining.map(v => v.versionNumber)) : null;

            // Determine the new active version after deletion
            let newActive: number | 'draft' = 'draft';
            if (remaining.length > 0) {
                // If the currently active version is not deleted, keep it.
                if (typeof state.activeVersion === 'number' && !versionNumbers.includes(state.activeVersion)) {
                    newActive = state.activeVersion;
                } else {
                    // Otherwise, activate the newest remaining version.
                    newActive = newest!;
                }
            }

            // Determine if the currently viewed version was deleted
            const isViewingDeleted = typeof state.viewingVersion === 'number' && versionNumbers.includes(state.viewingVersion);

            // Ensure the new active version's periods are managed correctly
            const updatedHistory = remaining.map(v => {
                if (v.versionNumber === newActive && typeof newActive === 'number') {
                    // Force close existing and open fresh
                    return addNewActivePeriod(closeAllPeriods(v));
                }
                return closeAllPeriods(v);
            });

            return {
                ...state,
                packagingHistory: updatedHistory,
                currentVersionNumber: remaining.length === 0 ? 1 : (newest! + 1),
                hasDraft: remaining.length === 0,
                activeVersion: newActive,
                viewingVersion: isViewingDeleted
                    ? (newest ?? 'draft')
                    : state.viewingVersion,
                viewingPeriodIndex: isViewingDeleted ? 0 : state.viewingPeriodIndex,
                navSortedVersions: computeNavSorted(updatedHistory, newActive)
            };
        }

        case 'RESTORE_VERSION': {
            const { versionNumber, closingSnapshotId } = action.payload;

            /**
             * BUSINESS LOGIC: Restore Version with New Period
             * 
             * When restoring an old version (e.g., v.3 → v.1):
             * 1. Close the current version's (v.3) active period
             * 2. Add a NEW activation period to the restored version (v.1)
             * 
             * IMPORTANT: We don't reuse v.1's old period! We create a new one.
             * This allows accurate attribution of views to each activation period.
             * 
             * Example:
             * v.1 activePeriods before restore: [{ startDate: Day1, endDate: Day2 }]
             * v.1 activePeriods after restore:  [
             *   { startDate: Day1, endDate: Day2 },
             *   { startDate: Day4, endDate: undefined } ← NEW period!
             * ]
             */

            const updatedHistory = state.packagingHistory.map(v => {
                if (v.versionNumber === versionNumber) {
                    return addNewActivePeriod(closeAllPeriods(v, closingSnapshotId));
                }
                return closeAllPeriods(v, closingSnapshotId);
            });

            return {
                ...state,
                packagingHistory: updatedHistory,
                hasDraft: false,
                activeVersion: versionNumber,
                viewingVersion: versionNumber,
                viewingPeriodIndex: 0, // Latest period after restore
                navSortedVersions: computeNavSorted(updatedHistory, versionNumber)
            };
        }

        case 'SWITCH_TO_VERSION':
            return {
                ...state,
                viewingVersion: action.payload.versionNumber,
                viewingPeriodIndex: action.payload.periodIndex ?? 0
            };

        case 'SAVE_DRAFT': {
            const { closingSnapshotId } = action.payload;

            const updatedHistory = state.packagingHistory.map(v => {
                return closeAllPeriods(v, closingSnapshotId || null);
            });

            return {
                ...state,
                packagingHistory: updatedHistory,
                hasDraft: true,
                activeVersion: 'draft',
                viewingVersion: 'draft',
                viewingPeriodIndex: 0,
                navSortedVersions: computeNavSorted(updatedHistory, 'draft')
            };
        }

        case 'MARK_DIRTY':
            // USER REQUIREMENT: Draft should only appear explicitly (via Save as Draft)
            // Dirty state is managed externally by formDirty flag.
            // We no longer automatically show "Draft" in sidebar just because fields changed.
            return state;

        case 'SET_CURRENT_VERSION_NUMBER':
            return { ...state, currentVersionNumber: action.payload };

        case 'SET_HAS_DRAFT':
            return { ...state, hasDraft: action.payload };

        case 'SET_ACTIVE_VERSION': {
            const { versionNumber, closingSnapshotId } = action.payload;

            const updatedHistory = state.packagingHistory.map(v => {
                if (v.versionNumber === versionNumber && typeof versionNumber === 'number') {
                    return addNewActivePeriod(closeAllPeriods(v, closingSnapshotId || null));
                }
                return closeAllPeriods(v, closingSnapshotId || null);
            });

            return {
                ...state,
                packagingHistory: updatedHistory,
                activeVersion: versionNumber,
                navSortedVersions: computeNavSorted(updatedHistory, versionNumber)
            };
        }

        default:
            return state;
    }
}

export const usePackagingVersions = ({
    initialHistory,
    initialCurrentVersion,
    isDraft: initialIsDraft,
    initialActiveVersion
}: UsePackagingVersionsOptions) => {
    const initialActive = initialActiveVersion || (initialIsDraft ? 'draft' : (initialHistory.length > 0
        ? Math.max(...initialHistory.map(v => v.versionNumber))
        : 'draft'));

    console.log('[usePackagingVersions] Initializing hook:', {
        initialIsDraft,
        initialActiveVersion,
        initialActive,
        historyCount: initialHistory.length
    });

    // Single reducer for atomic state management
    const [state, dispatch] = useReducer(versionsReducer, {
        packagingHistory: initialHistory,
        currentVersionNumber: initialCurrentVersion,
        hasDraft: initialIsDraft,
        activeVersion: initialActive,
        viewingVersion: initialActive,
        viewingPeriodIndex: 0,
        navSortedVersions: computeNavSorted(initialHistory, initialActive)
    });

    // Sync with props
    useEffect(() => {
        dispatch({
            type: 'SYNC_FROM_PROPS',
            payload: {
                history: initialHistory,
                currentVersion: initialCurrentVersion,
                isDraft: initialIsDraft,
                initialActiveVersion
            }
        });
    }, [initialHistory, initialCurrentVersion, initialIsDraft, initialActiveVersion]);

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

    const switchToVersion = useCallback((versionNumber: number | 'draft', periodIndex?: number) => {
        dispatch({ type: 'SWITCH_TO_VERSION', payload: { versionNumber, periodIndex } });
    }, []);

    const restoreVersion = useCallback((versionNumber: number, closingSnapshotId?: string | null): {
        updatedHistory: PackagingVersion[]
    } => {
        const updatedHistory = state.packagingHistory.map(v => {
            if (v.versionNumber === versionNumber) {
                return addNewActivePeriod(closeAllPeriods(v, closingSnapshotId || null));
            }
            return closeAllPeriods(v, closingSnapshotId || null);
        });

        dispatch({ type: 'RESTORE_VERSION', payload: { versionNumber, closingSnapshotId: closingSnapshotId || null } });
        return { updatedHistory };
    }, [state.packagingHistory]);

    const createVersion = useCallback((snapshot: PackagingSnapshot, closingSnapshotId?: string | null): {
        newVersion: PackagingVersion;
        updatedHistory: PackagingVersion[];
        currentPackagingVersion: number;
    } => {
        let updatedHistory = state.packagingHistory.map(v => {
            return closeAllPeriods(v, closingSnapshotId || null);
        });

        const newVersion: PackagingVersion = {
            versionNumber: state.currentVersionNumber,
            startDate: Date.now(),
            endDate: null,
            activePeriods: [{
                startDate: Date.now(),
                endDate: null,
                closingSnapshotId: null
            }],
            checkins: [],
            configurationSnapshot: snapshot
        };

        updatedHistory = [...updatedHistory, newVersion];

        dispatch({ type: 'CREATE_VERSION', payload: { newVersion, updatedHistory, closingSnapshotId } });

        return {
            newVersion,
            updatedHistory,
            currentPackagingVersion: state.currentVersionNumber + 1
        };
    }, [state.packagingHistory, state.activeVersion, state.currentVersionNumber]);

    const saveDraft = useCallback((closingSnapshotId?: string | null): {
        updatedHistory: PackagingVersion[]
    } => {
        const updatedHistory = state.packagingHistory.map(v => {
            return closeAllPeriods(v, closingSnapshotId || null);
        });

        dispatch({ type: 'SAVE_DRAFT', payload: { closingSnapshotId } });

        return { updatedHistory };
    }, [state.packagingHistory, state.activeVersion]);

    const deleteVersion = useCallback((versionNumbers: number | number[]) => {
        const payload = Array.isArray(versionNumbers) ? versionNumbers : [versionNumbers];
        dispatch({ type: 'DELETE_VERSION', payload: { versionNumbers: payload } });
    }, []);

    const markDirty = useCallback(() => {
        dispatch({ type: 'MARK_DIRTY' });
    }, []);

    const getVersionsPayload = useCallback(() => ({
        packagingHistory: state.packagingHistory,
        currentPackagingVersion: state.currentVersionNumber,
        isDraft: state.hasDraft,
        activeVersion: state.activeVersion
    }), [state.packagingHistory, state.currentVersionNumber, state.hasDraft, state.activeVersion]);

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

    const setActiveVersion = useCallback((versionNumber: number | 'draft', closingSnapshotId?: string | null) => {
        dispatch({ type: 'SET_ACTIVE_VERSION', payload: { versionNumber, closingSnapshotId } });
    }, []);

    const setCurrentVersionNumber = useCallback((value: number | ((prev: number) => number)) => {
        const newValue = typeof value === 'function' ? value(state.currentVersionNumber) : value;
        dispatch({ type: 'SET_CURRENT_VERSION_NUMBER', payload: newValue });
    }, [state.currentVersionNumber]);

    // Compute next VISUAL version number (excluding clones)
    // This is what users see in the UI, not the internal database version number
    const nextVisualVersionNumber = useMemo(() => {
        if (state.packagingHistory.length === 0) {
            return 1; // First version
        }

        // Find all unique "canonical" versions (cloneOf || versionNumber)
        // Since we map these sequentially (1, 2, 3...) in the UI, the next visual version
        // is simply the count of unique groups + 1.
        const canonicalVersions = new Set(
            state.packagingHistory.map(v => v.cloneOf || v.versionNumber)
        );

        return canonicalVersions.size + 1;
    }, [state.packagingHistory]);

    return useMemo(() => ({
        // State
        packagingHistory: state.packagingHistory,
        sortedVersions,
        navSortedVersions: state.navSortedVersions,
        currentVersionNumber: state.currentVersionNumber,
        nextVisualVersionNumber, // Visual version number for UI (excludes clones)
        hasDraft: state.hasDraft,
        activeVersion: state.activeVersion,
        viewingVersion: state.viewingVersion,
        viewingPeriodIndex: state.viewingPeriodIndex,

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
