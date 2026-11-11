import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Preserve full console error logging for developers
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const isDev = Boolean(import.meta.env?.DEV);

      return (
        <div className="min-h-screen w-full bg-[#F6F7FA] flex items-center justify-center p-4 font-sans text-[#1E2230]">
          <div className="w-full max-w-[620px] rounded-[20px] bg-white border border-[#EEF0F4] p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[#FDE8EF] text-[#D62E5A] flex items-center justify-center font-bold text-[18px]">
                !
              </div>
              <div>
                <h1 className="text-[18px] font-bold text-[#1E2230]">
                  {this.props.fallbackTitle || 'Terjadi Kendala pada Tampilan'}
                </h1>
                <p className="text-[13px] text-[#646B7C] mt-0.5">
                  {this.props.fallbackDescription ||
                    'Komponen mengalami galat saat memuat data. Anda dapat memuat ulang halaman atau kembali ke beranda.'}
                </p>
              </div>
            </div>

            {/* Error detail for developers / troubleshooting */}
            {this.state.error && (
              <div className="rounded-[12px] bg-[#F9FAFC] border border-[#EEF0F4] p-3.5 space-y-2">
                <div className="text-[12px] font-semibold text-[#B4234A] break-words">
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {isDev && this.state.errorInfo?.componentStack && (
                  <details className="text-[11px] text-[#646B7C]">
                    <summary className="cursor-pointer font-medium hover:text-[#1E2230]">
                      Tampilkan stack jejak komponen
                    </summary>
                    <pre className="mt-2 p-2 rounded-[8px] bg-[#1E2230] text-[#E5E7EB] overflow-x-auto text-[10px] leading-relaxed">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#EEF0F4]">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="admin-btn h-9 px-4 text-[13px] font-medium rounded-[10px] border border-[#D9DDE6] text-[#1E2230] bg-white hover:bg-[#F6F7FA] transition-colors"
              >
                Ke Beranda
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="admin-btn h-9 px-4 text-[13px] font-medium rounded-[10px] border border-[#D9DDE6] text-[#1E2230] bg-white hover:bg-[#F6F7FA] transition-colors"
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="admin-btn h-9 px-4 text-[13px] font-semibold rounded-[10px] bg-[#1E2230] text-white hover:bg-[#2B3042] transition-colors shadow-sm"
              >
                Muat Ulang Halaman
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

