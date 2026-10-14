import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../../../types/src';
import { initApi, login as apiLogin, logout as apiLogout, me, refreshSession, register as apiRegister, setAccessToken } from '../../../api/src/index';
import { loadSession, saveSession, clearSession } from '../storage/sessionStore';

interface Session {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

async function loadWithRefresh(): Promise<{ user: User; accessToken: string } | null> {
  const saved = await loadSession();
  if (!saved) return null;
  // Try the saved access token first (fast path).
  setAccessToken(saved.accessToken);
  try {
    const { user: u } = await me();
    return { user: u, accessToken: saved.accessToken };
  } catch {
    // Access token likely expired (15m TTL) — try the refresh token before
    // giving up. Refresh token lives 7d.
    try {
      const fresh = await refreshSession(saved.refreshToken);
      await saveSession({ accessToken: fresh.accessToken, refreshToken: fresh.refreshToken });
      setAccessToken(fresh.accessToken);
      const { user: u } = await me();
      return { user: u, accessToken: fresh.accessToken };
    } catch {
      await clearSession();
      setAccessToken(null);
      return null;
    }
  }
}

export function SessionProvider({ baseURL, children }: { baseURL: string; children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initApi(baseURL);
    (async () => {
      try {
        const loaded = await loadWithRefresh();
        if (loaded) {
          setUser(loaded.user);
          setToken(loaded.accessToken);
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

  const register = async (name: string, email: string, password: string, role?: string): Promise<void> => {
    const r = await apiRegister({ name, email, password, role: role || 'CUSTOMER' });
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

  const refreshUser = async (): Promise<void> => {
    try {
      const { user: u } = await me();
      setUser(u);
    } catch {
      // Token may have expired mid-session — one refresh attempt.
      const saved = await loadSession();
      if (!saved) throw new Error('no_session');
      const fresh = await refreshSession(saved.refreshToken);
      await saveSession({ accessToken: fresh.accessToken, refreshToken: fresh.refreshToken });
      setAccessToken(fresh.accessToken);
      setToken(fresh.accessToken);
      const { user: u } = await me();
      setUser(u);
    }
  };

  return <Ctx.Provider value={{ user, token, ready, login, register, logout, refreshUser }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession_outside_provider');
  return s;
}
