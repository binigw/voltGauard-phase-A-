import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseAuthConfigured } from "@/lib/supabase-client";

/**
 * Authentication state for the invite-only dashboard.
 *
 * - `ready` — the initial session restore finished (supabase-js
 *   persists sessions in localStorage, so a refresh keeps the user
 *   signed in without a flash of the login page).
 * - `configured` — false when the Supabase env vars are missing; the
 *   UI shows an honest configuration screen and the guard stays shut.
 * - `signIn` returns a stable error CODE (never a raw provider
 *   string) so the login page can localize it in EN/AM.
 */

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "network"
  | "unknown";

/**
 * Server-backed role (public.user_roles, RLS-protected). Fetched with
 * the signed-in user's own session — they can only ever read their own
 * row. Defaults are FAIL-CLOSED: no row / fetch error / still loading
 * (null) all mean "technician" (least privilege). Only the Supabase
 * admin console can grant 'admin'.
 */
export type DbRole = "admin" | "technician";

export interface AuthValue {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  dbRole: DbRole | null;
  /** True once the role row resolved (or there is no session to check). */
  roleResolved: boolean;
  signIn: (email: string, password: string) => Promise<AuthErrorCode | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [dbRole, setDbRole] = useState<DbRole | null>(null);

  useEffect(() => {
    if (!isSupabaseAuthConfigured) {
      // Fail closed, but let the UI render its honest message.
      setReady(true);
      return;
    }
    const supabase = getSupabase();
    let mounted = true;

    /**
     * `getSession()` only restores the browser's local copy. It does not prove
     * that the access token was issued by Supabase, so it must never unlock a
     * protected route by itself. Validate the restored token with GoTrue
     * before setting `ready=true`; invalid/expired/tampered storage fails
     * closed and is removed locally.
     */
    const restoreValidatedSession = async () => {
      try {
        const { data: stored } = await supabase.auth.getSession();
        const candidate = stored.session;
        if (!candidate) {
          if (mounted) setSession(null);
          return;
        }

        const { data: validated, error } = await supabase.auth.getUser(
          candidate.access_token,
        );
        if (error || !validated.user) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          if (mounted) {
            setSession(null);
            setDbRole(null);
          }
          return;
        }

        if (mounted) {
          setSession({ ...candidate, user: validated.user });
        }
      } catch {
        // Network/provider failure during restoration cannot grant access.
        if (mounted) {
          setSession(null);
          setDbRole(null);
        }
      } finally {
        if (mounted) setReady(true);
      }
    };

    void restoreValidatedSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        // INITIAL_SESSION is the same untrusted local restore validated above.
        // Always ignore it; only restoreValidatedSession may accept that token.
        if (event === "INITIAL_SESSION") return;
        setSession(nextSession);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Server-backed RBAC: read the user's role row whenever the signed-in
  // user changes. RLS guarantees they only see their own row; a missing
  // row or any error resolves to "technician" (least privilege).
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setDbRole(null);
      return;
    }
    let active = true;
    const loadRole = async () => {
      try {
        const { data } = await getSupabase()
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active) return;
        setDbRole(data?.role === "admin" ? "admin" : "technician");
      } catch {
        if (active) setDbRole("technician");
      }
    };
    void loadRole();
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      configured: isSupabaseAuthConfigured,
      session,
      user: session?.user ?? null,
      dbRole,
      roleResolved: !session || dbRole !== null,
      signIn: async (email, password) => {
        try {
          const { error } = await getSupabase().auth.signInWithPassword({
            email,
            password,
          });
          if (!error) return null;
          const message = error.message.toLowerCase();
          if (message.includes("invalid login credentials")) {
            return "invalid_credentials";
          }
          if (message.includes("email not confirmed")) {
            return "email_not_confirmed";
          }
          if (
            message.includes("validation failed") ||
            message.includes("unable to validate")
          ) {
            return "invalid_credentials";
          }
          return "unknown";
        } catch {
          return "network";
        }
      },
      signOut: async () => {
        try {
          await getSupabase().auth.signOut();
        } catch {
          // Local session is cleared regardless below.
        }
        setSession(null);
      },
    }),
    [ready, session, dbRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
