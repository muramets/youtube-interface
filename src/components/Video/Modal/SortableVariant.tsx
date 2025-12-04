
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';

interface SortableVariantProps {
    id: string;
    url: string;
    index: number;
    onRemove: () => void;
}

export const SortableVariant = ({ id, url, index, onRemove }: SortableVariantProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="aspect-video rounded-md overflow-hidden border border-border relative group touch-none"
        >
            <img src={url} alt={`Variant ${index + 1}`} className="w-full h-full object-cover" />

            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-1 left-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:bg-black/60 transition-opacity"
            >
                <GripVertical size={12} />
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            >
                <X size={10} />
            </button>
            <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[9px] font-medium text-white backdrop-blur-sm">
                {String.fromCharCode(65 + index)}
            </div>
        </div>
    );
};
