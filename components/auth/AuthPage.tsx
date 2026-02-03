
import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import Spinner from '../Spinner';
import { Logo } from '../common/Logo';
import { useLanguage } from '../../hooks/useLanguage';

interface AuthPageProps {
  onGoHome: () => void;
}

const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M43.611 20.083H42V20H24V28H35.303C33.674 32.69 29.232 36 24 36C17.373 36 12 30.627 12 24C12 17.373 17.373 12 24 12C27.128 12 29.938 13.189 32.126 15.01L38.288 8.848C34.692 5.652 29.692 3.5 24 3.5C13.438 3.5 5 12.062 5 24C5 35.938 13.438 44.5 24 44.5C34.563 44.5 43.156 35.938 43.156 24C43.156 22.693 43.438 21.365 43.611 20.083Z" fill="#FFC107"/>
        <path d="M6.306 14.691L12.422 19.119C14.34 14.863 18.784 12 24 12C27.128 12 29.938 13.189 32.126 15.01L38.288 8.848C34.692 5.652 29.692 3.5 24 3.5C17.437 3.5 11.562 7.062 7.562 12.25L6.306 14.691Z" fill="#FF3D00"/>
        <path d="M24 44.5C29.438 44.5 34.219 42.125 37.938 38.375L32.25 33.5C30.219 35.125 27.25 36 24 36C18.784 36 14.34 33.137 12.422 28.881L6.306 33.309C10.125 39.938 16.562 44.5 24 44.5Z" fill="#4CAF50"/>
        <path d="M43.611 20.083H42V20H24V28H35.303C34.51 30.228 33.061 32.094 31.232 33.344L37.495 39.608C42.125 35.031 44.5 28.625 44.5 21.5C44.5 20.5 44.344 19.5 44.156 18.531L43.611 20.083Z" fill="#1976D2"/>
    </svg>
);

const AuthPage: React.FC<AuthPageProps> = ({ onGoHome }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccessMsg(t('auth.check_email'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Navigation handled by App.tsx observer
      }
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
          }
        });
        if (error) {
            setError(error.message);
            setLoading(false);
        }
    } catch (err: any) {
        setError(err.message || t('common.error'));
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-main-bg dark:bg-[#0F0F0F] flex flex-col items-center justify-center p-4 relative font-sans transition-colors duration-300">
        <button onClick={onGoHome} className="absolute top-6 left-6 text-text-secondary dark:text-gray-400 hover:text-accent transition-colors flex items-center gap-2 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            {t('nav.back_home')}
        </button>

        <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8 animate-fade-in">
                 <Logo className="w-20 h-20 mb-6 drop-shadow-2xl" />
                <h1 className="text-text-primary dark:text-white text-3xl font-extrabold mb-2 tracking-tight">OPZEN AI</h1>
                <p className="text-text-secondary dark:text-gray-400 text-center text-base font-medium opacity-80">{t('auth.welcome')}</p>
            </div>
            
            <div className="bg-surface dark:bg-[#191919] p-8 rounded-3xl shadow-2xl border border-border-color dark:border-[#302839] relative overflow-hidden">
                
                <h2 className="text-xl font-bold text-text-primary dark:text-white mb-8 text-center">
                    {mode === 'login' ? t('auth.login_title') : t('auth.signup_title')}
                </h2>

                {!isSupabaseConfigured && (
                    <div className="mb-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-500 dark:text-yellow-300 rounded-r-lg text-left">
                        <p className="font-bold text-sm">Cấu hình chưa hoàn tất!</p>
                        <p className="text-xs">Chức năng đăng nhập hiện chưa khả dụng.</p>
                    </div>
                )}
                
                {error && (
                    <div className="mb-6 p-3 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/20 dark:border-red-500 dark:text-red-400 rounded-xl text-sm text-left animate-shake">
                        {error}
                    </div>
                )}

                {successMsg && (
                    <div className="mb-6 p-3 bg-green-100 border border-green-400 text-green-700 dark:bg-green-900/20 dark:border-green-500 dark:text-green-400 rounded-xl text-sm text-left">
                        {successMsg}
                    </div>
                )}
                
                <div className="space-y-6">
                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">
                                {t('auth.email_label')}
                            </label>
                            <input 
                                type="email" 
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={t('auth.email_placeholder')}
                                className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333] rounded-xl px-4 py-3 text-sm text-text-primary dark:text-white focus:ring-2 focus:ring-accent/50 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1">
                                {t('auth.password_label')}
                            </label>
                            <input 
                                type="password" 
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('auth.password_placeholder')}
                                className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333] rounded-xl px-4 py-3 text-sm text-text-primary dark:text-white focus:ring-2 focus:ring-accent/50 outline-none transition-all"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !isSupabaseConfigured}
                            className="w-full py-4 bg-accent hover:bg-accent-600 disabled:bg-gray-400 text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition-all transform active:scale-95 flex justify-center items-center"
                        >
                            {loading ? <Spinner /> : (mode === 'login' ? t('auth.login_btn') : t('auth.signup_btn'))}
                        </button>
                    </form>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200 dark:border-[#333]"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-surface dark:bg-[#191919] px-2 text-gray-500 dark:text-gray-500 font-bold">{t('auth.or')}</span>
                        </div>
                    </div>

                    {/* Google Login Alternative */}
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading || !isSupabaseConfigured}
                        className="w-full flex justify-center items-center gap-4 bg-white dark:bg-[#252525] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] text-gray-700 dark:text-gray-200 font-bold py-4 px-4 rounded-xl transition-all duration-200 border border-gray-300 dark:border-[#333] shadow-sm group transform active:scale-95"
                    >
                        {loading ? <Spinner /> : (
                            <>
                                <GoogleIcon />
                                <span className="text-base group-hover:text-[#7f13ec] transition-colors">
                                    {t('auth.google_continue')}
                                </span>
                            </>
                        )}
                    </button>

                    <div className="text-center mt-6">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
                            <button 
                                onClick={() => {
                                    setMode(mode === 'login' ? 'signup' : 'login');
                                    setError(null);
                                    setSuccessMsg(null);
                                }}
                                className="text-accent hover:underline font-bold"
                            >
                                {mode === 'login' ? t('auth.signup_now') : t('auth.login_now')}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
            
            <p className="text-center text-[11px] text-text-secondary dark:text-gray-500 mt-8 leading-relaxed px-4 opacity-60">
                {t('auth.terms')} <a href="/terms-of-service" className="underline hover:text-[#7f13ec] transition-colors">{t('auth.terms_link')}</a> & <a href="#" className="underline hover:text-[#7f13ec] transition-colors">{t('auth.policy_link')}</a>.
            </p>
        </div>
        <style>{`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        `}</style>
    </div>
  );
};

export default AuthPage;
