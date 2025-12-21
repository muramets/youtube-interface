import { useEffect, useRef } from 'react';
import { useChannelStore } from '../stores/channelStore';
import { useFilterStore } from '../stores/filterStore';

export const useFilterChannelSync = () => {
    const { currentChannel } = useChannelStore();
    const switchChannel = useFilterStore((state) => state.switchChannel);
    const setSelectedChannel = useFilterStore((state) => state.setSelectedChannel);
    const hasInitializedRef = useRef(false);

    useEffect(() => {
        const currentId = currentChannel?.id || null;

        // Skip null on initial mount - channel is still loading
        // Only call switchChannel once we have a real channel ID
        if (currentId === null && !hasInitializedRef.current) {
            return;
        }

        // Now we have a real channel, mark as initialized
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            // On first real channel load, reset legacy filter and sync channel
            setSelectedChannel(null); // Force reset legacy filter
            switchChannel(currentId);
            return;
        }

        // Subsequent channel changes
        switchChannel(currentId);
    }, [currentChannel?.id, switchChannel, setSelectedChannel]);
};
