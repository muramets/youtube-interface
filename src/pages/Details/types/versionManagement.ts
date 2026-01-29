/**
 * Типы для управления версиями и модальными окнами в DetailsLayout
 */

/**
 * Состояние модальных окон (state machine)
 */
export type ModalState =
    | { type: 'IDLE' }
    | { type: 'SWITCH_CONFIRM'; targetVersion: number | 'draft' }
    | { type: 'DELETE_CONFIRM'; versionNumber: number; snapshotCount: number; totalViews: number; versionLabel?: string; isStacked?: boolean }
    | {
        type: 'SNAPSHOT_REQUEST';
        versionToRestore: number | null;
        isForCreateVersion: boolean;
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
        versionNumber?: number; // Explicit version for display/logic (bypasses activeVersion)
        context?: 'create' | 'restore';
    };

/**
 * Параметры запроса снапшота
 */
export interface SnapshotRequestParams {
    versionToRestore: number | null;
    isForCreateVersion: boolean;
    resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
    versionNumber?: number;
    context?: 'create' | 'restore';
}
