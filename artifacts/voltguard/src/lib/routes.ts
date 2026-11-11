export const ROUTES = {
  login: "/login",
  dashboard: "/",
  dashboardAlias: "/dashboard",
  machines: "/machines",
  alerts: "/alerts",
  analytics: "/analytics",
  analysis: "/analysis",
  faultLogs: "/fault-logs",
  reports: "/reports",
  personnel: "/personnel",
  settings: "/settings",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** Engineering-detail pages (wrapped in TechnicianRoute in App.tsx).
 *
 * NOTE: /machines is deliberately NOT in this set. It is a shared
 * page — executives land on it in Executive mode to commission new
 * motors (Register New Motor), technicians see it read-only. Putting
 * it here would auto-flip an arriving executive into Technician view
 * and hide the registration action.
 */
export const TECHNICIAN_ROUTES: readonly string[] = [
  ROUTES.alerts,
  ROUTES.analytics,
  ROUTES.analysis,
  ROUTES.faultLogs,
];

export function isTechnicianRoute(path: string): boolean {
  return TECHNICIAN_ROUTES.includes(normalizeRoutePath(path));
}

export function normalizeRoutePath(path: string): string {
  if (path === "/") return path;
  const normalized = path.replace(/\/+$/, "") || "/";
  // /dashboard is a protected alias for the canonical root. Treat both as
  // the same location so the shell keeps Dashboard active in the sidebar and
  // shows the correct section title.
  return normalized === ROUTES.dashboardAlias ? ROUTES.dashboard : normalized;
}