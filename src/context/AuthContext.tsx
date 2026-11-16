import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  localGetMe,
  localLogin,
  localLogout,
  localRegister,
  localResendCode,
  localVerifyEmail,
  tryBackendJson,
} from '../services/localEngine';
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

      if (token.startsWith('local-')) {
        const localUser = localGetMe(token);
        if (active) {
          if (localUser) {
            setUser(localUser);
          } else {
            setUser(null);
            setToken(null);
            try {
              window.localStorage.removeItem(AUTH_TOKEN_KEY);
            } catch {
              // ignore
            }
          }
          setIsCheckingAuth(false);
        }
        return;
      }

      try {
        const result = await tryBackendJson<{ user?: AuthUser }>('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.available && result.ok && result.data?.user) {
          if (active) setUser(result.data.user);
          return;
        }
        if (!result.available) {
          const localUser = localGetMe(token);
          if (localUser) {
            if (active) setUser(localUser);
            return;
          }
        }
        throw new Error('Unauthorized');
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
      const result = await tryBackendJson<{
        token?: string;
        user?: AuthUser;
        error?: string;
        needsVerification?: boolean;
        email?: string;
        username?: string;
      }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (result.available) {
        const data = result.data ?? {};
        if (!result.ok || !data.token || !data.user) {
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
      }

      const localRes = localLogin(username, password);
      if (localRes.ok && localRes.token && localRes.user) {
        persistSession(localRes.token, localRes.user);
        return { ok: true };
      }
      return {
        ok: false,
        error: localRes.error || 'Gagal masuk. Periksa kembali username dan password Anda.',
        needsVerification: localRes.needsVerification,
        email: localRes.email,
        username: localRes.username,
      };
    },
    [persistSession]
  );

  const register = useCallback(
    async (payload: { username: string; email: string; password: string; fullName?: string }) => {
      const result = await tryBackendJson<{
        ok?: boolean;
        error?: string;
        username?: string;
        email?: string;
        verificationPreview?: VerificationPreview;
      }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (result.available) {
        const data = result.data ?? {};
        if (!result.ok) {
          return { ok: false, error: data.error || 'Pendaftaran akun gagal.' };
        }
        return {
          ok: true,
          username: data.username,
          email: data.email,
          verificationPreview: data.verificationPreview,
        };
      }

      return localRegister(payload);
    },
    []
  );

  const verifyEmail = useCallback(
    async (identifier: string, code: string) => {
      const result = await tryBackendJson<{
        token?: string;
        user?: AuthUser;
        error?: string;
      }>('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, code }),
      });

      if (result.available) {
        const data = result.data ?? {};
        if (!result.ok || !data.token || !data.user) {
          return { ok: false, error: data.error || 'Verifikasi gagal.' };
        }
        persistSession(data.token, data.user);
        return { ok: true };
      }

      const localRes = localVerifyEmail(identifier, code);
      if (localRes.ok && localRes.token && localRes.user) {
        persistSession(localRes.token, localRes.user);
        return { ok: true };
      }
      return { ok: false, error: localRes.error || 'Verifikasi gagal.' };
    },
    [persistSession]
  );

  const resendCode = useCallback(async (identifier: string) => {
    const result = await tryBackendJson<{
      ok?: boolean;
      error?: string;
      verificationPreview?: VerificationPreview;
    }>('/api/auth/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });

    if (result.available) {
      const data = result.data ?? {};
      if (!result.ok) {
        return { ok: false, error: data.error || 'Gagal mengirim ulang kode.' };
      }
      return { ok: true, verificationPreview: data.verificationPreview };
    }

    return localResendCode(identifier);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      localLogout(token);
      if (!token.startsWith('local-')) {
        await tryBackendJson('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
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
