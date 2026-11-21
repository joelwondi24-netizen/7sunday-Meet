import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  details?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let parsedMessage = error.message;
    let details: string | undefined;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error && parsed.operationType) {
        parsedMessage = `Database ${parsed.operationType} error on ${parsed.path || 'collection'}: ${parsed.error}`;
        details = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // standard error
    }

    return {
      hasError: true,
      message: parsedMessage || 'An unexpected application error occurred.',
      details,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">7Sunday Meet Error Recovery</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">A runtime exception was safely caught</p>
              </div>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              {this.state.message}
            </p>

            {this.state.details && (
              <details className="text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer font-medium hover:text-slate-700 dark:hover:text-slate-200">
                  Diagnostic Context
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-200 overflow-x-auto font-mono text-[11px]">
                  {this.state.details}
                </pre>
              </details>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
