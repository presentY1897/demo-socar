'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '@socar/shared';
import { clearSession, getStoredUser } from './api';

interface SessionState {
  user: AuthUser | null;
  ready: boolean;
  logout: () => void;
}

const SessionContext = createContext<SessionState>({
  user: null,
  ready: false,
  logout: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    sync();
    setReady(true);
    window.addEventListener('mocar-session', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('mocar-session', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <SessionContext.Provider value={{ user, ready, logout: clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
