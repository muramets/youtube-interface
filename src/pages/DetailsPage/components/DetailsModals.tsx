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
                    modalState.type === 'DELETE_CONFIRM' ? (
                        modalState.snapshotCount > 0 ? (
                            <div className="flex flex-col gap-3">
                                <p>
                                    This version has <span className="font-semibold text-text-primary">{modalState.snapshotCount} traffic snapshot{modalState.snapshotCount > 1 ? 's' : ''}</span> attached to it.
                                </p>
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-200">
                                    <p className="font-medium mb-1">Traffic data will be preserved</p>
                                    <ul className="list-disc list-inside opacity-90 space-y-0.5 ml-1">
                                        <li>Snapshots will remain in the Traffic tab</li>
                                        <li>Marked as <span className="font-mono text-xs bg-blue-500/20 px-1 py-0.5 rounded">v.{modalState.versionNumber} (packaging deleted)</span></li>
                                        <li>Original packaging details viewable via tooltip</li>
                                    </ul>
                                </div>
                                <p className="text-sm text-text-secondary mt-1">
                                    Are you sure you want to delete <span className="font-medium text-text-primary">v.{modalState.versionNumber}</span>?
                                </p>
                            </div>
                        ) : (
                            `Are you sure you want to delete v.${modalState.versionNumber}? This action cannot be undone.`
                        )
                    ) : ''
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
