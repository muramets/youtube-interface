import { create } from 'zustand';
import { ChannelService, type Channel } from '../services/channelService';

interface ChannelState {
    currentChannel: Channel | null;

    // Actions
    setCurrentChannel: (channel: Channel | null) => void;
    addChannel: (userId: string, name: string, avatarUrl?: string) => Promise<Channel>;
    updateChannel: (userId: string, channelId: string, updates: Partial<Channel>) => Promise<void>;
    removeChannel: (userId: string, channelId: string) => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set) => ({
    currentChannel: null,

    setCurrentChannel: (channel) => set({ currentChannel: channel }),

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
