/**
 * Типы для управления версиями и модальными окнами в DetailsLayout
 */

/**
 * Состояние модальных окон (state machine)
 */
export type ModalState =
    | { type: 'IDLE' }
    | { type: 'SWITCH_CONFIRM'; targetVersion: number | 'draft' }
    | { type: 'DELETE_CONFIRM'; versionNumber: number }
    | {
        type: 'SNAPSHOT_REQUEST';
        versionToRestore: number | null;
        isForCreateVersion: boolean;
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
    };

/**
 * Параметры запроса снапшота
 */
export interface SnapshotRequestParams {
    versionToRestore: number | null;
    isForCreateVersion: boolean;
    resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
}
