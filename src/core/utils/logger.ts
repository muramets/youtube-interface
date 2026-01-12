/**
 * Structured Logger Utility
 * 
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Contextual metadata (userId, videoId, version)
 * - Environment-aware formatting (pretty in dev, JSON in prod)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    userId?: string;
    channelId?: string;
    videoId?: string;
    version?: number | 'draft';
    component?: string;
    [key: string]: any;
}

class Logger {
    private isDevelopment = import.meta.env.DEV;

    private log(level: LogLevel, message: string, context?: LogContext) {
        // Skip debug logs in production
        if (level === 'debug' && !this.isDevelopment) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...context
        };

        // In development: pretty print with colors
        if (this.isDevelopment) {
            const colorMap: Record<LogLevel, string> = {
                debug: '\x1b[36m', // Cyan
                info: '\x1b[32m',  // Green
                warn: '\x1b[33m',  // Yellow
                error: '\x1b[31m'  // Red
            };

            const color = colorMap[level];
            const reset = '\x1b[0m';
            const componentTag = context?.component ? `[${context.component}]` : '';

            console.log(`${color}[${level.toUpperCase()}]${reset} ${componentTag} ${message}`, context || '');
        } else {
            // In production: structured JSON for log aggregation
            console.log(JSON.stringify(logEntry));
        }
    }

    debug(message: string, context?: LogContext) {
        this.log('debug', message, context);
    }

    info(message: string, context?: LogContext) {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log('warn', message, context);
    }

    error(message: string, context?: LogContext) {
        this.log('error', message, context);
    }

    /**
     * Create a scoped logger with pre-filled context
     * Useful for components that always log with the same context
     */
    scope(defaultContext: LogContext) {
        return new ScopedLogger(this, defaultContext);
    }
}

/**
 * Scoped Logger - pre-fills context for a specific component/module
 */
class ScopedLogger {
    private logger: Logger;
    private defaultContext: LogContext;

    constructor(logger: Logger, defaultContext: LogContext) {
        this.logger = logger;
        this.defaultContext = defaultContext;
    }

    debug(message: string, additionalContext?: LogContext) {
        this.logger.debug(message, { ...this.defaultContext, ...additionalContext });
    }

    info(message: string, additionalContext?: LogContext) {
        this.logger.info(message, { ...this.defaultContext, ...additionalContext });
    }

    warn(message: string, additionalContext?: LogContext) {
        this.logger.warn(message, { ...this.defaultContext, ...additionalContext });
    }

    error(message: string, additionalContext?: LogContext) {
        this.logger.error(message, { ...this.defaultContext, ...additionalContext });
    }
}

// Export singleton instance
export const logger = new Logger();

// Export types for use in other modules

