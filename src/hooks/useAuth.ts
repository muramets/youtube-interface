import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';

export const useAuth = () => {
    const queryClient = useQueryClient();
    const queryKey = ['auth_user'];

    const { data: user, isLoading } = useQuery({
        queryKey,
        queryFn: () => {
            return new Promise<User | null>((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    unsubscribe();
                    resolve(user);
                });
            });
        },
        staleTime: Infinity,
        gcTime: Infinity, // Keep user data in cache
    });

    const loginWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Error logging in with Google", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            queryClient.setQueryData(queryKey, null);
        } catch (error) {
            console.error("Error logging out", error);
            throw error;
        }
    };

    return { user: user || null, isLoading, loginWithGoogle, logout };
};
