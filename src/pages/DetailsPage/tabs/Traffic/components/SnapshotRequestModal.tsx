import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TrafficUploader } from './TrafficUploader';
import { AlertTriangle, X } from 'lucide-react';

interface SnapshotRequestModalProps {
    isOpen: boolean;
    version: number; // Version to create snapshot for (current active version)
    videoTitle: string;
    onUpload: (file: File) => Promise<void>;
    onSkip: () => void;
    onClose: () => void;
}

export const SnapshotRequestModal: React.FC<SnapshotRequestModalProps> = ({
    isOpen,
    version,
    videoTitle,
    onUpload,
    onSkip,
    onClose
}) => {
    const [isUploading, setIsUploading] = useState(false);

    const handleUpload = async (file: File) => {
        setIsUploading(true);
        try {
            await onUpload(file);
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[500px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">
                        Save Traffic Snapshot for v.{version}
                    </h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-4">
                    {/* Info Message */}
                    <div className="flex gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-text-primary font-medium mb-1">
                                Save final traffic data for v.{version}
                            </p>
                            <p className="text-xs text-text-secondary">
                                Upload the latest CSV from YouTube Analytics to create a snapshot of v.{version}'s traffic before restoring the previous version.
                            </p>
                        </div>
                    </div>

                    {/* Video Info */}
                    <div className="px-4 py-3 bg-white/5 rounded-lg">
                        <p className="text-xs text-text-secondary mb-1">Video</p>
                        <p className="text-sm text-text-primary font-medium truncate">{videoTitle}</p>
                    </div>

                    {/* Uploader */}
                    <div className="flex flex-col items-center gap-4 py-4">
                        <TrafficUploader
                            onUpload={async (_sources, _totalRow, file) => {
                                if (file) {
                                    await handleUpload(file);
                                }
                            }}
                        />
                    </div>

                    {/* Helper Text */}
                    <p className="text-xs text-text-secondary text-center">
                        If you skip, we'll use current traffic data (if any) as the snapshot.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex gap-3 border-t border-border bg-bg-secondary/30">
                    <button
                        onClick={onSkip}
                        disabled={isUploading}
                        className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Skip & Restore Anyway
                    </button>
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
