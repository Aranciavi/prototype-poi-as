import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { GbpAccount, GbpLocationSummary } from '../types/ops';

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const gbpProvider = new GoogleAuthProvider();
gbpProvider.addScope('https://www.googleapis.com/auth/business.manage');
gbpProvider.setCustomParameters({
  prompt: 'select_account consent',
});

// Strict in-memory token cache (never stored in localStorage/sessionStorage)
let cachedGbpAccessToken: string | null = null;
let isSigningInFlag = false;

export interface GbpUserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

interface GbpAuthContextValue {
  gbpUser: GbpUserProfile | null;
  gbpAccessToken: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isLoadingGbpData: boolean;
  gbpError: string | null;
  accounts: GbpAccount[];
  selectedAccountName: string;
  setSelectedAccountName: (accountName: string) => void;
  gbpLocations: GbpLocationSummary[];
  connectGbp: () => Promise<boolean>;
  disconnectGbp: () => Promise<void>;
  refreshGbpAccountsAndLocations: (overrideToken?: string) => Promise<void>;
}

const GbpAuthContext = createContext<GbpAuthContextValue | null>(null);

export function GbpAuthProvider({ children }: { children: React.ReactNode }) {
  const [gbpUser, setGbpUser] = useState<GbpUserProfile | null>(null);
  const [gbpAccessToken, setGbpAccessToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingGbpData, setIsLoadingGbpData] = useState(false);
  const [gbpError, setGbpError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<GbpAccount[]>([]);
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const [gbpLocations, setGbpLocations] = useState<GbpLocationSummary[]>([]);

  const loadLocationsForAccount = useCallback(
    async (accountName: string, token: string) => {
      if (!accountName || !token) return;
      setIsLoadingGbpData(true);
      try {
        const res = await fetch(
          `/api/gbp/locations?accountName=${encodeURIComponent(accountName)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = (await res.json()) as {
          locations?: GbpLocationSummary[];
          error?: string;
        };
        if (!res.ok) {
          setGbpError(data.error || 'Gagal memuat daftar lokasi dari Google Business Profile.');
          setGbpLocations([]);
          return;
        }
        setGbpLocations(Array.isArray(data.locations) ? data.locations : []);
      } catch {
        setGbpError('Tidak dapat terhubung ke Google Business Profile Business Information API.');
      } finally {
        setIsLoadingGbpData(false);
      }
    },
    []
  );

  const refreshGbpAccountsAndLocations = useCallback(
    async (overrideToken?: string) => {
      const token = overrideToken || cachedGbpAccessToken || gbpAccessToken;
      if (!token) return;
      setIsLoadingGbpData(true);
      setGbpError(null);
      try {
        const res = await fetch('/api/gbp/accounts', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          accounts?: GbpAccount[];
          error?: string;
          hint?: string;
        };
        if (!res.ok) {
          setGbpError(
            data.error ||
              'Akun Google terautentikasi, namun akses Google Business Profile API belum aktif pada proyek Google Cloud ini.'
          );
          setAccounts([]);
          setGbpLocations([]);
          return;
        }
        const accList = Array.isArray(data.accounts) ? data.accounts : [];
        setAccounts(accList);
        if (accList.length > 0) {
          const targetAcc =
            accList.find((a) => a.name === selectedAccountName)?.name || accList[0].name;
          setSelectedAccountName(targetAcc);
          await loadLocationsForAccount(targetAcc, token);
        } else {
          setGbpLocations([]);
        }
      } catch {
        setGbpError('Gagal mengambil daftar akun Google Business Profile.');
      } finally {
        setIsLoadingGbpData(false);
      }
    },
    [gbpAccessToken, loadLocationsForAccount, selectedAccountName]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      if (user && cachedGbpAccessToken) {
        setGbpUser({
          uid: user.uid,
          displayName: user.displayName || user.email || 'Pengelola GBP',
          email: user.email || '',
          photoURL: user.photoURL || undefined,
        });
        setGbpAccessToken(cachedGbpAccessToken);
      } else if (!user || !isSigningInFlag) {
        cachedGbpAccessToken = null;
        setGbpUser(null);
        setGbpAccessToken(null);
        setAccounts([]);
        setGbpLocations([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedAccountName && gbpAccessToken) {
      loadLocationsForAccount(selectedAccountName, gbpAccessToken);
    }
  }, [selectedAccountName, gbpAccessToken, loadLocationsForAccount]);

  const connectGbp = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setGbpError(null);
    isSigningInFlag = true;
    try {
      const result = await signInWithPopup(auth, gbpProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Token akses Google Business Profile tidak diterima.');
      }
      cachedGbpAccessToken = credential.accessToken;
      setGbpAccessToken(credential.accessToken);
      setGbpUser({
        uid: result.user.uid,
        displayName: result.user.displayName || result.user.email || 'Pengelola GBP',
        email: result.user.email || '',
        photoURL: result.user.photoURL || undefined,
      });
      await refreshGbpAccountsAndLocations(credential.accessToken);
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal menghubungkan akun Google Business Profile.';
      setGbpError(message);
      return false;
    } finally {
      isSigningInFlag = false;
      setIsConnecting(false);
    }
  }, [refreshGbpAccountsAndLocations]);

  const disconnectGbp = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      cachedGbpAccessToken = null;
      setGbpUser(null);
      setGbpAccessToken(null);
      setAccounts([]);
      setSelectedAccountName('');
      setGbpLocations([]);
      setGbpError(null);
    }
  }, []);

  return (
    <GbpAuthContext.Provider
      value={{
        gbpUser,
        gbpAccessToken,
        isConnected: Boolean(gbpUser && gbpAccessToken),
        isConnecting,
        isLoadingGbpData,
        gbpError,
        accounts,
        selectedAccountName,
        setSelectedAccountName,
        gbpLocations,
        connectGbp,
        disconnectGbp,
        refreshGbpAccountsAndLocations,
      }}
    >
      {children}
    </GbpAuthContext.Provider>
  );
}

export function useGbpAuth() {
  const ctx = useContext(GbpAuthContext);
  if (!ctx) throw new Error('useGbpAuth must be used inside GbpAuthProvider');
  return ctx;
}
