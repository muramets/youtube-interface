import { create } from 'zustand';
import { ChannelService, type Channel } from '../services/channelService';

interface ChannelState {
    channels: Channel[];
    currentChannel: Channel | null;
    loading: boolean;

    // Actions
    setChannels: (channels: Channel[]) => void;
    setCurrentChannel: (channel: Channel | null) => void;
    setLoading: (loading: boolean) => void;
    subscribeToChannels: (userId: string) => () => void;
    addChannel: (userId: string, name: string, avatarUrl?: string) => Promise<Channel>;
    updateChannel: (userId: string, channelId: string, updates: Partial<Channel>) => Promise<void>;
    removeChannel: (userId: string, channelId: string) => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
    channels: [],
    currentChannel: null,
    loading: true,

    setChannels: (channels) => set({ channels }),
    setCurrentChannel: (channel) => set({ currentChannel: channel }),
    setLoading: (loading) => set({ loading }),

    subscribeToChannels: (userId) => {
        set({ loading: true });
        return ChannelService.subscribeToChannels(userId, (channels: Channel[]) => {
            set({ channels, loading: false });
            // If no current channel is selected, or the selected one is gone, select the first one
            const { currentChannel } = get();
            if (channels.length > 0) {
                if (!currentChannel || !channels.find(c => c.id === currentChannel.id)) {
                    set({ currentChannel: channels[0] });
                } else {
                    // Update current channel object with latest data
                    const updatedCurrent = channels.find(c => c.id === currentChannel.id);
                    if (updatedCurrent) {
                        set({ currentChannel: updatedCurrent });
                    }
                }
            } else {
                set({ currentChannel: null });
            }
        });
    },

    addChannel: async (userId, name, avatarUrl) => {
        const handle = `@${name.replace(/\s+/g, '').toLowerCase()}${Math.floor(Math.random() * 1000)}`;
        return await ChannelService.createChannel(userId, { name, handle, avatarUrl });
    },

    updateChannel: async (userId, channelId, updates) => {
        await ChannelService.updateChannel(userId, channelId, updates);
    },

    removeChannel: async (userId, channelId) => {
        await ChannelService.deleteChannel(userId, channelId);
    }
}));
