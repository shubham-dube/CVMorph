"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authApi, getToken, setToken } from "./api-client";
import type { UserResponse } from "./types";
import { auth, googleProvider, isFirebaseConfigured } from "./firebase";
import { signInWithPopup } from "firebase/auth";

interface AuthContextValue {
  user: UserResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Industry-standard silent session renewal: refresh session token periodically while active
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await authApi.refreshToken();
        if (res?.access_token) {
          setToken(res.access_token);
        }
      } catch {
        // fail silently; active token remains valid for 30 days
      }
    }, 1000 * 60 * 60 * 12); // every 12 hours

    return () => clearInterval(interval);
  }, [user]);

  // Firebase auth state keepalive: silently sync refreshed Firebase token
  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) return;
    const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const res = await authApi.googleLogin(
            idToken,
            firebaseUser.email || undefined,
            firebaseUser.displayName || undefined,
            firebaseUser.photoURL || undefined
          );
          if (res?.access_token) {
            setToken(res.access_token);
          }
        } catch {
          // ignore
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured() || !auth || !googleProvider) {
      throw new Error("Firebase is not yet configured. Please provide Firebase credentials in apps/web/.env.");
    }
    const cred = await signInWithPopup(auth, googleProvider);
    const idToken = await cred.user.getIdToken();
    const res = await authApi.googleLogin(
      idToken,
      cred.user.email || undefined,
      cred.user.displayName || undefined,
      cred.user.photoURL || undefined
    );
    setToken(res.access_token);
    const me = await authApi.me();
    setUser(me);
    router.push("/dashboard");
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setToken(res.access_token);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, loginWithGoogle, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}