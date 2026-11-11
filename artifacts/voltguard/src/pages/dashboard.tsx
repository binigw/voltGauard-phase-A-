import { Card, CardContent } from "@/components/ui/card";
import { Activity, AlertTriangle, BrainCircuit, Cpu, FileText, FileWarning } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiErrorState } from "@/components/api-error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DecisionEngineStatus } from "@/components/decision-engine-status";
import { AiAnalysisCard } from "@/components/ai-analysis-card";
import { useI18n } from "@/i18n";
import { fetchExecutiveView, fetchFaultLogs, readExecutiveField } from "@/lib/sigmo-api";
import { ExecutiveSummary } from "@/components/executive-summary";
import { V2MotorTable } from "@/components/v2-motor-table";
import {
  toLegacyMotor,
  useActiveAlerts,
  useMotorsOverview,
} from "@/lib/sigmo-motors";
import { SeverityBadge, StageBadge } from "@/components/ui/badges";
import { useRole } from "@/lib/role-context";
import { useMotorAssets } from "@/lib/sigmo-assets";
import { usePageTitle } from "@/lib/use-page-title";
import { ROUTES } from "@/lib/routes";

export function Dashboard() {
  const { t, fault, relativeTime } = useI18n();
  usePageTitle(t("dashboard.title"));
  const { isExecutive, isTechnician } = useRole();
  const assetsQuery = useMotorAssets();

  // Live V2 payloads (Render backend) — the only data sources on this
  // page. Every displayed number comes from an API, never invented.
  const executiveViewQuery = useQuery({
    queryKey: ["sigmo-v2", "dashboard", "executive"],
    queryFn: ({ signal }) => fetchExecutiveView(signal),
    refetchInterval: 30000,
  });
  const motorsOverviewQuery = useMotorsOverview();
  const motors = motorsOverviewQuery.data?.motors ?? [];
  // Live alerts — the backend feed is the single source of truth:
  // dismissed alerts are already subtracted server-side, so an alert
  // cleared on the Alerts page disappears here (and on the top-bar
  // badge) in the same cache invalidation.
  const alertsQuery = useActiveAlerts();
  const liveAlerts = (alertsQuery.data?.alerts ?? []).map((alert) => ({
    id: alert.alertId,
    motorName: alert.motorId,
    severity: alert.severity,
    faultType: alert.predictedClass ?? alert.stageLabel,
    createdAt: alert.recordedAt ?? "",
    stage: alert.stage,
    confidence: alert.modelConfidence,
  }));
  const alertMotor = motorsOverviewQuery.data?.motors.find(
    (motor) => motor.stage >= 2 || motor.is_fault,
  );

  // V2 fault episodes (Section 10 audit trail) — replaces the dead
  // legacy fault-log feed.
  const faultsQuery = useQuery({
    queryKey: ["sigmo-v2", "dashboard", "faults"],
    queryFn: ({ signal }) => fetchFaultLogs(null, 6, signal),
    refetchInterval: 30000,
  });
  const episodes = faultsQuery.data?.faults ?? [];

  // Executive KPI values: live Section 6.a payload, with the overview
  // as the direct fallback.
  const execData = executiveViewQuery.data;
  const v2MotorsMonitored =
    typeof readExecutiveField(execData, "motors_monitored") === "number"
      ? (readExecutiveField(execData, "motors_monitored") as number)
      : null;
  const v2PlantHealth =
    typeof readExecutiveField(execData, "plant_health_index") === "number"
      ? (readExecutiveField(execData, "plant_health_index") as number)
      : null;
  const v2Stages = readExecutiveField(execData, "critical_asset_risk_summary");
  const v2Stage =
    v2Stages && typeof v2Stages === "object" && !Array.isArray(v2Stages)
      ? (v2Stages as Record<string, unknown>)
      : null;
  const v2Stage34 =
    v2Stage && typeof v2Stage["stage_3_4_critical_failure_risk"] === "number"
      ? (v2Stage["stage_3_4_critical_failure_risk"] as number)
      : null;
  const v2Stage2 =
    v2Stage && typeof v2Stage["stage_2_moderate_risk"] === "number"
      ? (v2Stage["stage_2_moderate_risk"] as number)
      : null;
  const v2RiskLabel =
    v2Stage34 !== null && v2Stage34 > 0
      ? "High Risk"
      : v2Stage2 !== null && v2Stage2 > 0
        ? "Medium Risk"
        : "Low Risk";

  // Connection health: when the backend is unreachable the page must
  // say so honestly — it must NEVER render "all healthy" from an
  // empty payload (empty arrays come back from a dead query too).
  const anyConnectionError =
    executiveViewQuery.isError || motorsOverviewQuery.isError;
  const lastReceivedAt = Math.max(
    executiveViewQuery.dataUpdatedAt || 0,
    motorsOverviewQuery.dataUpdatedAt || 0,
  ) || null;

  const overviewHealthValues = motors
    .map((m) => m.health_percent)
    .filter((v): v is number => typeof v === "number");
  const overviewMeanHealth = overviewHealthValues.length
    ? overviewHealthValues.reduce((sum, v) => sum + v, 0) /
      overviewHealthValues.length
    : null;
  const activeAlertCount = liveAlerts.length;
  const criticalAlertCount = liveAlerts.filter(
    (alert) => alert.severity === "critical",
  ).length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">

      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t("dashboard.title")}
          </h1>
          <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <div
          className={`flex items-center gap-2 bg-black/40 border px-4 py-2 rounded-full font-mono text-sm ${
            anyConnectionError
              ? "border-destructive/40"
              : "border-border shadow-[0_0_15px_rgba(26,214,104,0.1)]"
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                anyConnectionError
                  ? "animate-pulse bg-destructive"
                  : "animate-ping bg-primary"
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                anyConnectionError ? "bg-destructive" : "bg-primary"
              }`}
            ></span>
          </span>
           <span
             className={`font-bold tracking-wider ${
               anyConnectionError ? "text-destructive" : "text-emerald-300"
             }`}
           >
             {anyConnectionError ? t("dashboard.reconnecting") : t("dashboard.live")}
           </span>
        </div>
      </div>

      {/* Connection-lost banner — honest state, never silence */}
      {anyConnectionError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <span className="text-sm font-semibold text-destructive">
            {t("dashboard.connectionLost")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("dashboard.autoRetry")}
          </span>
          {lastReceivedAt ? (
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {t("dashboard.lastReceived")}:{" "}
              {new Date(lastReceivedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isTechnician ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatCard
          title={t("dashboard.activeMotors")}
          value={
            motorsOverviewQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : v2MotorsMonitored !== null ? (
              `${v2MotorsMonitored}`
            ) : (
              `${motors.length}`
            )
          }
          subtitle={t("dashboard.liveBackendSource")}
          icon={<Cpu className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title={t("dashboard.avgHealth")}
          value={
            executiveViewQuery.isLoading && motorsOverviewQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : v2PlantHealth !== null ? (
              `${v2PlantHealth.toFixed(1)}%`
            ) : overviewMeanHealth !== null ? (
              `${overviewMeanHealth.toFixed(1)}%`
            ) : (
              t("dashboard.unavailable")
            )
          }
          subtitle={t("dashboard.noHistory")}
          icon={<HeartPulseIcon className="h-5 w-5 text-primary" />}
        />
        {isTechnician && (
          <StatCard
            title={t("dashboard.activeAlerts")}
            value={
              motorsOverviewQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : motorsOverviewQuery.isError ? (
                "—"
              ) : (
                activeAlertCount
              )
            }
            subtitle={
              motorsOverviewQuery.isError
                ? t("dashboard.connectionLost")
                : `${criticalAlertCount} ${t("dashboard.critical")}, ${Math.max(activeAlertCount - criticalAlertCount, 0)} ${t("dashboard.warning")}`
            }
            icon={<AlertTriangle className={`h-5 w-5 ${activeAlertCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />}
            alert={activeAlertCount > 0}
          />
        )}
        <StatCard
          title={t("dashboard.predictiveRisk")}
          value={
            executiveViewQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              fault(v2RiskLabel)
            )
          }
          subtitle={v2RiskLabel === "High Risk"
            ? t("dashboard.riskHighDetail")
            : v2RiskLabel === "Medium Risk"
              ? t("dashboard.riskMediumDetail")
              : t("dashboard.riskLowDetail")}
          icon={<BrainCircuit className={`h-5 w-5 ${v2RiskLabel.includes("High") ? "text-destructive" : "text-[hsl(var(--chart-2))]"}`} />}
          alert={v2RiskLabel.includes("High")}
        />
      </div>

      {/* Executive mode: polished Section 6.a command summary */}
      {isExecutive && (
        <div className="flex flex-col gap-4">
          {/* Operations Reports shortcut — deliberately at the TOP of
              the admin dashboard: it used to sit below the full fleet
              table (below the fold) and was effectively invisible. */}
          <Card className="border-border bg-card">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("exec.reportsTitle")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("exec.reportsBody")}
                  </p>
                </div>
              </div>
              <Button asChild className="shrink-0">
                <Link href={ROUTES.reports}>{t("exec.reportsCta")}</Link>
              </Button>
            </CardContent>
          </Card>
          <ExecutiveSummary query={executiveViewQuery} />
          {/* Live machine grid incl. commissioned motors awaiting
              their first telemetry window (asset registry read). */}
          <V2MotorTable
            query={motorsOverviewQuery}
            assets={assetsQuery.data ?? []}
            compact
          />
        </div>
      )}

      {/* Technician mode: the full engineering surface */}
      {isTechnician && (
        <>
          <V2MotorTable
            query={motorsOverviewQuery}
            assets={assetsQuery.data ?? []}
            description={t("v2.evidenceSubtitle")}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Alerts Panel — derived from the live overview */}
            <Card className="col-span-1 flex h-[400px] flex-col border-border bg-card">
              <div className="flex items-center justify-between border-b border-border/50 p-6 pb-2">
                <h3 className="text-lg font-semibold">{t("v2.alertsFeed")}</h3>
                <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                  {liveAlerts.length} {t("dashboard.active")}
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {alertsQuery.isLoading ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : alertsQuery.isError ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <div className="rounded-full border border-destructive/30 bg-destructive/10 p-3">
                      <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      {t("dashboard.connectionLost")}
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {t("dashboard.offlineAlertsBody")}
                    </p>
                    {lastReceivedAt ? (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {t("dashboard.lastReceived")}:{" "}
                        {new Date(lastReceivedAt).toLocaleTimeString()}
                      </p>
                    ) : null}
                  </div>
                ) : liveAlerts.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <div className="rounded-full border border-primary/20 bg-primary/5 p-3">
                      <Activity className="h-6 w-6 text-primary opacity-70" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {t("v2.noAlertsTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dashboard.riskLowDetail")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {liveAlerts.slice(0, 10).map((alert) => (
                      <div key={alert.id} className="p-4 transition-colors hover:bg-muted/30">
                        <div className="mb-1 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={alert.severity} />
                            <span className="font-mono text-sm font-semibold">{alert.motorName}</span>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {alert.createdAt
                              ? relativeTime(new Date(alert.createdAt))
                              : ""}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-foreground/80">
                          {fault(alert.faultType) ?? alert.faultType}
                          <StageBadge stage={alert.stage} />
                          {alert.confidence !== null ? ` · ${(alert.confidence * 100).toFixed(1)}%` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Live alert detail / decision engine */}
            <div className="col-span-1 flex flex-col gap-6 lg:col-span-2">
              <DecisionEngineStatus
                motor={alertMotor ? toLegacyMotor(alertMotor) : undefined}
                modelVersion={motorsOverviewQuery.data?.model_version}
              />
            </div>
          </div>

          {/* Recent fault episodes (V2 audit trail) */}
          <Card className="border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/50 p-6 pb-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <FileWarning className="h-5 w-5 text-primary" />
                {t("dash.episodes")}
              </h3>
              <Button asChild variant="ghost" className="h-8 px-2 text-xs text-emerald-300 hover:text-emerald-200">
                <Link href={ROUTES.faultLogs}>{t("dashboard.viewAll")}</Link>
              </Button>
            </div>
            <CardContent className="p-0">
              {faultsQuery.isLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : faultsQuery.isError ? (
                <div className="p-6">
                  <ApiErrorState message={t("dashboard.connectionLost")} />
                </div>
              ) : episodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <Activity className="mb-2 h-8 w-8 opacity-20" />
                  <p className="text-sm">{t("fl.noFaults")}</p>
                  <p className="mt-1 max-w-md text-xs">{t("fl.noFaultsDesc")}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {episodes.map((episode) => (
                    <Link
                      key={episode.id}
                      href={ROUTES.faultLogs}
                      className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {episode.taxonomyCode.replace(/\s\(.+\)$/, "")}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {episode.motorId} · {relativeTime(new Date(episode.detectedAt))}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {episode.fourSignalConfirmed ? (
                          <Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                            4/4 {t("fl.confirmed")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("fl.pending")}
                          </Badge>
                        )}
                        <StageBadge stage={episode.urgencyStage} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Real AI technician analysis for the highest-risk motor */}
          <AiAnalysisCard motorId={alertMotor?.motor_id ?? motors[0]?.motor_id} />
        </>
      )}
    </div>
  );
}
function StatCard({ title, value, subtitle, icon, alert }: { title: string, value: React.ReactNode, subtitle: string, icon: React.ReactNode, alert?: boolean }) {
  return (
    <Card className={`border-border bg-card ${alert ? 'border-destructive/50 shadow-[0_0_10px_rgba(255,42,42,0.1)]' : ''}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <div className={`p-2 rounded-md ${alert ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            {icon}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </CardContent>
    </Card>
  );
}
function HeartPulseIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  );
}
