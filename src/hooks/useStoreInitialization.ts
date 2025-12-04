import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useSettings } from './useSettings';
import { useAutoSync } from './useAutoSync';

export const useStoreInitialization = () => {
    // Initialize Settings (handles subscriptions)
    const { generalSettings } = useSettings();

    // Initialize Auto Sync
    useAutoSync();

    // 1. Initialize Auth Listener
    const queryClient = useQueryClient();
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            queryClient.setQueryData(['auth_user'], user);
        });
        return () => unsubscribe();
    }, [queryClient]);

    // 4. Apply Theme
    useEffect(() => {
        const applyTheme = () => {
            const theme = generalSettings.theme;
            const isDark = theme === 'dark' || (theme === 'device' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        applyTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (generalSettings.theme === 'device') {
                applyTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [generalSettings.theme]);
};
