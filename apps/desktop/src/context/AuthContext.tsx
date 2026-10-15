import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLogin, useRegister, useAuth as useAuthHook, useLogout } from '@/hooks/useApi';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  tokens: Tokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function startSyncAndScheduler(): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI?.sync?.start) {
    try {
      await window.electronAPI.sync.start();
    } catch (err) {
      console.warn('Failed to start sync/scheduler:', err);
    }
  }
}

async function stopSyncAndScheduler(): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI?.sync?.stop) {
    try {
      await window.electronAPI.sync.stop();
    } catch (err) {
      console.warn('Failed to stop sync/scheduler:', err);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();
  const { data: meData, refetch: refetchMe } = useAuthHook();

  useEffect(() => {
    const initAuth = async () => {
      const storedAccess = localStorage.getItem('accessToken');
      const storedRefresh = localStorage.getItem('refreshToken');
      
      if (storedAccess && storedRefresh) {
        setTokens({ accessToken: storedAccess, refreshToken: storedRefresh });
        try {
          await refetchMe();
        } catch {
          clearAuth();
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, [refetchMe]);

  useEffect(() => {
    let mounted = true;
    const handleAuthChange = async () => {
      if (!mounted) return;
      
      if (meData) {
        setUser(meData as User);
        // Start sync and scheduler when user is authenticated
        await startSyncAndScheduler();
      } else if (user && !meData) {
        // User was logged out (meData cleared)
        await stopSyncAndScheduler();
      }
    };
    handleAuthChange();
    return () => { mounted = false; };
  }, [meData, user]);

  const clearAuth = () => {
    setUser(null);
    setTokens(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  };

  const login = async (email: string, password: string) => {
    const result = await loginMutation.mutateAsync({ email, password });
    const newTokens = { accessToken: result.accessToken, refreshToken: result.refreshToken };
    setTokens(newTokens);
    localStorage.setItem('accessToken', newTokens.accessToken);
    localStorage.setItem('refreshToken', newTokens.refreshToken);
    await refetchMe();
  };

  const register = async (data: { email: string; password: string; name: string; inviteCode?: string }) => {
    const result = await registerMutation.mutateAsync(data);
    const newTokens = { accessToken: result.accessToken, refreshToken: result.refreshToken };
    setTokens(newTokens);
    localStorage.setItem('accessToken', newTokens.accessToken);
    localStorage.setItem('refreshToken', newTokens.refreshToken);
    await refetchMe();
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
    await stopSyncAndScheduler();
    clearAuth();
  };

  const refreshAuth = async () => {
    await refetchMe();
  };

  return (
    <AuthContext.Provider value={{
      user,
      tokens,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}