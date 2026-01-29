import React from 'react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';

interface TrafficErrorStateProps {
    error: Error;
    onRetry?: () => void;
}

/**
 * BUSINESS LOGIC: Error Display Component
 * 
 * Displays user-friendly error messages based on the error type.
 * Provides a Retry action if the operation is recoverable.
 * 
 * Used when:
 * - Network requests fail (offline, timeout)
 * - Snapshot data parsing fails (corrupted CSV)
 * - Storage loading fails (missing files)
 */
export const TrafficErrorState: React.FC<TrafficErrorStateProps> = ({ error, onRetry }) => {
    /**
     * Maps technical error messages to user-friendly text.
     */
    const getErrorMessage = (error: Error): string => {
        const msg = error.message.toLowerCase();

        if (msg.includes('storage') || msg.includes('network') || msg.includes('fetch')) {
            return 'Failed to load traffic data from encryption. Please check your connection and try again.';
        }
        if (msg.includes('parse') || msg.includes('csv') || msg.includes('format')) {
            return 'Failed to parse traffic data. The snapshot file may be corrupted or in an invalid format.';
        }
        if (msg.includes('upload')) {
            return 'Failed to save snapshot. Please try again.';
        }

        return 'An unexpected error occurred while loading traffic data.';
    };

    return (
        <div className="w-full h-full flex items-center justify-center py-16">
            <div className="text-center max-w-md p-6 rounded-lg bg-bg-secondary/30">
                <div className="mb-4">
                    <svg className="w-12 h-12 mx-auto text-red-500 options-button-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                    Error Loading Data
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed mb-6">
                    {getErrorMessage(error)}
                </p>
                {onRetry && (
                    <Button
                        variant="primary"
                        onClick={onRetry}
                    >
                        Try Again
                    </Button>
                )}
            </div>
        </div>
    );
};
