import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useVideo } from '../../context/VideoContext';

export const ZoomControls: React.FC = () => {
    const { cardsPerRow, updateCardsPerRow } = useVideo();

    return (
        <div className="fixed bottom-8 right-8 flex flex-row gap-2 z-50">
            <button
                className="w-12 h-12 rounded-full bg-bg-secondary hover:bg-hover-bg text-text-primary shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => updateCardsPerRow(cardsPerRow + 1)}
                disabled={cardsPerRow >= 9}
                title="Zoom Out (More Columns)"
            >
                <Minus size={24} />
            </button>
            <button
                className="w-12 h-12 rounded-full bg-bg-secondary hover:bg-hover-bg text-text-primary shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => updateCardsPerRow(cardsPerRow - 1)}
                disabled={cardsPerRow <= 3}
                title="Zoom In (Fewer Columns)"
            >
                <Plus size={24} />
            </button>
        </div>
    );
};
