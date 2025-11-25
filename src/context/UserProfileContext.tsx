import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserProfileContextType {
    channelName: string;
    avatarDataUrl: string | null;
    updateProfile: (name: string, avatarDataUrl: string | null) => void;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [channelName, setChannelName] = useState<string>(() => {
        return localStorage.getItem('youtube_profile_name') || 'Guest Channel';
    });

    const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(() => {
        return localStorage.getItem('youtube_profile_avatar');
    });

    useEffect(() => {
        localStorage.setItem('youtube_profile_name', channelName);
    }, [channelName]);

    useEffect(() => {
        if (avatarDataUrl) {
            localStorage.setItem('youtube_profile_avatar', avatarDataUrl);
        } else {
            localStorage.removeItem('youtube_profile_avatar');
        }
    }, [avatarDataUrl]);

    const updateProfile = (name: string, avatar: string | null) => {
        setChannelName(name);
        setAvatarDataUrl(avatar);
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
