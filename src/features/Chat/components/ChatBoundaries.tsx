// =============================================================================
// CHAT ERROR BOUNDARY: Catches runtime render errors in Chat components
// Two-level protection: per-message (compact) and list-level (full fallback)
// =============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// --- Compact per-message boundary ---

interface MessageBoundaryProps {
    children: ReactNode;
    messageId?: string;
}

interface ErrorState {
    hasError: boolean;
    error: Error | null;
}

/** Wraps individual messages — inline fallback, doesn't break the list */
export class MessageErrorBoundary extends Component<MessageBoundaryProps, ErrorState> {
    state: ErrorState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[MessageErrorBoundary]', this.props.messageId, error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgba(204,0,0,0.06)] border border-[rgba(204,0,0,0.12)] text-[color:var(--danger-color,#cc0000)] text-xs max-w-[85%]">
                    <AlertTriangle size={14} />
                    <span>Failed to render message</span>
                    <button className="bg-transparent border-none text-text-tertiary cursor-pointer p-0.5 flex ml-auto transition-colors duration-100 hover:text-text-primary" onClick={this.handleRetry}>
                        <RefreshCw size={12} />
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- Full list-level boundary ---

interface ListBoundaryProps {
    children: ReactNode;
}

/** Wraps the entire message list — full fallback with retry */
export class ChatListErrorBoundary extends Component<ListBoundaryProps, ErrorState> {
    state: ErrorState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ChatListErrorBoundary]', error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 px-5 text-text-tertiary text-center">
                    <AlertTriangle size={20} />
                    <p className="m-0 text-[13px] text-text-secondary">Something went wrong displaying messages</p>
                    <p className="m-0 text-[11px] text-text-tertiary max-w-[280px] break-words">{this.state.error?.message}</p>
                    <button onClick={this.handleRetry} className="flex items-center gap-1.5 mt-1 px-3.5 py-1.5 rounded-md border border-border bg-card-bg text-text-primary text-xs cursor-pointer transition-colors duration-100 hover:bg-hover-bg">
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
