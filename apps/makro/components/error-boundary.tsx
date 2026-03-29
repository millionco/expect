"use client";

import { Component } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Bilinmeyen hata",
    };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="makro-surface rounded-[1.5rem] p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {this.props.label ?? "Bölüm"}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">Bu bölüm yüklenemedi</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {this.state.errorMessage}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
