import { useEffect, useRef } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireAuth } from '@/components/require-auth';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Login } from '@/pages/login';
import { useRole } from '@/lib/role-context';

import { Dashboard } from '@/pages/dashboard';
import { Machines } from '@/pages/machines';
import { Alerts } from '@/pages/alerts';
import { Analytics } from '@/pages/analytics';
import { Analysis } from '@/pages/analysis';
import { FaultLogs } from '@/pages/fault-logs';
import { Personnel } from '@/pages/personnel';
import { Settings } from '@/pages/settings';
import { Reports } from '@/pages/reports';
import { LanguageProvider } from '@/i18n';
import { RoleProvider } from '@/lib/role-context';
import { normalizeRoutePath, ROUTES } from '@/lib/routes';

const queryClient = new QueryClient();

function getRouterBase(baseUrl: string | undefined): string {
  const normalizedBaseUrl = baseUrl?.trim() ?? '';

  if (
    normalizedBaseUrl === '' ||
    normalizedBaseUrl === '/' ||
    normalizedBaseUrl === '.' ||
    normalizedBaseUrl === './'
  ) {
    return '';
  }

  return normalizedBaseUrl.replace(/\/+$/, '');
}

const routerBase = getRouterBase(import.meta.env.BASE_URL);

/**
 * Wraps engineering-detail routes. Navigating directly to one of
 * these pages (link, URL, bookmark) while in Executive mode simply
 * switches to Technician mode — the engineering surface is what the
 * user asked for, so it is what they get. The old "Technician Mode
 * Required" blocker card is gone: the sidebar already hides these
 * links in Executive mode, so the auto-switch only ever fires on
 * deliberate direct navigation.
 */
function TechnicianRoute({ children }: { children: React.ReactNode }) {
  const { isExecutive, setRole } = useRole();
  const [location] = useLocation();

  // Auto-switch ONLY when ARRIVING at an engineering page (direct
  // link / bookmark) while in Executive mode. It must not re-run when
  // the role changes while the page is already open: the top-bar
  // toggle navigates home in that case, and a re-trigger here would
  // flip the role straight back (the "cannot switch to Executive"
  // bug). The ref guards one handling per location.
  const handledArrival = useRef<string | null>(null);
  useEffect(() => {
    if (handledArrival.current === location) return;
    handledArrival.current = location;
    if (isExecutive) setRole("technician");
  }, [location, isExecutive, setRole]);

  // One brief blank frame while the role state flips — the page then
  // renders in full Technician mode.
  if (isExecutive) return null;

  return <>{children}</>;
}

/** Personnel is a database-backed administrative function. The server's
 * public.user_roles value — never the Executive/Technician view preference —
 * is the authority. Direct URL navigation by a technician fails closed and
 * returns to the dashboard; the page is not rendered while role resolution is
 * pending, preventing a protected-content flash. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { dbRole, roleResolved } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (roleResolved && dbRole !== 'admin') {
      navigate(ROUTES.dashboard, { replace: true });
    }
  }, [dbRole, navigate, roleResolved]);

  if (!roleResolved || dbRole !== 'admin') return null;
  return <>{children}</>;
}

function Router() {
  const [location] = useLocation();

  // The login page is the ONLY public route — it stands outside the
  // app shell and the auth guard. An explicit dispatch is used
  // instead of a catch-all <Route path="/:rest*"> because wouter's
  // `/:rest*` pattern does NOT match the root path "/" (regexparam
  // requires at least one segment) — the catch-all left "/" blank,
  // so the dashboard never opened after sign-in.
  if (normalizeRoutePath(location) === ROUTES.login) {
    return <Login />;
  }

  // Production auth is restored: every application route below is protected;
  // only the explicit /login branch above remains public.
  return (
    <RequireAuth>
      <AppLayout>
        <Switch>
          {/* Both submitted URLs resolve to the exact same live Dashboard
              component; no duplicate page or alternate data path. */}
          <Route path={ROUTES.dashboardAlias} component={Dashboard} />
          <Route path={ROUTES.dashboard} component={Dashboard} />
          {/* Machines is a SHARED page: executives arrive in
              Executive mode (motor registration lives here) and
              technicians get the read-only registry view. */}
          <Route path={ROUTES.machines}>
            <Machines />
          </Route>
          <Route path={ROUTES.alerts}>
            <TechnicianRoute>
              <Alerts />
            </TechnicianRoute>
          </Route>
          <Route path={ROUTES.analytics}>
            <TechnicianRoute>
              <Analytics />
            </TechnicianRoute>
          </Route>
          <Route path={ROUTES.analysis}>
            <TechnicianRoute>
              <Analysis />
            </TechnicianRoute>
          </Route>
          <Route path={ROUTES.faultLogs}>
            <TechnicianRoute>
              <FaultLogs />
            </TechnicianRoute>
          </Route>
          {/* Personnel is an Admin function. View mode never grants access;
              the database-backed role is checked by AdminRoute. */}
          <Route path={ROUTES.personnel}>
            <AdminRoute>
              <Personnel />
            </AdminRoute>
          </Route>
          <Route path={ROUTES.reports} component={Reports} />
          <Route path={ROUTES.settings} component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </RequireAuth>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* RoleProvider consumes the server-backed role, so it must
              sit INSIDE AuthProvider. */}
          <RoleProvider>
            <TooltipProvider>
              <WouterRouter base={routerBase}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </RoleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
