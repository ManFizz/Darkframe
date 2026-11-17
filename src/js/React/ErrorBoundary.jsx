import React from 'react';
import {ipcRenderer} from '@/Infrastructure/electron';

// Errors of the window go to the app's log file (server/logger.js).
export function logViewError(source, error, componentStack = '') {
    try {
        ipcRenderer.send('app:logError', {
            source,
            message: String(error?.message ?? error),
            stack: error?.stack ? String(error.stack) : '',
            componentStack: componentStack ? String(componentStack) : '',
        });
    } catch { /* logging must never throw */ }
}

// Errors outside React's render (event handlers, timers, promises) → the log too.
let globalInstalled = false;
export function installGlobalErrorLog() {
    if (globalInstalled) return;
    globalInstalled = true;
    window.addEventListener('error', (e) => logViewError('window', e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => logViewError('promise', e.reason));
}

/**
 * A crash inside one part of the window shows a notice in its place instead of
 * blanking the whole window. "Попробовать снова" re-mounts the part; a change of
 * `resetKey` (another view picked) does the same by itself.
 *
 *   <ErrorBoundary name="Библиотека" resetKey={view}> … </ErrorBoundary>
 *   compact — a small notice, for overlays and side parts.
 */
export default class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error(`[${this.props.name || 'view'}]`, error);
        logViewError(this.props.name || 'view', error, info?.componentStack);
    }

    componentDidUpdate(prev) {
        if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
    }

    reset = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const { name, compact } = this.props;
        return (
            <div className={`df-crash ${compact ? 'df-crash-compact' : ''}`} role="alert">
                <div className="df-crash-title">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                    {name ? `Сбой в разделе «${name}»` : 'Сбой в этой части окна'}
                </div>
                <div className="df-crash-message">{String(error?.message || error)}</div>
                <div className="df-crash-actions">
                    <button type="button" className="btn btn-sm btn-primary" onClick={this.reset}>Попробовать снова</button>
                    {!compact && (
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.location.reload()}>
                            Перезагрузить окно
                        </button>
                    )}
                </div>
                {!compact && error?.stack && (
                    <details className="df-crash-details">
                        <summary>Подробности (записаны в журнал)</summary>
                        <pre>{String(error.stack)}</pre>
                    </details>
                )}
            </div>
        );
    }
}
