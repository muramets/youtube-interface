import React, { createContext, useContext } from 'react';
import { useChannel } from './ChannelContext';

interface UserProfileContextType {
    channelName: string;
    avatarDataUrl: string | null;
    updateProfile: (name: string, avatarDataUrl: string | null) => void;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentChannel, updateChannel } = useChannel();

    const channelName = currentChannel?.name || 'Guest Channel';
    const avatarDataUrl = currentChannel?.avatar || null;

    const updateProfile = (name: string, avatar: string | null) => {
        if (currentChannel) {
            updateChannel(currentChannel.id, {
                name,
                avatar: avatar || undefined
            });
        }
    };

    return (
        <UserProfileContext.Provider value={{ channelName, avatarDataUrl, updateProfile }}>
            {children}
        </UserProfileContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUserProfile = () => {
    const context = useContext(UserProfileContext);
    if (context === undefined) {
        throw new Error('useUserProfile must be used within a UserProfileProvider');
    }
    return context;
};
