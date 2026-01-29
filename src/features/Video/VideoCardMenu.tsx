import React from 'react';
import { ListPlus, Trash2, RefreshCw, MinusCircle, ArrowLeftRight, FileText } from 'lucide-react';
import { Dropdown } from '../../components/ui/molecules/Dropdown';

interface VideoCardMenuProps {
    isOpen: boolean;
    onClose: () => void;
    anchorEl: HTMLElement | null;
    playlistId?: string;
    onAddToPlaylist: (e: React.MouseEvent) => void;
    onRemove: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
    onSync?: (e: React.MouseEvent) => void;
    isSyncing?: boolean;
    onSwitchView?: (e: React.MouseEvent) => void;
    onDetails?: (e: React.MouseEvent) => void;
}

export const VideoCardMenu: React.FC<VideoCardMenuProps> = ({
    isOpen,
    onClose,
    anchorEl,
    playlistId,
    onAddToPlaylist,
    onRemove,
    onDelete,
    onSync,
    isSyncing,
    onSwitchView,
    onDetails
}) => {
    const showSaveToPlaylist = !playlistId;

    const showDelete = true; // Always allow deleting/removing
    const showSync = !!onSync;

    return (
        <Dropdown
            isOpen={isOpen}
            onClose={onClose}
            anchorEl={anchorEl}
            width={220}
            className="text-text-primary"
            align="left"
        >
            {showSync && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onSync}
                >
                    <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
                </div>
            )}

            {showSync && (showSaveToPlaylist || showDelete) && (
                <div className="h-px bg-border my-2"></div>
            )}

            {showSaveToPlaylist && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onAddToPlaylist}
                >
                    <ListPlus size={20} />
                    <span>Save to playlist</span>
                </div>
            )}

            {showSaveToPlaylist && showDelete && (
                <div className="h-px bg-border my-2"></div>
            )}



            {onDetails && (
                <div
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                    onClick={onDetails}
                >
                    <FileText size={20} />
                    <span>Details</span>
                </div>
            )}

            {showDelete && (
                <>
                    {playlistId && (
                        <div
                            className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                            onClick={onRemove}
                        >
                            <MinusCircle size={20} />
                            <span>Remove from playlist</span>
                        </div>
                    )}
                    <div
                        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                        onClick={playlistId ? onDelete : onRemove}
                    >
                        <Trash2 size={20} />
                        <span>Delete</span>
                    </div>
                </>
            )}

            {onSwitchView && (
                <>
                    <div className="h-px bg-border my-2"></div>
                    <div
                        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-hover-bg text-sm"
                        onClick={onSwitchView}
                    >
                        <ArrowLeftRight size={20} />
                        <span>Switch View</span>
                    </div>
                </>
            )}
        </Dropdown>
    );
};
