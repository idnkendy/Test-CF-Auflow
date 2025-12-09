
import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import Spinner from '../Spinner';
import { Logo } from '../common/Logo';

interface AuthPageProps {
  onGoHome: () => void;
  initialMode?: 'login' | 'signup';
}

const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M43.611 20.083H42V20H24V28H35.303C33.674 32.69 29.232 36 24 36C17.373 36 12 30.627 12 24C12 17.373 17.373 12 24 12C27.128 12 29.938 13.189 32.126 15.01L38.288 8.848C34.692 5.652 29.692 3.5 24 3.5C13.438 3.5 5 12.062 5 24C5 35.938 13.438 44.5 24 44.5C34.563 44.5 43.156 35.938 43.156 24C43.156 22.693 43.438 21.365 43.611 20.083Z" fill="#FFC107"/>
        <path d="M6.306 14.691L12.422 19.119C14.34 14.863 18.784 12 24 12C27.128 12 29.938 13.189 32.126 15.01L38.288 8.848C34.692 5.652 29.692 3.5 24 3.5C17.437 3.5 11.562 7.062 7.562 12.25L6.306 14.691Z" fill="#FF3D00"/>
        <path d="M24 44.5C29.438 44.5 34.219 42.125 37.938 38.375L32.25 33.5C30.219 35.125 27.25 36 24 36C18.784 36 14.34 33.137 12.422 28.881L6.306 33.309C10.125 39.938 16.562 44.5 24 44.5Z" fill="#4CAF50"/>
        <path d="M43.611 20.083H42V20H24V28H35.303C34.51 30.228 33.061 32.094 31.232 33.344L37.495 39.608C42.125 35.031 44.5 28.625 44.5 21.5C44.5 20.5 44.344 19.5 44.156 18.531L43.611 20.083Z" fill="#1976D2"/>
    </svg>
);

const AuthPage: React.FC<AuthPageProps> = ({ onGoHome, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
      setMode(initialMode);
  }, [initialMode]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) {
        setError(error.message);
        setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !password) {
          setError("Vui lòng nhập đầy đủ Email và Mật khẩu.");
          return;
      }
      
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
          if (mode === 'signup') {
              const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                      emailRedirectTo: window.location.origin
                  }
              });
              
              if (error) throw error;
              
              // Check if confirm email is required
              if (data.user && !data.session) {
                  setSuccessMessage("Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập.");
              } else if (data.user && data.session) {
                  // User signed up and logged in automatically (if confirm not enabled)
                  // Redirect handled by App.tsx listener
              }
          } else {
              const { error } = await supabase.auth.signInWithPassword({
                  email,
                  password
              });
              if (error) throw error;
              // Redirect handled by App.tsx listener
          }
      } catch (err: any) {
          setError(err.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-main-bg dark:bg-gray-900 flex flex-col items-center justify-center p-4 relative font-sans">
        <button onClick={onGoHome} className="absolute top-4 left-4 text-text-secondary dark:text-gray-400 hover:text-accent transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            Quay lại trang chủ
        </button>
        <div className="w-full max-w-md">
            <div className="flex justify-center items-center mb-6">
                 <Logo className="w-16 h-16 mr-2" />
                <span className="text-text-primary dark:text-white text-3xl font-bold">OPZEN AI</span>
            </div>
            
            <div className="bg-surface dark:bg-dark-bg p-8 rounded-2xl shadow-xl border border-border-color dark:border-gray-700">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-text-primary dark:text-white mb-2">
                        {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
                    </h2>
                    <p className="text-text-secondary dark:text-gray-400 text-sm">
                        {mode === 'login' ? 'Chào mừng bạn quay trở lại!' : 'Bắt đầu hành trình sáng tạo của bạn.'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
                    <button
                        onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                            mode === 'login' 
                            ? 'bg-white dark:bg-gray-700 text-text-primary dark:text-white shadow-sm' 
                            : 'text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white'
                        }`}
                    >
                        Đăng nhập
                    </button>
                    <button
                        onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                            mode === 'signup' 
                            ? 'bg-white dark:bg-gray-700 text-text-primary dark:text-white shadow-sm' 
                            : 'text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white'
                        }`}
                    >
                        Đăng ký
                    </button>
                </div>
                
                {!isSupabaseConfigured && (
                    <div className="mb-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-500 dark:text-yellow-300 rounded-r-lg text-left">
                        <p className="font-bold">Cấu hình còn thiếu!</p>
                        <p className="text-sm">Chức năng đăng nhập chưa được kích hoạt.</p>
                    </div>
                )}
                
                {error && <div className="mb-6 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-300 rounded-lg text-sm text-left">{error}</div>}
                {successMessage && <div className="mb-6 p-3 bg-green-100 border border-green-400 text-green-700 dark:bg-green-900/50 dark:border-green-500 dark:text-green-300 rounded-lg text-sm text-left">{successMessage}</div>}

                <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-main-bg dark:bg-gray-800 border border-border-color dark:border-gray-700 rounded-xl px-4 py-3 text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec] focus:border-transparent outline-none transition-all"
                            placeholder="name@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary dark:text-gray-400 mb-1">Mật khẩu</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-main-bg dark:bg-gray-800 border border-border-color dark:border-gray-700 rounded-xl px-4 py-3 text-text-primary dark:text-white focus:ring-2 focus:ring-[#7f13ec] focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !isSupabaseConfigured}
                        className="w-full bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center"
                    >
                        {loading ? <Spinner /> : (mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản')}
                    </button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-surface dark:bg-dark-bg text-text-secondary dark:text-gray-500">Hoặc tiếp tục với</span>
                    </div>
                </div>

                <button
                    onClick={handleGoogleSignIn}
                    disabled={loading || !isSupabaseConfigured}
                    className="w-full flex justify-center items-center gap-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 border border-gray-300 dark:border-gray-600 shadow-sm"
                >
                    {loading ? <Spinner /> : <GoogleIcon />}
                    <span className="text-sm">Google</span>
                </button>

                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-center text-text-secondary dark:text-gray-500">
                        Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của OPZEN AI.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default AuthPage;
