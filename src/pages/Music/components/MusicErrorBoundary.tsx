// =============================================================================
// MUSIC ERROR BOUNDARY: Catches runtime errors in Music page components
// =============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class MusicErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[MusicErrorBoundary]', error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                        <AlertTriangle size={24} className="text-red-400" />
                    </div>
                    <h3 className="text-base font-medium text-text-primary mb-1">
                        {this.props.fallbackMessage || 'Something went wrong'}
                    </h3>
                    <p className="text-sm text-text-secondary mb-4 max-w-xs">
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white/[0.06] text-text-primary hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
