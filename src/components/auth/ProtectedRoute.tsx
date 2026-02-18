import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../core/hooks/useAuth';

/** Dismisses the HTML app-loader overlay from index.html */
function dismissAppLoader() {
    const el = document.getElementById('app-loader');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 150);
}

/**
 * Wrapper that dismisses the app-loader on mount.
 * Because Suspense prevents useEffect from firing until all lazy
 * children have loaded, this runs at exactly the right moment.
 */
const AppLoaded: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useEffect(() => { dismissAppLoader(); }, []);
    return <>{children}</>;
};

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading } = useAuth();

    // While auth is resolving, render nothing — the HTML app-loader overlay is still visible
    if (isLoading) return null;

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <AppLoaded>{children}</AppLoaded>;
};
