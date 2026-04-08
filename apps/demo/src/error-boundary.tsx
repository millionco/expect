import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryState {
  error: Error | undefined;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-8">
          <div className="w-full max-w-lg">
            <div className="bg-white border-2 border-red-300 rounded-none p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  !
                </div>
                <h1 className="text-2xl font-extrabold text-red-700">Something went wrong</h1>
              </div>
              <div className="bg-red-100 border border-red-200 rounded-none p-4 mb-4">
                <p className="text-lg font-bold text-red-800 font-mono">
                  {this.state.error.message}
                </p>
              </div>
              <pre className="bg-neutral-900 text-green-400 p-4 rounded-none text-sm overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {this.state.error.stack}
              </pre>
              <button
                onClick={() => this.setState({ error: undefined })}
                className="mt-6 w-full h-12 bg-red-600 text-white font-bold text-base rounded-none hover:bg-red-700 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
