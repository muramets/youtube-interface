import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useTrendStore } from '../stores/trends/trendStore';
import { useFilterStore } from '../stores/filterStore';

/**
 * Synchronizes the authenticated user's ID with the application stores.
 * This triggers a reset of sensitive data (filters, configs) in the stores
 * if the user ID mismatches the one currently in the store options.
 */
export const useUserPersistence = () => {
    const { user, isLoading } = useAuth();
    const setTrendUserId = useTrendStore(state => state.setUserId);
    const setFilterUserId = useFilterStore(state => state.setUserId);

    useEffect(() => {
        // Wait until auth is initialized. 
        // If we sync while loading (user=null), we might accidentally 
        // reset the store if it has a valid userId from hydration.
        if (isLoading) return;

        // If user is logged in, sync their ID.
        // If logged out, user.uid is undefined, so we pass null.
        const uid = user ? user.uid : null;

        setTrendUserId(uid);
        setFilterUserId(uid);
    }, [user, isLoading, setTrendUserId, setFilterUserId]);
};
