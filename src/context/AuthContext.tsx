import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '../types/ops';

const AUTH_TOKEN_KEY = 'bri_ops_auth_token_v1';

export interface VerificationPreview {
  to: string;
  subject: string;
  code: string;
  sentAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isCheckingAuth: boolean;
  login: (username: string, password: string) => Promise<{
    ok: boolean;
    error?: string;
    needsVerification?: boolean;
    email?: string;
    username?: string;
  }>;
  register: (payload: {
    username: string;
    email: string;
    password: string;
    fullName?: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    username?: string;
    email?: string;
    verificationPreview?: VerificationPreview;
  }>;
  verifyEmail: (identifier: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  resendCode: (identifier: string) => Promise<{
    ok: boolean;
    error?: string;
    verificationPreview?: VerificationPreview;
  }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (!token) {
        if (active) setIsCheckingAuth(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        const data = (await res.json()) as { user: AuthUser };
        if (active) {
          setUser(data.user);
        }
      } catch {
        if (active) {
          setUser(null);
          setToken(null);
          try {
            window.localStorage.removeItem(AUTH_TOKEN_KEY);
          } catch {
            // ignore
          }
        }
      } finally {
        if (active) setIsCheckingAuth(false);
      }
    }
    restoreSession();
    return () => {
      active = false;
    };
  }, [token]);

  const persistSession = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    } catch {
      // ignore
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUser;
          error?: string;
          needsVerification?: boolean;
          email?: string;
          username?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          return {
            ok: false,
            error: data.error || 'Gagal masuk. Periksa kembali username dan password Anda.',
            needsVerification: data.needsVerification,
            email: data.email,
            username: data.username,
          };
        }
        persistSession(data.token, data.user);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Tidak dapat terhubung ke server autentikasi.' };
      }
    },
    [persistSession]
  );

  const register = useCallback(
    async (payload: { username: string; email: string; password: string; fullName?: string }) => {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          username?: string;
          email?: string;
          verificationPreview?: VerificationPreview;
        };
        if (!res.ok) {
          return { ok: false, error: data.error || 'Pendaftaran akun gagal.' };
        }
        return {
          ok: true,
          username: data.username,
          email: data.email,
          verificationPreview: data.verificationPreview,
        };
      } catch {
        return { ok: false, error: 'Tidak dapat terhubung ke server pendaftaran.' };
      }
    },
    []
  );

  const verifyEmail = useCallback(
    async (identifier: string, code: string) => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, code }),
        });
        const data = (await res.json()) as {
          token?: string;
          user?: AuthUser;
          error?: string;
        };
        if (!res.ok || !data.token || !data.user) {
          return { ok: false, error: data.error || 'Verifikasi gagal.' };
        }
        persistSession(data.token, data.user);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal menghubungi server verifikasi.' };
      }
    },
    [persistSession]
  );

  const resendCode = useCallback(async (identifier: string) => {
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        verificationPreview?: VerificationPreview;
      };
      if (!res.ok) {
        return { ok: false, error: data.error || 'Gagal mengirim ulang kode.' };
      }
      return { ok: true, verificationPreview: data.verificationPreview };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
    setUser(null);
    setToken(null);
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isCheckingAuth,
        login,
        register,
        verifyEmail,
        resendCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
