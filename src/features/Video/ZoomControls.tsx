import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useSettings } from '../../core/hooks/useSettings';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

export const ZoomControls: React.FC = () => {
    const { generalSettings, updateGeneralSettings } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const cardsPerRow = generalSettings.cardsPerRow;
    const updateCardsPerRow = (count: number) => {
        if (user && currentChannel) {
            updateGeneralSettings(user.uid, currentChannel.id, { cardsPerRow: count });
        }
    };

    return (
        <div className="absolute bottom-8 right-8 flex flex-row gap-2 z-50">
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
