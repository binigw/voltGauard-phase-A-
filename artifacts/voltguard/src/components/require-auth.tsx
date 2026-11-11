import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n";
import { COMPETITION_PUBLIC_ACCESS } from "@/lib/public-access";

/**
 * Route guard — every dashboard route renders inside this component.
 *
 * COMPETITION_PUBLIC_ACCESS is a temporary, one-line bypass for the
 * Ethio-Startup judges. It returns the EXISTING application unchanged and
 * does not alter any dashboard component, query, telemetry or layout logic.
 * Set the switch back to false after judging to restore the original
 * invite-only, fail-closed behavior below.
 *
 * In normal mode, unauthenticated visitors are redirected to /login. While
 * the persisted session is being restored (or the redirect is in flight) a
 * neutral loader is shown and protected content is never flashed.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, roleResolved } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!COMPETITION_PUBLIC_ACCESS && ready && !session) {
      navigate("/login", { replace: true });
    }
  }, [ready, session, navigate]);

  // Public competition mode intentionally bypasses both the session check
  // and the role-resolution wait so a fresh anonymous browser opens the live
  // dashboard immediately. With no server role, RoleProvider naturally uses
  // its existing least-privilege Technician surface.
  if (COMPETITION_PUBLIC_ACCESS) {
    return <>{children}</>;
  }

  // Hold the loader until the server-backed role has resolved too, so the
  // correct (possibly locked) surface renders without a flash of the wrong
  // mode when invite-only authentication is restored.
  if (!ready || !session || !roleResolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2
          className="h-7 w-7 animate-spin text-primary"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{t("auth.sessionCheck")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
