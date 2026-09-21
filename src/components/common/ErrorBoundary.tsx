import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AutoFlow ErrorBoundary] Uncaught UI error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-2 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex flex-col gap-2">
          <div className="flex items-center gap-2 text-rose-400 font-semibold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{this.props.fallbackTitle || 'Component Encountered an Issue'}</span>
          </div>
          <p className="text-[11px] text-rose-300/80 font-mono break-all">
            {this.state.error?.message || 'An unknown render error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="self-start mt-1 flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-white text-[11px] font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Dismiss & Recover</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
