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
                            <div className="flex flex-col gap-4">
                                <p className="text-sm text-text-secondary">
                                    This version generated <span className="font-semibold text-text-primary">{modalState.totalViews.toLocaleString()} views</span> according to CSVs with Suggested Traffic attached to it.
                                </p>

                                <p className="text-sm text-text-secondary">
                                    Before you delete this version of packaging, acknowledge what will happen:
                                </p>

                                <div className="bg-yellow-500/10 rounded-lg p-3.5 text-sm text-yellow-200/90">
                                    <ul className="list-disc list-outside ml-4 space-y-2 opacity-90">
                                        <li>
                                            <span className="font-medium">Traffic data will be still saved</span> — your {modalState.snapshotCount} traffic snapshot{modalState.snapshotCount > 1 ? 's' : ''} will be preserved and remain accessible in the Traffic tab
                                        </li>
                                        <li>
                                            This version will be labeled as <span className="font-mono text-xs bg-yellow-500/20 px-1 py-0.5 rounded text-yellow-100">deleted</span> in Suggested Traffic tab so you can still view the original title and thumbnail by hovering over the name of deleted version
                                        </li>
                                    </ul>
                                </div>

                                <p className="text-sm text-text-secondary mt-1">
                                    Are you sure you want to continue?
                                </p>
                            </div>
                        ) : (
                            `Are you sure you want to delete v.${modalState.versionNumber}? This action cannot be undone.`
                        )
                    ) : ''
                }
                className={modalState.type === 'DELETE_CONFIRM' && 'snapshotCount' in modalState && modalState.snapshotCount > 0 ? "w-[480px]" : "w-[400px]"}
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
