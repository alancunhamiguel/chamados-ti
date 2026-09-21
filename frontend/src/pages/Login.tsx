import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

declare global {
  interface Window {
    google?: any;
  }
}

const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleError, setGoogleError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const loginGoogleRef = useRef(loginWithGoogle);
  loginGoogleRef.current = loginWithGoogle;

  useEffect(() => {
    if (!googleClientId) return;

    const initGoogle = () => {
      if (!window.google?.accounts) {
        setTimeout(initGoogle, 300);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: false,
        callback: async (response: any) => {
          setError('');
          setGoogleError('');
          setLoading(true);
          try {
            await loginGoogleRef.current(response.credential);
            navigateRef.current('/tickets');
          } catch {
            setGoogleError('Falha ao entrar com o Google');
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-button')!,
        { theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'rectangular' }
      );
    };
    initGoogle();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/tickets');
    } catch {
      setError('Credenciais invalidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-44 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 p-3 shadow-card">
            <img src="/logo.png" alt="Grupo FedCorp" className="max-w-full max-h-full object-contain" />
          </div>
          <p className="text-base font-semibold text-slate-500">Sistema de Gerenciamento de Chamados</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-card shadow-card p-8">
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-600 disabled:opacity-50 transition-all shadow-sm"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {googleClientId && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-surface-200"></div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">ou</span>
                <div className="flex-1 h-px bg-surface-200"></div>
              </div>
              {googleError && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4 border border-red-100">
                  {googleError}
                </div>
              )}
              <div id="google-signin-button" className="flex justify-center"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
