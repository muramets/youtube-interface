import React from 'react';
import { ConfirmationModal } from '../../../components/Shared/ConfirmationModal';
import { SnapshotRequestModal } from '../tabs/Traffic/modals/SnapshotRequestModal';
import type { ModalState } from '../types/versionManagement';

interface DetailsModalsProps {
    modalState: ModalState;
    activeVersion: number | 'draft';
    videoTitle: string;
    onConfirmSwitch: (targetVersion: number | 'draft') => void;
    onConfirmDelete: (versionNumber: number) => void;
    onSnapshotUpload: (file: File) => Promise<void>;
    onSkipSnapshot: () => Promise<void>;
    onClose: () => void;
}

/**
 * Компонент, группирующий все модальные окна для DetailsLayout.
 * Упрощает основной компонент, вынося модалки в отдельный файл.
 */
export const DetailsModals: React.FC<DetailsModalsProps> = ({
    modalState,
    activeVersion,
    videoTitle,
    onConfirmSwitch,
    onConfirmDelete,
    onSnapshotUpload,
    onSkipSnapshot,
    onClose
}) => {
    return (
        <>
            {/* Switch Confirmation Modal */}
            <ConfirmationModal
                isOpen={modalState.type === 'SWITCH_CONFIRM'}
                title="Unsaved Changes"
                message="You have unsaved changes. Are you sure you want to switch versions? Your changes will be lost."
                confirmLabel="Discard Changes"
                cancelLabel="Cancel"
                onConfirm={() => {
                    if (modalState.type === 'SWITCH_CONFIRM') {
                        onConfirmSwitch(modalState.targetVersion);
                    }
                    onClose();
                }}
                onClose={onClose}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={modalState.type === 'DELETE_CONFIRM'}
                title="Delete Version"
                message={
                    modalState.type === 'DELETE_CONFIRM'
                        ? modalState.snapshotCount > 0
                            ? `⚠️ This version has ${modalState.snapshotCount} traffic snapshot${modalState.snapshotCount > 1 ? 's' : ''}.\n\nDeleting this version will preserve the traffic data in the Suggested Traffic tab with a "(packaging deleted)" label. You'll still be able to see what packaging drove those views.\n\nAre you sure you want to delete v.${modalState.versionNumber}?`
                            : `Are you sure you want to delete v.${modalState.versionNumber}? This action cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={() => {
                    if (modalState.type === 'DELETE_CONFIRM') {
                        onConfirmDelete(modalState.versionNumber);
                    }
                    onClose();
                }}
                onClose={onClose}
            />

            {/* Snapshot Request Modal */}
            <SnapshotRequestModal
                isOpen={modalState.type === 'SNAPSHOT_REQUEST'}
                version={activeVersion as number}
                videoTitle={videoTitle}
                onUpload={onSnapshotUpload}
                onSkip={onSkipSnapshot}
                onClose={() => {
                    if (modalState.type === 'SNAPSHOT_REQUEST') {
                        modalState.resolveCallback?.(undefined);
                    }
                    onClose();
                }}
            />
        </>
    );
};
