"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAnonymous: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** Convert an anonymous session into a full account */
  linkEmailToAnon: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Returns the Bearer token for API requests, refreshing if needed */
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAnonymous = !!(user?.is_anonymous ?? true);

  // ── Bootstrap: restore session, then auto sign-in anonymously ────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 1. Restore any existing session
      const { data: { session: existing } } = await supabase.auth.getSession();

      if (existing && mounted) {
        setSession(existing);
        setUser(existing.user);
        setIsLoading(false);
        return;
      }

      // 2. No session → auto sign-in anonymously so every visitor gets a UUID
      const { data, error } = await supabase.auth.signInAnonymously();
      if (mounted) {
        if (!error && data.session) {
          setSession(data.session);
          setUser(data.user);
        }
        setIsLoading(false);
      }
    };

    init();

    // 3. Keep state in sync whenever Supabase refreshes tokens or user signs in
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  /**
   * Links an anonymous session to a real email+password account.
   * The user's UUID stays the same → all existing data is preserved.
   */
  const linkEmailToAnon = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    const isAnon = !current || current.user.is_anonymous;

    if (isAnon && current) {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/upload",
        },
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/upload",
        },
      });
      if (error) throw new Error(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Re-sign-in anonymously so the user still has an isolated workspace
    const { data } = await supabase.auth.signInAnonymously();
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session: current } } = await supabase.auth.getSession();
    return current?.access_token ?? null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAnonymous,
        signInWithEmail,
        signUpWithEmail,
        linkEmailToAnon,
        signInWithGoogle,
        signOut,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
