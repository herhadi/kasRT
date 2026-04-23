'use client';

import { createContext, useEffect, useMemo, useState } from 'react';
import { clearSession, getStoredUser, getToken, setSession } from '@/lib/auth';
import { UserSession } from '@/types';

type AuthContextType = {
  user: UserSession | null;
  token: string | null;
  loading: boolean;
  login: (params: { token: string; user: UserSession }) => void;
  logout: () => void;
  refreshUser: (user: UserSession) => void;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  refreshUser: () => {}
});

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUser(getStoredUser());
      setToken(getToken());
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const login = ({ token: nextToken, user: nextUser }: { token: string; user: UserSession }) => {
    setSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
  };

  const logout = () => {
    clearSession();
    setUser(null);
    setToken(null);
  };

  const refreshUser = (nextUser: UserSession) => {
    const currentToken = getToken();
    if (!currentToken) return;
    setSession(currentToken, nextUser);
    setUser(nextUser);
  };

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshUser }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
