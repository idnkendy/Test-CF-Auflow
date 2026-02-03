
import React from 'react';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary class component to catch rendering errors in its child component tree.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare state property for consistent inheritance recognition in TypeScript
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Standard initialization via class property above, but super(props) ensures base properties are set
  }

  /**
   * Static method to update state when an error occurs during rendering.
   */
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method to catch errors in child components.
   */
  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
      // Reset error state and clear potentially broken navigation state
      this.setState({ hasError: false, error: null });
      localStorage.removeItem('activeTool'); 
      window.location.href = '/'; 
  }

  public override render() {
    // Correctly accessing state from the base component
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center bg-surface dark:bg-[#121212] rounded-xl border border-border-color dark:border-gray-700 m-4 shadow-lg">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            
            <h2 className="text-xl font-bold text-text-primary dark:text-white mb-2">Đã xảy ra sự cố</h2>
            
            {/* Safe check for error object before rendering its properties */}
            {this.state.error && (
                <p className="text-red-500 font-medium text-sm mb-2 max-w-md break-words px-4">
                    {this.state.error.message || this.state.error.toString()}
                </p>
            )}

            <p className="text-text-secondary dark:text-gray-400 mb-6 max-w-md text-sm">
                Ứng dụng gặp lỗi trong quá trình xử lý. Dữ liệu của bạn vẫn an toàn. Hãy thử tải lại trang.
            </p>
            
            <div className="flex gap-4">
                <button 
                    onClick={this.handleReset}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-text-primary dark:text-white rounded-lg font-medium transition-colors text-sm"
                >
                    Về trang chủ
                </button>
                <button 
                    onClick={this.handleReload}
                    className="px-4 py-2 bg-[#7f13ec] hover:bg-[#690fca] text-white rounded-lg font-medium transition-colors shadow-lg shadow-purple-500/20 text-sm"
                >
                    Tải lại trang
                </button>
            </div>
        </div>
      );
    }

    // Correctly accessing props from the base component
    return this.props.children || null;
  }
}
