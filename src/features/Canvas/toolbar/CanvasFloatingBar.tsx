import React from 'react';
import { Trash2, AlignStartHorizontal, AlignCenterHorizontal, BringToFront, SendToBack } from 'lucide-react';
import { FloatingBar } from '../../../components/ui/organisms/FloatingBar';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useShallow } from 'zustand/react/shallow';

export const CanvasFloatingBar: React.FC = () => {
    const {
        selectedNodeIds,
        clearSelection,
        deleteNodes,
        alignNodesTop,
        alignNodesCenterY,
        bringNodesToFront,
        sendNodesToBack,
    } = useCanvasStore(
        useShallow((s) => ({
            selectedNodeIds: s.selectedNodeIds,
            clearSelection: s.clearSelection,
            deleteNodes: s.deleteNodes,
            alignNodesTop: s.alignNodesTop,
            alignNodesCenterY: s.alignNodesCenterY,
            bringNodesToFront: s.bringNodesToFront,
            sendNodesToBack: s.sendNodesToBack,
        }))
    );

    if (selectedNodeIds.size < 1) return null;

    const ids = Array.from(selectedNodeIds);
    const isMulti = ids.length > 1;
    const label = isMulti ? `${ids.length} selected` : '1 selected';

    return (
        <FloatingBar
            title={label}
            position={{ x: 0, y: 0 }}
            onClose={clearSelection}
            isDocked
            dockingStrategy="fixed"
            className="!z-[9999]"
        >
            {() => (
                <>
                    {/* Bring to front */}
                    <button
                        onClick={() => bringNodesToFront(ids)}
                        className="p-2 hover:bg-white/10 rounded-full text-text-primary hover:text-white transition-colors border-none cursor-pointer flex items-center justify-center"
                        title="Bring to front"
                    >
                        <BringToFront size={20} />
                    </button>

                    {/* Send to back */}
                    <button
                        onClick={() => sendNodesToBack(ids)}
                        className="p-2 hover:bg-white/10 rounded-full text-text-primary hover:text-white transition-colors border-none cursor-pointer flex items-center justify-center"
                        title="Send to back"
                    >
                        <SendToBack size={20} />
                    </button>

                    {/* Align top — only meaningful for 2+ nodes */}
                    {isMulti && (
                        <button
                            onClick={() => alignNodesTop(ids)}
                            className="p-2 hover:bg-white/10 rounded-full text-text-primary hover:text-white transition-colors border-none cursor-pointer flex items-center justify-center"
                            title="Align top edges"
                        >
                            <AlignStartHorizontal size={20} />
                        </button>
                    )}

                    {/* Align vertical centers — only meaningful for 2+ nodes */}
                    {isMulti && (
                        <button
                            onClick={() => alignNodesCenterY(ids)}
                            className="p-2 hover:bg-white/10 rounded-full text-text-primary hover:text-white transition-colors border-none cursor-pointer flex items-center justify-center"
                            title="Align vertical centers"
                        >
                            <AlignCenterHorizontal size={20} />
                        </button>
                    )}

                    {/* Delete */}
                    <button
                        onClick={() => deleteNodes(ids)}
                        className="p-2 hover:bg-white/10 rounded-full text-red-400 hover:text-red-300 transition-colors border-none cursor-pointer flex items-center justify-center"
                        title="Remove from canvas"
                    >
                        <Trash2 size={20} />
                    </button>
                </>
            )}
        </FloatingBar>
    );
};
