import React, { useState, useRef, useEffect } from 'react';
import { Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { useUIStore } from '../../../core/stores/uiStore';
import { exportPlaylistCsv, downloadCsv, generatePlaylistExportFilename } from '../utils/exportPlaylistCsv';
import { downloadImagesAsZip } from '../../../core/utils/zipUtils';

interface PlaylistExportControlsProps {
    videos: VideoDetails[];
    playlistName: string;
}

/**
 * PlaylistExportControls
 * 
 * A compact, two-state button component for exporting playlist data.
 * 
 * States:
 * 1. Default: Shows CSV Download icon. Clicking exports CSV and switches to State 2.
 * 2. Active: Shows Zip/Image Download icon. Clicking downloads covers. 
 *    Reverts to State 1 after 5 seconds of inactivity.
 */
export const PlaylistExportControls: React.FC<PlaylistExportControlsProps> = ({
    videos,
    playlistName
}) => {
    const { showToast } = useUIStore();

    // State for the two-stage button interaction
    const [showImageDownload, setShowImageDownload] = useState(false);
    const imageDownloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Loading state for zip generation
    const [isProcessing, setIsProcessing] = useState(false);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (imageDownloadTimerRef.current) {
                clearTimeout(imageDownloadTimerRef.current);
            }
        };
    }, []);

    const handleExportCsv = (e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            const csvContent = exportPlaylistCsv({
                videos,
                playlistName
            });

            const filename = generatePlaylistExportFilename(playlistName);
            downloadCsv(csvContent, filename);

            showToast(`${videos.length} videos exported to CSV`, 'success');

            // Switch to Image Download mode
            setShowImageDownload(true);

            // Set timer to revert back to CSV mode
            if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);
            imageDownloadTimerRef.current = setTimeout(() => setShowImageDownload(false), 5000);

        } catch (error) {
            console.error('CSV Export failed:', error);
            showToast('Failed to export CSV', 'error');
        }
    };

    const handleExportImages = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const images = videos.map(v => ({
            id: v.id,
            url: v.customImage || v.thumbnail
        })).filter(img => img.url);

        if (images.length === 0) {
            showToast('No covers found to download', 'error');
            return;
        }

        setIsProcessing(true);
        // Clear timer so it doesn't flip back while processing
        if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);

        try {
            const baseFilename = generatePlaylistExportFilename(playlistName).replace('.csv', '');
            const zipFilename = `${baseFilename}_covers.zip`;

            await downloadImagesAsZip(images, zipFilename);
            showToast('Covers downloaded successfully', 'success');

            // After successful download, flip back to CSV mode
            setShowImageDownload(false);
        } catch (error) {
            console.error('Image export failed:', error);
            showToast('Failed to download covers', 'error');
            // Resume timer or just leave it open? Let's leave it open so they can retry
            imageDownloadTimerRef.current = setTimeout(() => setShowImageDownload(false), 5000);
        } finally {
            setIsProcessing(false);
        }
    };

    if (videos.length === 0) {
        return null;
    }

    return (
        <div className="relative group">
            <button
                onClick={(e) => {
                    if (isProcessing) return;

                    if (showImageDownload) {
                        handleExportImages(e);
                    } else {
                        handleExportCsv(e);
                    }
                }}
                disabled={isProcessing}
                className={`
                    relative flex items-center justify-center w-[34px] h-[34px] rounded-full 
                    transition-all duration-300 ease-out border-none cursor-pointer outline-none
                    ${showImageDownload
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 scale-105'
                        : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-hover-bg'
                    }
                    ${isProcessing ? 'opacity-75 cursor-wait' : ''}
                `}
                title={showImageDownload ? "Download All Covers (ZIP)" : "Export to CSV"}
            >
                {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <div className="relative w-4 h-4 flex items-center justify-center">
                        <Download
                            size={16}
                            className={`absolute transition-all duration-300 transform
                                ${showImageDownload
                                    ? 'opacity-0 scale-75 rotate-12'
                                    : 'opacity-100 scale-100 rotate-0'
                                }
                            `}
                        />

                        <ImageIcon
                            size={16}
                            strokeWidth={2.5}
                            className={`absolute transition-all duration-300 transform
                                ${showImageDownload
                                    ? 'opacity-100 scale-100 rotate-0 text-white'
                                    : 'opacity-0 scale-75 -rotate-12'
                                }
                            `}
                        />
                    </div>
                )}
            </button>
        </div>
    );
};
