import { useSettings } from './useSettings';

/**
 * Centralized hook for API key access.
 * 
 * Returns the API key from general settings along with helper properties.
 * This eliminates the need for components to check multiple sources
 * or implement their own fallback logic.
 */
export const useApiKey = () => {
    const { generalSettings } = useSettings();

    const apiKey = generalSettings?.apiKey || '';
    const hasApiKey = !!apiKey;

    return {
        apiKey,
        hasApiKey,
    };
};
