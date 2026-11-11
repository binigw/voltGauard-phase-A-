import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Cpu,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiErrorState } from "@/components/api-error-state";
import { usePageTitle } from "@/lib/use-page-title";
import { DecisionEngineStatus } from "@/components/decision-engine-status";
import { useI18n } from "@/i18n";
import {
  useMotorsOverview,
  toLegacyMotor,
} from "@/lib/sigmo-motors";
import {
  fetchAlerts,
  fetchFaultLogs,
  fetchMotorHistory,
  fetchV2Health,
  type V2TrendsPayload,
} from "@/lib/sigmo-api";

/**
 * Operations Reports — live view over the Sigmo V2 backend.
 *
 * Every number on this page comes from a real /api/v2 endpoint:
 *   - GET /api/v2/motors            (registry + Decision Engine verdicts)
 *   - GET /api/v2/health            (service liveness: streaming, DB)
 *   - GET /api/v2/alerts            (operator alert inbox)
 *   - GET /api/v2/faults            (Section 10 fault episode audit trail)
 *   - GET /api/v2/motors/{id}/history (7-day telemetry windows)
 *
 * The page previously queried legacy /api/training-data, /api/system
 * and /api/analytics routes that do not exist on the V2 service —
 * every request 404'd for every signed-in role, which surfaced as
 * "Unable to load the live operations report." (The Machines page
 * masked the same gap behind its live V2 fallback.)
 */
/**
 * Display form of the backend stage_label: strips the "Stage N — "
 * policy prefix so technicians read the plain risk wording
 * ("Moderate Risk (Early-Stage Fault)"), never bare stage jargon.
 */
function riskLabel(stageLabel: string): string {
  return stageLabel.replace(/^Stage\s*\d+\s*[—–-]\s*/i, "");
}

export function Reports() {
  const { t, fault } = useI18n();
  usePageTitle(t("reports.title"));

  const motorsQuery = useMotorsOverview();
  const healthQuery = useQuery({
    queryKey: ["sigmo-v2", "health"],
    queryFn: ({ signal }) => fetchV2Health(signal),
    refetchInterval: 30000,
  });
  const alertsQuery = useQuery({
    queryKey: ["sigmo-v2", "alerts", "active"],
    queryFn: ({ signal }) => fetchAlerts(false, signal),
    refetchInterval: 30000,
  });
  const faultsQuery = useQuery({
    queryKey: ["sigmo-v2", "faults", "recent"],
    queryFn: ({ signal }) => fetchFaultLogs(null, 200, signal),
    refetchInterval: 30000,
  });

  const motors = motorsQuery.data?.motors ?? [];
  const motorIds = motors.map((entry) => entry.motor_id);
  // Bounded fan-out: 7-day telemetry history for the first few motors
  // only, so a large registry can never turn this page into a request
  // storm. One motor today (MTR-PILOT-01) means exactly one request.
  const historyQuery = useQuery({
    queryKey: ["sigmo-v2", "reports", "history-7d", motorIds.slice(0, 4).join(",")],
    enabled: motorIds.length > 0,
    queryFn: async ({ signal }) =>
      Promise.all(
        motorIds.slice(0, 4).map((motorId) => fetchMotorHistory(motorId, 168, 500, signal)),
      ),
    refetchInterval: 30000,
  });

  // The motors overview is the backbone of the page. An HTTP error OR
  // an unparseable 200 payload means the report genuinely cannot be
  // rendered — everything else degrades to honest "—" placeholders.
  const overviewBroken =
    motorsQuery.isError || (motorsQuery.isSuccess && motorsQuery.data === null);

  const healthValues = motors
    .map((entry) => entry.health_percent)
    .filter((value): value is number => typeof value === "number");
  const averageHealth = healthValues.length
    ? healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length
    : null;
  const motorsInFault = motors.filter((entry) => entry.is_fault);
  const openFaults = (faultsQuery.data?.faults ?? []).filter(
    (fault) => fault.resolvedAt === null,
  );
  const historyPoints = (historyQuery.data ?? []).flatMap(
    (payload: V2TrendsPayload) => payload.points,
  );
  const historyAverage = historyPoints.length
    ? historyPoints.reduce((sum, point) => sum + point.healthPercent, 0) / historyPoints.length
    : null;
  const latestMotor = [...motors].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
            <Cpu className="h-8 w-8 text-primary" />
            {t("reports.heading")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
      </div>

      {motorsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 w-full" />)}
        </div>
      ) : overviewBroken ? (
        <ApiErrorState message={t("reports.error")} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <ReportMetric
              icon={<Cpu className="h-5 w-5 text-primary" />}
              label={t("reports.metricMotors")}
              value={formatCount(motors.length)}
            />
            <ReportMetric
              icon={<Activity className="h-5 w-5 text-primary" />}
              label={t("reports.metricAvgHealth")}
              value={averageHealth == null ? "—" : `${averageHealth.toFixed(1)}%`}
            />
            <ReportMetric
              icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
              label={t("reports.metricActiveAlerts")}
              value={formatCount(alertsQuery.data?.totalActive)}
            />
            <ReportMetric
              icon={<ShieldAlert className="h-5 w-5 text-destructive" />}
              label={t("reports.metricOpenFaults")}
              value={formatCount(openFaults.length)}
            />
          </div>

          <DecisionEngineStatus
            motor={latestMotor ? toLegacyMotor(latestMotor) : undefined}
            modelVersion={motorsQuery.data?.model_version}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("reports.summaryTitle")}</CardTitle>
                <CardDescription>{t("reports.summaryDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <SummaryRow
                  label={t("reports.metricAvgHealth")}
                  value={averageHealth == null ? "—" : `${averageHealth.toFixed(1)}%`}
                />
                <SummaryRow
                  label={t("reports.rowStreaming")}
                  value={formatCount(healthQuery.data?.motors_streaming)}
                />
                <SummaryRow
                  label={t("reports.rowDbConnected")}
                  value={
                    healthQuery.data == null
                      ? "—"
                      : healthQuery.data.database_connected
                        ? t("reports.dbConnected")
                        : t("reports.dbDisconnected")
                  }
                />
                <SummaryRow
                  label={t("reports.metricActiveAlerts")}
                  value={formatCount(alertsQuery.data?.totalActive)}
                />
                <SummaryRow
                  label={t("reports.rowMotorsInFault")}
                  value={formatCount(motorsInFault.length)}
                />
                <SummaryRow
                  label={t("reports.metricOpenFaults")}
                  value={formatCount(openFaults.length)}
                />
                <SummaryRow
                  label={t("reports.rowTelemetryWindows")}
                  value={formatCount(historyPoints.length)}
                />
                <SummaryRow
                  label={t("reports.rowAvg7d")}
                  value={historyAverage == null ? t("reports.no7dData") : `${historyAverage.toFixed(1)}%`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("reports.verdictsTitle")}</CardTitle>
                <CardDescription>{t("reports.verdictsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {motors.map((motor) => (
                    <div
                      key={motor.motor_id}
                      className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-foreground">{motor.motor_id}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{riskLabel(motor.stage_label)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {motor.model_confidence == null
                            ? "—"
                            : `${Math.round(motor.model_confidence * 100)}%`}
                        </span>
                        <Badge variant={motor.is_fault ? "destructive" : "secondary"}>
                          {motor.predicted_class
                            ? (fault(motor.predicted_class) ?? motor.predicted_class)
                            : t("reports.awaitingVerdict")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {motors.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("reports.noMotorsYet")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("reports.motorReportTitle")}</CardTitle>
              <CardDescription>{t("reports.motorReportDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table aria-label={t("reports.motorReportTitle")} className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-black/20 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">{t("reports.colMotor")}</th>
                      <th className="px-6 py-3 font-medium">{t("reports.colHealth")}</th>
                      <th className="px-6 py-3 font-medium">{t("reports.colFaultLabel")}</th>
                      <th className="px-6 py-3 font-medium">{t("reports.colStage")}</th>
                      <th className="px-6 py-3 font-medium">{t("reports.colStatus")}</th>
                      <th className="px-6 py-3 font-medium">{t("reports.colUpdated")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {motors.map((motor) => (
                      <tr key={motor.motor_id} className="hover:bg-muted/20">
                        <td className="px-6 py-3 font-mono font-medium">{motor.motor_id}</td>
                        <td className="px-6 py-3 font-mono">
                          {motor.health_percent == null ? "—" : `${motor.health_percent}%`}
                        </td>
                        <td className="px-6 py-3">
                          {motor.predicted_class
                            ? (fault(motor.predicted_class) ?? motor.predicted_class)
                            : t("reports.noDecisionResult")}
                        </td>
                        <td className="px-6 py-3 text-xs">{riskLabel(motor.stage_label)}</td>
                        <td className={`px-6 py-3 font-semibold ${statusTextClass(motor.status)}`}>
                          {motor.status}
                        </td>
                        <td className="px-6 py-3 text-xs text-muted-foreground">
                          {motor.recorded_at ? new Date(motor.recorded_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {motors.length === 0 && (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("reports.noMotorsTable")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Gating status → text color. Bright emerald for healthy on the dark
 * surface (the dark-theme primary must never be used as text color);
 * destructive red is reserved for genuine fault conditions.
 */
function statusTextClass(status: string): string {
  if (status === "ANOMALY" || status === "INRUSH_SUPPRESSED") return "text-destructive";
  return "text-emerald-300";
}

function ReportMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className="rounded-md bg-primary/10 p-2">{icon}</div>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-black/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function formatCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}
