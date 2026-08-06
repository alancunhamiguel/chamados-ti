import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User } from '../types';
import { login as apiLogin, getMe, updateOnlineStatus as apiUpdateStatus } from '../api/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  updateUserStatus: (status: string) => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  authLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authLoading, setAuthLoading] = useState(true);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (token && !initialCheckDone.current) {
      initialCheckDone.current = true;
      getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        })
        .finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const updateUserStatus = async (status: string) => {
    const updated = await apiUpdateStatus(status);
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  };

  const isAuthenticated = !!token && !!user;
  const hasRole = (role: string) => user?.role === role;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, updateUserStatus, isAuthenticated, hasRole, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
