import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../../../types/src';
import { initApi, login as apiLogin, logout as apiLogout, me, register as apiRegister, setAccessToken } from '../../../api/src/index';
import { loadSession, saveSession, clearSession } from '../storage/sessionStore';

interface Session {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ baseURL, children }: { baseURL: string; children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initApi(baseURL);
    (async () => {
      try {
        const saved = await loadSession();
        if (saved) {
          setAccessToken(saved.accessToken);
          setToken(saved.accessToken);
          try {
            const { user: u } = await me();
            setUser(u);
          } catch {
            await clearSession();
            setAccessToken(null);
            setToken(null);
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, [baseURL]);

  const login = async (email: string, password: string): Promise<void> => {
    const r = await apiLogin({ email, password });
    setUser(r.user);
    setToken(r.accessToken);
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  };

  const register = async (name: string, email: string, password: string): Promise<void> => {
    const r = await apiRegister({ name, email, password, role: 'CUSTOMER' });
    setUser(r.user);
    setToken(r.accessToken);
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  };

  const logout = async (): Promise<void> => {
    apiLogout();
    setUser(null);
    setToken(null);
    await clearSession();
  };

  return <Ctx.Provider value={{ user, token, ready, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession_outside_provider');
  return s;
}
