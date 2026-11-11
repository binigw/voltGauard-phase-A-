import { useAuth } from "@/lib/auth-context";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Command Center view modes (SIGMO commercial UI).
 *
 *  - "executive":  high-level metrics + operations reports only
 *                  (Section 6.a payload — plant health, financial
 *                  exposure, decision directive). No raw telemetry.
 *  - "technician": the full engineering surface — machine status grid,
 *                  telemetry analytics, advanced analysis, fault logs
 *                  and the Section 6.b per-motor payload.
 *
 * The choice is a UI preference (the API key stays the same), so it is
 * persisted locally and restored on the next visit.
 */
export type UserRole = "executive" | "technician";

export const USER_ROLES: readonly UserRole[] = ["executive", "technician"];

const STORAGE_KEY = "sigmo.user-role";
const DEFAULT_ROLE: UserRole = "executive";

function isUserRole(value: unknown): value is UserRole {
  return value === "executive" || value === "technician";
}

function readStoredRole(): UserRole {
  if (typeof window === "undefined") return DEFAULT_ROLE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isUserRole(stored) ? stored : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

interface RoleContextValue {
  /** Effective view role (server-locked to technician for non-admins). */
  role: UserRole;
  setRole: (role: UserRole) => void;
  isExecutive: boolean;
  isTechnician: boolean;
  /** True only for users whose SERVER role is admin — they get the toggle. */
  canSwitchView: boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { dbRole } = useAuth();
  // The stored preference is the ADMIN's view choice. Non-admin users
  // are permanently locked to the technician surface.
  const [viewRole, setViewRole] = useState<UserRole>(readStoredRole);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, viewRole);
    } catch {
      // Private-browsing / disabled storage: the choice simply does not
      // persist — the in-memory state still drives the UI.
    }
  }, [viewRole]);

  const canSwitchView = dbRole === "admin";
  const role: UserRole = canSwitchView ? viewRole : "technician";

  const setRole = useCallback(
    (next: UserRole) => {
      // Hard lock: role switching is an admin-only capability. For a
      // technician this is a deliberate no-op — even if some code path
      // calls it, the view cannot change.
      if (!canSwitchView) return;
      setViewRole(next);
    },
    [canSwitchView],
  );

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      setRole,
      isExecutive: role === "executive",
      isTechnician: role === "technician",
      canSwitchView,
    }),
    [role, setRole, canSwitchView],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used inside <RoleProvider>.");
  }
  return context;
}
