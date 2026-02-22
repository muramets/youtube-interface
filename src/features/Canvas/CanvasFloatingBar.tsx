import React from 'react';
import { Trash2, AlignStartHorizontal } from 'lucide-react';
import { FloatingBar } from '../../components/ui/organisms/FloatingBar';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';

export const CanvasFloatingBar: React.FC = () => {
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const clearSelection = useCanvasStore((s) => s.clearSelection);
    const deleteNodes = useCanvasStore((s) => s.deleteNodes);
    const alignNodesTop = useCanvasStore((s) => s.alignNodesTop);

    if (selectedNodeIds.size < 2) return null;

    return (
        <FloatingBar
            title={`${selectedNodeIds.size} selected`}
            position={{ x: 0, y: 0 }}
            onClose={clearSelection}
            isDocked
            dockingStrategy="fixed"
            className="!z-[9999]"
        >
            {() => (
                <>
                    <button
                        onClick={() => alignNodesTop(Array.from(selectedNodeIds))}
                        className="p-2 hover:bg-white/10 rounded-full text-text-primary hover:text-white transition-colors border-none cursor-pointer flex items-center justify-center"
                        title="Align top edges"
                    >
                        <AlignStartHorizontal size={20} />
                    </button>
                    <button
                        onClick={() => deleteNodes(Array.from(selectedNodeIds))}
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
