// =============================================================================
// CANVAS: ImageNode — displays a pasted screenshot/image on the canvas.
// Shows a shimmer placeholder while the image is uploading, then renders
// the image with rounded corners. Preserves aspect ratio on load.
// =============================================================================

import React, { useState, useCallback } from 'react';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import type { ImageNodeData } from '../../core/types/canvas';

interface ImageNodeProps {
    data: ImageNodeData;
    nodeId: string;
}

const ImageNodeInner: React.FC<ImageNodeProps> = ({ data, nodeId }) => {
    // Check browser cache synchronously on mount — avoids 1-frame opacity flash
    // when transitioning from medium LOD (image already rendered & cached).
    const [isLoaded, setIsLoaded] = useState(() => {
        if (!data.downloadUrl) return false;
        const img = new Image();
        img.src = data.downloadUrl;
        return img.complete;
    });
    const resizeNode = useCanvasStore((s) => s.resizeNode);

    const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        setIsLoaded(true);
        // Auto-size node to preserve aspect ratio based on natural dimensions
        const img = e.currentTarget;
        const { naturalWidth, naturalHeight } = img;
        if (naturalWidth > 0 && naturalHeight > 0) {
            const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
            const currentW = node?.size?.w ?? 400;
            const aspectH = Math.round(currentW * (naturalHeight / naturalWidth));
            resizeNode(nodeId, currentW, aspectH);
        }
    }, [nodeId, resizeNode]);

    const isUploading = !data.downloadUrl;

    return (
        <div
            style={{
                width: '100%',
                minHeight: isLoaded ? undefined : 200,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                position: 'relative',
            }}
        >
            {/* Shimmer while uploading or loading */}
            {(!isLoaded || isUploading) && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 8,
                        background: 'var(--bg-tertiary, #2a2a2e)',
                    }}
                >
                    <span className="shimmer-overlay" style={{ borderRadius: 8 }} />
                </div>
            )}

            {/* Image: hidden until loaded */}
            {data.downloadUrl && (
                <img
                    src={data.downloadUrl}
                    alt={data.alt ?? 'Pasted image'}
                    onLoad={handleLoad}
                    draggable={false}
                    style={{
                        display: 'block',
                        width: '100%',
                        height: 'auto',
                        borderRadius: 8,
                        opacity: isLoaded ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        userSelect: 'none',
                    }}
                />
            )}
        </div>
    );
};

export const ImageNode = React.memo(ImageNodeInner);
ImageNode.displayName = 'ImageNode';
