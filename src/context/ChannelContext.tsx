import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import {
    collection,
    doc,
    setDoc,
    onSnapshot
} from 'firebase/firestore';

export interface Channel {
    id: string;
    name: string;
    avatar?: string;
    createdAt: number;
}

interface ChannelContextType {
    channels: Channel[];
    currentChannel: Channel | null;
    loading: boolean;
    createChannel: (name: string, avatar?: string) => Promise<void>;
    updateChannel: (channelId: string, updates: Partial<Channel>) => Promise<void>;
    switchChannel: (channelId: string) => void;
    deleteChannel: (channelId: string) => Promise<void>;
}

const ChannelContext = createContext<ChannelContextType | undefined>(undefined);

export const ChannelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [channels, setChannels] = useState<Channel[]>([]);
    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const [loading, setLoading] = useState(true);

    // Load channels when user logs in
    useEffect(() => {
        if (!user) {
            setChannels([]);
            setCurrentChannel(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const channelsRef = collection(db, `users/${user.uid}/channels`);

        const unsubscribe = onSnapshot(channelsRef, (snapshot) => {
            const loadedChannels: Channel[] = [];
            snapshot.forEach((doc) => {
                loadedChannels.push({ id: doc.id, ...doc.data() } as Channel);
            });

            loadedChannels.sort((a, b) => a.createdAt - b.createdAt);

            // Deduplicate by name (keep the oldest one) - REMOVED to show all channels
            // const uniqueChannels = loadedChannels.reduce((acc, current) => {
            //     const x = acc.find(item => item.name === current.name);
            //     if (!x) {
            //         return acc.concat([current]);
            //     } else {
            //         return acc;
            //     }
            // }, [] as Channel[]);

            const uniqueChannels = loadedChannels;
            setChannels(uniqueChannels);

            if (uniqueChannels.length > 0) {
                // Auto-select the first channel or restore from local storage
                setCurrentChannel(prev => {
                    const existing = loadedChannels.find(c => c.id === prev?.id);
                    if (prev && existing) {
                        return existing;
                    }
                    const savedChannelId = localStorage.getItem(`last_channel_${user.uid}`);
                    const savedChannelName = localStorage.getItem(`last_channel_name_${user.uid}`);

                    const savedChannelById = loadedChannels.find(c => c.id === savedChannelId);
                    const savedChannelByName = loadedChannels.find(c => c.name === savedChannelName);

                    return savedChannelById || savedChannelByName || loadedChannels[0];
                });
            } else {
                setCurrentChannel(null);
                // Auto-create default channel if none exists
                const defaultName = user.displayName || 'My Channel';
                const newChannelRef = doc(collection(db, `users/${user.uid}/channels`));
                const newChannel: Channel = {
                    id: newChannelRef.id,
                    name: defaultName,
                    avatar: user.photoURL || undefined,
                    createdAt: Date.now()
                };
                setDoc(newChannelRef, newChannel);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);


    // Persist current channel selection
    useEffect(() => {
        if (user && currentChannel) {
            localStorage.setItem(`last_channel_${user.uid}`, currentChannel.id);
            localStorage.setItem(`last_channel_name_${user.uid}`, currentChannel.name);
        }
    }, [user, currentChannel]);

    const createChannel = async (name: string, avatar?: string) => {
        if (!user) return;

        // Check for duplicates before creating
        const existing = channels.find(c => c.name === name);
        if (existing) {
            // If it exists, just switch to it (or do nothing if we want to be strict)
            // For now, let's just switch to it to avoid error, or return.
            setCurrentChannel(existing);
            return;
        }

        const newChannelRef = doc(collection(db, `users/${user.uid}/channels`));
        const newChannel: Channel = {
            id: newChannelRef.id,
            name,
            avatar: avatar || user.photoURL || undefined,
            createdAt: Date.now()
        };

        await setDoc(newChannelRef, newChannel);
        setCurrentChannel(newChannel);
    };

    const updateChannel = async (channelId: string, updates: Partial<Channel>) => {
        if (!user) return;

        const channelRef = doc(db, `users/${user.uid}/channels/${channelId}`);
        await setDoc(channelRef, updates, { merge: true });

        // Update local state if the updated channel is the current one
        if (currentChannel && currentChannel.id === channelId) {
            setCurrentChannel(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const switchChannel = (channelId: string) => {
        const channel = channels.find(c => c.id === channelId);
        if (channel) {
            setCurrentChannel(channel);
        }
    };

    const deleteChannel = async (channelId: string) => {
        if (!user) return;

        const { deleteDoc, getDocs } = await import('firebase/firestore');

        // 1. Delete Subcollections (Videos, Playlists, Settings)
        // Note: Firestore does not support recursive delete on client SDK easily.
        // We must fetch and delete docs in subcollections.

        const subcollections = ['videos', 'playlists', 'settings'];

        for (const sub of subcollections) {
            const subRef = collection(db, `users/${user.uid}/channels/${channelId}/${sub}`);
            const snapshot = await getDocs(subRef);
            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
        }

        // 2. Delete Channel Document
        const channelRef = doc(db, `users/${user.uid}/channels/${channelId}`);
        await deleteDoc(channelRef);

        // 3. Update State (Switch to another channel if current was deleted)
        if (currentChannel?.id === channelId) {
            const remaining = channels.filter(c => c.id !== channelId);
            if (remaining.length > 0) {
                setCurrentChannel(remaining[0]);
            } else {
                setCurrentChannel(null);
                // Ideally create a default one if all are gone, but useEffect will handle that
            }
        }
    };

    return (
        <ChannelContext.Provider value={{
            channels,
            currentChannel,
            loading,
            createChannel,
            updateChannel,
            switchChannel,
            deleteChannel
        }}>
            {children}
        </ChannelContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChannel = () => {
    const context = useContext(ChannelContext);
    if (context === undefined) {
        throw new Error('useChannel must be used within a ChannelProvider');
    }
    return context;
};
