import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
      this.setState({ hasError: false, error: null });
      // Optional: Clear specific local storage if needed to reset bad state
      // localStorage.removeItem('activeTool'); 
      window.location.href = '/'; 
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center bg-surface dark:bg-[#121212] rounded-xl border border-border-color dark:border-gray-700 m-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h2 className="text-xl font-bold text-text-primary dark:text-white mb-2">Đã xảy ra sự cố hiển thị</h2>
            <p className="text-text-secondary dark:text-gray-400 mb-6 max-w-md">
                Ứng dụng gặp lỗi trong quá trình xử lý hình ảnh hoặc hiển thị. Dữ liệu của bạn vẫn an toàn.
            </p>
            <div className="flex gap-4">
                <button 
                    onClick={this.handleReset}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-text-primary dark:text-white rounded-lg font-medium transition-colors"
                >
                    Về trang chủ
                </button>
                <button 
                    onClick={this.handleReload}
                    className="px-4 py-2 bg-[#7f13ec] hover:bg-[#690fca] text-white rounded-lg font-medium transition-colors shadow-lg shadow-purple-500/20"
                >
                    Tải lại trang
                </button>
            </div>
            {this.state.error && (
                <details className="mt-8 text-left w-full max-w-lg p-4 bg-gray-100 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-800">
                    <summary className="text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer mb-2">Chi tiết lỗi kỹ thuật (Dành cho Dev)</summary>
                    <pre className="text-[10px] text-red-500 overflow-x-auto whitespace-pre-wrap font-mono">
                        {this.state.error.toString()}
                    </pre>
                </details>
            )}
        </div>
      );
    }

    return this.props.children;
  }
}