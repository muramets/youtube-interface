import { useReducer, useCallback } from 'react';
import type { ModalState } from '../types/versionManagement';

/**
 * Actions для modal reducer
 */
type ModalAction =
    | { type: 'OPEN_SWITCH_CONFIRM'; targetVersion: number | 'draft' }
    | { type: 'OPEN_DELETE_CONFIRM'; versionNumber: number; snapshotCount: number; totalViews: number; versionLabel?: string; isStacked?: boolean }
    | {
        type: 'OPEN_SNAPSHOT_REQUEST';
        versionToRestore: number | null;
        isForCreateVersion: boolean;
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
    }
    | { type: 'CLOSE' };

/**
 * Reducer для управления состоянием модалок
 */
const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
    switch (action.type) {
        case 'OPEN_SWITCH_CONFIRM':
            return { type: 'SWITCH_CONFIRM', targetVersion: action.targetVersion };

        case 'OPEN_DELETE_CONFIRM':
            return {
                type: 'DELETE_CONFIRM',
                versionNumber: action.versionNumber,
                snapshotCount: action.snapshotCount || 0,
                totalViews: action.totalViews,
                versionLabel: action.versionLabel,
                isStacked: action.isStacked
            };

        case 'OPEN_SNAPSHOT_REQUEST':
            return {
                type: 'SNAPSHOT_REQUEST',
                versionToRestore: action.versionToRestore,
                isForCreateVersion: action.isForCreateVersion,
                resolveCallback: action.resolveCallback
            };

        case 'CLOSE':
            return { type: 'IDLE' };

        default:
            return state;
    }
};

/**
 * Хук для управления состоянием модальных окон через state machine.
 * Упрощает управление 3 модалками: switch confirmation, delete confirmation, snapshot request.
 */
export const useModalState = () => {
    const [modalState, dispatch] = useReducer(modalReducer, { type: 'IDLE' });

    const openSwitchConfirm = useCallback((targetVersion: number | 'draft') => {
        dispatch({ type: 'OPEN_SWITCH_CONFIRM', targetVersion });
    }, []);

    const openDeleteConfirm = useCallback((versionNumber: number, snapshotCount: number = 0, totalViews: number = 0, versionLabel?: string, isStacked?: boolean) => {
        dispatch({ type: 'OPEN_DELETE_CONFIRM', versionNumber, snapshotCount, totalViews, versionLabel, isStacked });
    }, []);

    const openSnapshotRequest = useCallback((params: {
        versionToRestore: number | null;
        isForCreateVersion: boolean;
        resolveCallback?: ((snapshotId: string | null | undefined) => void) | null;
    }) => {
        dispatch({
            type: 'OPEN_SNAPSHOT_REQUEST',
            versionToRestore: params.versionToRestore,
            isForCreateVersion: params.isForCreateVersion,
            resolveCallback: params.resolveCallback || null
        });
    }, []);

    const closeModal = useCallback(() => {
        dispatch({ type: 'CLOSE' });
    }, []);

    return {
        modalState,
        openSwitchConfirm,
        openDeleteConfirm,
        openSnapshotRequest,
        closeModal
    };
};
