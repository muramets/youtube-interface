import React, { useState, useRef, useEffect } from 'react';
import { Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useUIStore } from '../../../core/stores/uiStore';
import { downloadImagesAsZip, downloadImageDirect } from '../../../core/utils/zipUtils';
import { exportTrendsVideoCsv, downloadCsv, generateTrendsExportFilename } from '../utils/exportTrendsVideoCsv';
import type { TrendVideo } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trends/trendStore';

interface TrendsExportControlsProps {
    videos: TrendVideo[];
    channelTitle: string;
    disabled?: boolean;
}

/**
 * TrendsExportControls
 * 
 * A compact, two-state button component for exporting filtered trends data.
 * Identical behavior to PlaylistExportControls but tailored for TrendVideo data.
 */
export const TrendsExportControls: React.FC<TrendsExportControlsProps> = ({
    videos,
    channelTitle,
    disabled = false
}) => {
    const { showToast } = useUIStore();
    const { niches, videoNicheAssignments } = useTrendStore();

    // State for the two-stage button interaction
    const [showImageDownload, setShowImageDownload] = useState(false);
    const imageDownloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);

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
            const csvContent = exportTrendsVideoCsv({
                videos,
                niches,
                videoNicheAssignments,
                channelName: channelTitle
            });

            const filename = generateTrendsExportFilename(videos.length, channelTitle);
            downloadCsv(csvContent, filename);

            showToast(`${videos.length} videos exported to CSV`, 'success');

            // Switch to Image Download mode
            setShowImageDownload(true);

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
            url: v.thumbnail
        })).filter(img => img.url);

        if (images.length === 0) {
            showToast('No covers found to download', 'error');
            return;
        }

        setIsProcessing(true);
        if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);

        try {
            if (images.length === 1) {
                // Direct download for single image
                await downloadImageDirect(images[0]);
                showToast('Cover downloaded successfully', 'success');
            } else {
                // ZIP for multiple images
                const baseFilename = generateTrendsExportFilename(videos.length, channelTitle).replace('.csv', '');
                const zipFilename = `${baseFilename}_covers.zip`;
                await downloadImagesAsZip(images, zipFilename);
                showToast('Covers downloaded successfully', 'success');
            }
            setShowImageDownload(false);
        } catch (error) {
            console.error('Image export failed:', error);
            showToast('Failed to download covers', 'error');
            imageDownloadTimerRef.current = setTimeout(() => setShowImageDownload(false), 5000);
        } finally {
            setIsProcessing(false);
        }
    };

    if (videos.length === 0) {
        return (
            <button
                disabled
                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center border-none bg-transparent text-text-tertiary cursor-not-allowed"
            >
                <Download size={18} />
            </button>
        );
    }

    return (
        <div className="relative group">
            <button
                onClick={(e) => {
                    if (isProcessing || disabled) return;

                    if (showImageDownload) {
                        handleExportImages(e);
                    } else {
                        handleExportCsv(e);
                    }
                }}
                disabled={isProcessing || disabled}
                className={`
                    w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-all duration-300 ease-out border-none cursor-pointer relative
                    ${showImageDownload
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500' // Using square-ish rounded style to match header buttons
                        : 'bg-transparent text-text-primary hover:bg-hover-bg'
                    }
                    ${(isProcessing || disabled) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={showImageDownload ? "Download All Covers (ZIP)" : "Export filtered videos to CSV"}
            >
                {isProcessing ? (
                    <Loader2 size={18} className="animate-spin" />
                ) : (
                    <div className="relative w-[18px] h-[18px] flex items-center justify-center">
                        <Download
                            size={18}
                            className={`absolute transition-all duration-300 transform
                                ${showImageDownload
                                    ? 'opacity-0 scale-75 rotate-12'
                                    : 'opacity-100 scale-100 rotate-0'
                                }
                            `}
                        />

                        <ImageIcon
                            size={18}
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
