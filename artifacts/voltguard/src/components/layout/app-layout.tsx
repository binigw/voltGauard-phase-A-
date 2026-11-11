import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Activity,
  Bell,
  LineChart,
  ChartNoAxesCombined,
  FileWarning,
  FileText,
  Users,
  Settings,
  Menu,
  Briefcase,
  Wrench,
  Globe,
  Check,
  ChevronDown,
  LogOut,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGetSystemSummary, getGetSystemSummaryQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { fetchV2Health } from "@/lib/sigmo-api";
import { useActiveAlerts } from "@/lib/sigmo-motors";
import { useI18n } from "@/i18n";
import { isTechnicianRoute, normalizeRoutePath, ROUTES } from "@/lib/routes";
import { useRole } from "@/lib/role-context";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  title: string;
  path: string;
  icon: React.ElementType;
  badge?: number;
  /** Engineering-detail section — hidden in Executive mode. */
  technicianOnly?: boolean;
  /** Database-role Admin function — hidden from technicians in every view. */
  adminOnly?: boolean;
}

function SigmoBrand({ hideWordBelowSm = false }: { hideWordBelowSm?: boolean }) {
  return (
    <span className="sigmo-brand" role="img" aria-label="SIGMO">
      <span className="sigmo-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 40 24" fill="none">
          <path
            d="M1.5 14h9l4.5-10 5.5 18 5-11h13"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="36.5" cy="14" r="1.75" fill="currentColor" />
        </svg>
      </span>
      <span
        className={`sigmo-brand__word${hideWordBelowSm ? " hidden sm:inline" : ""}`}
      >
        SIGMO
      </span>
    </span>
  );
}

/**
 * Executive / Technician view toggle — lives directly on the top bar
 * (role · language · profile), one click to flip the whole surface.
 * Icons only below sm; icons + labels from sm up.
 */
function RoleToggle() {
  const { role, setRole } = useRole();
  const { t } = useI18n();
  const [location, navigate] = useLocation();

  const options = [
    { value: "executive" as const, label: t("role.executive"), Icon: Briefcase },
    { value: "technician" as const, label: t("role.technician"), Icon: Wrench },
  ];

  return (
    <div
      role="group"
      aria-label={t("role.label")}
      className="flex items-center gap-0.5 rounded-full border border-emerald-400/30 bg-card p-0.5 shadow-[0_0_12px_rgba(0,210,148,0.08)]"
    >
      {options.map(({ value, label, Icon }) => {
        const active = role === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              setRole(value);
              // Choosing Executive while viewing an engineering page
              // takes the user to the Executive home. Without this the
              // page's auto-switch would flip the role straight back
              // and the toggle would appear stuck on Technician.
              if (
                value === "executive" &&
                isTechnicianRoute(location)
              ) {
                navigate(ROUTES.dashboard);
              }
            }}
            aria-pressed={active}
            title={label}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold leading-none transition-colors sm:px-2.5 sm:text-xs ${
              active
                ? "bg-emerald-400/15 text-emerald-200"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * User-profile menu — identity + sign out. The Executive/Technician
 * view switch lives on the TOP BAR as a direct toggle; this menu no
 * longer duplicates it.
 */
function ProfileMenu() {
  const { role } = useRole();
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  // Identity comes from the signed-in Supabase session (invite-only
  // accounts); falls back to the generic profile label defensively.
  const userEmail =
    user?.email ?? (user?.phone ?? null) ?? t("role.profile");
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("role.profile")}
          className="flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-emerald-400/15 text-[11px] font-bold text-emerald-300">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-xs font-semibold text-foreground xl:inline">
            {userEmail}
          </span>
          <ChevronDown
            className="hidden h-3.5 w-3.5 text-muted-foreground xl:block"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3 py-1">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-emerald-400/15 text-sm font-bold text-emerald-300">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div
                className="truncate text-sm font-semibold text-foreground"
                title={userEmail}
              >
                {userEmail}
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                {role === "executive"
                  ? t("role.executiveDesc")
                  : t("role.technicianDesc")}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void signOut();
          }}
          className="gap-2.5 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">{t("auth.signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact language selector for the top bar. */
function LanguageMenu() {
  const { language, setLanguage, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label={t("language.label")}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">
            {language === "en" ? "EN" : "አማ"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage("en")}
          className="gap-2 text-sm"
          aria-checked={language === "en"}
        >
          {t("language.english")}
          {language === "en" && (
            <Check className="ml-auto h-4 w-4 text-emerald-300" aria-hidden="true" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("am")}
          className="gap-2 text-sm"
          aria-checked={language === "am"}
        >
          {t("language.amharic")}
          {language === "am" && (
            <Check className="ml-auto h-4 w-4 text-emerald-300" aria-hidden="true" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarBodyProps {
  navItems: NavItem[];
  currentRoute: string;
  systemStatusLabel: string;
  systemNeedsAttention: boolean;
  isBackendError: boolean;
  isBackendLoading: boolean;
  dbConnected: boolean;
  checkingLabel: string;
  checkingConnectionLabel: string;
  unavailableLabel: string;
  connectedLabel: string;
  /** Drawer mode: render the close button and close on navigation. */
  onClose?: () => void;
}

/**
 * Sidebar content shared by the static desktop sidebar and the mobile
 * drawer — one navigation list, one status footer, no drift.
 */
function SidebarBody({
  navItems,
  currentRoute,
  systemStatusLabel,
  systemNeedsAttention,
  isBackendError,
  isBackendLoading,
  dbConnected,
  checkingLabel,
  checkingConnectionLabel,
  unavailableLabel,
  connectedLabel,
  onClose,
}: SidebarBodyProps) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5 xl:px-6">
        <SigmoBrand />
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-9 w-9"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer ${
              currentRoute === item.path
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                : "text-sidebar-foreground/70"
            }`}
            onClick={onClose}
          >
            <span className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              {item.title}
            </span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4 bg-sidebar-accent/50">
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                systemNeedsAttention ? "bg-destructive" : "bg-primary"
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                systemNeedsAttention ? "bg-destructive" : "bg-primary"
              }`}
            ></span>
          </span>
          <span className="text-sidebar-foreground">{systemStatusLabel}</span>
        </div>
        <div
          className={`ml-6 mt-1 text-xs ${
            isBackendError ? "text-destructive" : "text-sidebar-foreground/60"
          }`}
        >
          {isBackendLoading
            ? checkingConnectionLabel
            : isBackendError
              ? unavailableLabel
              : `${connectedLabel}${dbConnected ? " · DB ✓" : ""}`}
        </div>
      </div>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { role, isExecutive, canSwitchView } = useRole();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentRoute = normalizeRoutePath(location);

  // Drawer hygiene: close on navigation and on Escape.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentRoute]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  // Live alerts badge — the backend alerts feed (GET /api/v2/alerts)
  // is the single source of truth: it already subtracts dismissed
  // alerts, so the badge can never signal an alert the operator
  // cleared on the Alerts page.
  const alertsQuery = useActiveAlerts();
  const activeAlertCount = alertsQuery.data?.totalActive ?? 0;
  const { data: summary } = useGetSystemSummary({
    query: { refetchInterval: 30000, queryKey: getGetSystemSummaryQueryKey() },
  });
  // Real liveness probe: the Sigmo V2 health endpoint on the Render
  // backend (open route, same origin the data flows through). The
  // legacy /api/health route does not exist there and made the footer
  // read "Backend Offline" while data was flowing.
  const healthQuery = useQuery({
    queryKey: ["sigmo-v2", "health"],
    queryFn: ({ signal }) => fetchV2Health(signal),
    refetchInterval: 30000,
    retry: 1,
  });
  const isBackendError =
    healthQuery.data === null || healthQuery.isError === true;
  const isBackendLoading = healthQuery.isLoading;
  const dbConnected = healthQuery.data?.database_connected === true;
  const systemNeedsAttention =
    !isBackendError &&
    (activeAlertCount > 0 ||
      (summary?.stoppedCount ?? 0) > 0 ||
      (summary?.highPriorityAlerts ?? 0) > 0);
  const systemStatusLabel = isBackendLoading
    ? t("system.checking")
    : isBackendError
      ? t("system.offline")
      : systemNeedsAttention
        ? t("system.attention")
        : t("system.operational");

  // Command Center view model: Executive mode shows the high-level surface;
  // Technician mode shows the engineering navigation. Personnel is different:
  // it is a database-role Admin function and must never appear for a technician,
  // regardless of view preference. The full item list remains declarative and
  // is filtered only for display.
  const allNavItems: NavItem[] = [
    { title: t("nav.dashboard"), path: ROUTES.dashboard, icon: LayoutDashboard },
    { title: t("nav.machines"), path: ROUTES.machines, icon: Activity },
    { title: t("nav.alerts"), path: ROUTES.alerts, icon: Bell, badge: activeAlertCount, technicianOnly: true },
    { title: t("nav.analytics"), path: ROUTES.analytics, icon: LineChart, technicianOnly: true },
    { title: t("nav.advancedAnalysis"), path: ROUTES.analysis, icon: ChartNoAxesCombined, technicianOnly: true },
    { title: t("nav.faultLogs"), path: ROUTES.faultLogs, icon: FileWarning, technicianOnly: true },
    { title: t("nav.reports"), path: ROUTES.reports, icon: FileText },
    { title: t("nav.personnel"), path: ROUTES.personnel, icon: Users, adminOnly: true },
    { title: t("nav.settings"), path: ROUTES.settings, icon: Settings },
  ];
  const navItems = allNavItems.filter(
    (item) =>
      (!isExecutive || !item.technicianOnly) &&
      (!item.adminOnly || canSwitchView),
  );
  const sectionTitle =
    allNavItems.find((item) => item.path === currentRoute)?.title ??
    t("nav.dashboard");

  const sidebarBodyProps = {
    navItems,
    currentRoute,
    systemStatusLabel,
    systemNeedsAttention,
    isBackendError,
    isBackendLoading,
    dbConnected,
    checkingLabel: t("system.checking"),
    checkingConnectionLabel: t("system.checkingConnection"),
    unavailableLabel: t("system.unavailable"),
    connectedLabel: t("system.connected"),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar — STATIC ONLY at >= 1280px (xl).
          Deliberately display-based (hidden xl:flex): below xl the
          sidebar cannot occupy layout space at all, so the main content
          always takes the full viewport width on phones and tablets.
          (A previous translate-based drawer at the lg/1024px breakpoint
          still showed the sidebar statically open on 1024-1279px test
          devices.) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar xl:flex">
        <SidebarBody {...sidebarBodyProps} />
      </aside>

      {/* Mobile / tablet navigation drawer (< 1280px).
          Conditional render: when closed it is not in the DOM at all —
          there is no transform trick that can leak it open. */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-2xl animate-in slide-in-from-left duration-300">
            <SidebarBody
              {...sidebarBodyProps}
              onClose={() => setMobileMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main Content — 100% of the viewport width below xl. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — minimal on every viewport: hamburger + brand (or
            section context on desktop) on the left; status · language ·
            profile on the right. Non-essential items are hidden below
            xl so nothing ever crowds or overlaps on small screens. */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 backdrop-blur sm:px-4 xl:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 xl:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="xl:hidden">
              <SigmoBrand hideWordBelowSm />
            </div>
            <div className="hidden min-w-0 flex-col leading-tight xl:flex">
              <span className="truncate text-sm font-semibold text-foreground">
                {sectionTitle}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {role === "executive"
                  ? t("role.executiveDesc")
                  : t("role.technicianDesc")}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 xl:gap-2">
            {/* System status lives ONLY in the sidebar footer — the
                top bar no longer duplicates it. The role toggle is
                rendered ONLY for server-role admins; technicians are
                permanently locked to the technician surface. */}
            {canSwitchView ? <RoleToggle /> : null}
            <LanguageMenu />
            <ProfileMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          <div className="mx-auto max-w-7xl h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
