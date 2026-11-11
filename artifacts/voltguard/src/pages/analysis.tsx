import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BrainCircuit, Clock3, Cpu, Gauge, HeartPulse, Timer, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { ApiErrorState } from "@/components/api-error-state";
import { LiveEvidencePanel } from "@/components/live-evidence-panel";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useMotorsOverview } from "@/lib/sigmo-motors";
import { fetchMotorAssessment, fetchMotorHistory, fetchTechnicianView } from "@/lib/sigmo-api";

const UNAVAILABLE = "—";

/** Requested windows per range — bounded by the backend limit cap. */
const LIMIT_BY_HOURS: Record<string, number> = {
  "6": 500,
  "24": 500,
  "72": 800,
  "168": 1000,
  "720": 2000,
};

const RANGE_OPTIONS = ["6", "24", "72", "168", "720"] as const;

function num(v: number | null | undefined, digits = 2, suffix = ""): string {
  return typeof v === "number" && Number.isFinite(v)
    ? `${v.toFixed(digits)}${suffix}`
    : UNAVAILABLE;
}

function pct(v: number | null | undefined, digits = 1): string {
  return typeof v === "number" && Number.isFinite(v)
    ? `${(v * 100).toFixed(digits)}%`
    : UNAVAILABLE;
}

function fmtTime(iso: string | null | undefined, pattern: string): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? UNAVAILABLE : format(d, pattern);
}

export function Analysis() {
  const { t, fault } = useI18n();
  usePageTitle(t("an.title"));
  const [selectedMotorId, setSelectedMotorId] = useState<string>("");
  const [hours, setHours] = useState<string>("168");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const overviewQuery = useMotorsOverview();
  const motors = useMemo(
    () => overviewQuery.data?.motors ?? [],
    [overviewQuery.data],
  );
  const defaultMotorId = useMemo(() => {
    const alert = motors.find((m) => m.stage >= 2 || m.is_fault);
    return (alert ?? motors[0])?.motor_id ?? "";
  }, [motors]);
  const activeMotorId = selectedMotorId || defaultMotorId;

  const limit = LIMIT_BY_HOURS[hours] ?? 500;
  const historyQuery = useQuery({
    queryKey: ["sigmo-v2", "analysis", "history", activeMotorId, hours, limit],
    enabled: activeMotorId !== "",
    queryFn: ({ signal }) => fetchMotorHistory(activeMotorId, Number(hours), limit, signal),
    refetchInterval: 30000,
  });
  const assessmentQuery = useQuery({
    queryKey: ["sigmo-v2", "analysis", "assessment", activeMotorId],
    enabled: activeMotorId !== "",
    queryFn: ({ signal }) => fetchMotorAssessment(activeMotorId, signal),
    refetchInterval: 30000,
  });
  const technicianQuery = useQuery({
    queryKey: ["sigmo-v2", "analysis", "technician", activeMotorId],
    enabled: activeMotorId !== "",
    queryFn: ({ signal }) => fetchTechnicianView(activeMotorId, signal),
    refetchInterval: 30000,
  });

  const trends = historyQuery.data;
  const points = useMemo(() => trends?.points ?? [], [trends]);
  const chartData = useMemo(
    () =>
      points.map((p) => ({
        fullTime: fmtTime(p.recordedAt, "dd MMM yyyy · HH:mm"),
        formattedTime:
          Number(hours) <= 48
            ? fmtTime(p.recordedAt, "HH:mm")
            : fmtTime(p.recordedAt, "dd MMM HH:mm"),
        healthPercent: p.healthPercent,
        thdPercent: p.thdPercentMax,
      })),
    [points, hours],
  );

  const activeIdx =
    selectedIdx != null && selectedIdx < points.length
      ? selectedIdx
      : points.length - 1;
  const activeWindow = activeIdx >= 0 ? points[activeIdx] : null;
  const assessment = assessmentQuery.data;
  const noMotors = !overviewQuery.isLoading && motors.length === 0;
  const isLoading =
    overviewQuery.isLoading ||
    (activeMotorId !== "" &&
      (historyQuery.isLoading || assessmentQuery.isLoading));

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Activity className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              {t("an.title")}
            </h1>
            <Badge variant="outline" className="border-emerald-400/40 text-emerald-300">
              {t("an.auditMode")}
            </Badge>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {t("an.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2">
          <Select
            value={activeMotorId}
            onValueChange={(v) => {
              setSelectedMotorId(v);
              setSelectedIdx(null);
            }}
            disabled={motors.length === 0}
          >
            <SelectTrigger aria-label={t("an.selectMotor")} className="w-[190px] bg-background">
              <SelectValue placeholder={t("an.selectMotor")} />
            </SelectTrigger>
            <SelectContent>
              {motors.map((m) => (
                <SelectItem key={m.motor_id} value={m.motor_id}>
                  {m.motor_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={hours}
            onValueChange={(v) => {
              setHours(v);
              setSelectedIdx(null);
            }}
          >
            <SelectTrigger className="w-[150px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((h) => (
                <SelectItem key={h} value={h}>
                  {t(`analytics.range.${h}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Evidence summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <EvidenceStat
          label={t("an.windows")}
          value={points.length ? String(points.length) : UNAVAILABLE}
          icon={<Activity className="h-4 w-4 text-primary" />}
        />
        <EvidenceStat
          label={t("an.windowStart")}
          value={fmtTime(points[0]?.recordedAt, "dd MMM HH:mm")}
          icon={<Clock3 className="h-4 w-4 text-sky-300" />}
        />
        <EvidenceStat
          label={t("an.windowEnd")}
          value={fmtTime(points[points.length - 1]?.recordedAt, "dd MMM HH:mm")}
          icon={<Clock3 className="h-4 w-4 text-sky-300" />}
        />
        <EvidenceStat
          label={t("an.latestGate")}
          value={points[points.length - 1]?.status ?? UNAVAILABLE}
          icon={<Gauge className="h-4 w-4 text-amber-300" />}
        />
      </div>

      {/* Health & THD trend with window selection */}
      <Card className="border-border bg-card shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            {t("an.chart.title")}
            {trends ? (
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {trends.returned} {t("analytics.windows")} · {trends.modelVersion}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>{t("an.chart.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[340px] pt-4">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : noMotors ? (
            <EmptyState message={t("analytics.noMotors")} />
          ) : historyQuery.isError ? (
            <ApiErrorState message={t("analytics.error")} />
          ) : chartData.length === 0 ? (
            <EmptyState message={t("analytics.empty")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onClick={(state: { activeTooltipIndex?: number }) => {
                  if (
                    typeof state?.activeTooltipIndex === "number" &&
                    state.activeTooltipIndex >= 0
                  ) {
                    setSelectedIdx(state.activeTooltipIndex);
                  }
                }}
              >
                <defs>
                  <linearGradient id="anHealth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="formattedTime" stroke="hsl(var(--muted-foreground))" fontSize={12} tickMargin={10} minTickGap={30} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `${val}%`} />
                <Tooltip
                  content={({ active, payload }: {
                    active?: boolean;
                    payload?: Array<{ payload?: { fullTime?: string } }>;
                  }) =>
                    active && payload && payload.length ? (
                      <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-sm">
                        <p className="font-semibold text-foreground mb-2">
                          {payload[0]?.payload?.fullTime}
                        </p>
                        {payload.map((entry, index) => {
                          const item = (entry as unknown as { name?: string; value?: number; color?: string });
                          return (
                            <div key={index} className="flex items-center justify-between gap-4 mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-muted-foreground">{item.name}:</span>
                              </div>
                              <span className="font-mono text-foreground font-medium">
                                {typeof item.value === "number" ? item.value.toFixed(1) : UNAVAILABLE}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null
                  }
                />
                <Legend verticalAlign="top" height={36} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="healthPercent"
                  name={t("analytics.legend.health")}
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#anHealth)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="thdPercent"
                  name={t("analytics.legend.thd")}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Selected window evidence */}
      <Card className="border-border bg-card shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Waves className="h-4 w-4 text-primary" />
            {t("an.window.title")}
          </CardTitle>
          <CardDescription>
            {activeWindow
              ? `${t("an.window.desc")} · ${fmtTime(activeWindow.recordedAt, "dd MMM yyyy · HH:mm:ss")}`
              : t("analytics.empty")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeWindow ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <EvidenceCell label={t("an.f.verdict")} value={fault(activeWindow.predictedClass) ?? UNAVAILABLE} />
              <EvidenceCell label={t("an.f.confidence")} value={pct(activeWindow.modelConfidence)} />
              <EvidenceCell label={t("dashboard.health")} value={num(activeWindow.healthPercent, 1, "%")} />
              <EvidenceCell label={t("an.f.sigma")} value={num(activeWindow.zscoreMax, 2, " σ")} />
              <EvidenceCell label={t("analytics.legend.thd")} value={num(activeWindow.thdPercentMax, 2, "%")} />
              <EvidenceCell label={t("analytics.legend.unbalance")} value={num(activeWindow.unbalancePercent, 2, "%")} />
              <EvidenceCell label={t("analytics.legend.crest")} value={num(activeWindow.crestFactorMax, 3)} />
              <EvidenceCell label={t("analytics.legend.sideband")} value={num(activeWindow.rotorSidebandDbMax, 1, " dB")} />
              <EvidenceCell label={t("an.f.fundamental")} value={num(activeWindow.fundamentalHz, 2, " Hz")} />
              <EvidenceCell label={t("an.f.rmsA")} value={num(activeWindow.rmsA, 2, " A")} />
              <EvidenceCell label={t("an.f.rmsB")} value={num(activeWindow.rmsB, 2, " A")} />
              <EvidenceCell label={t("an.f.rmsC")} value={num(activeWindow.rmsC, 2, " A")} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("analytics.empty")}</p>
          )}
        </CardContent>
      </Card>

      {/* Dominant fault assessment */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-border bg-card shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="h-4 w-4 text-violet-300" />
              {t("an.assessment.title")}
            </CardTitle>
            <CardDescription>
              {t("an.assessment.desc")} · {assessment?.modelVersion ?? UNAVAILABLE}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assessmentQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : assessment?.fault ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant={assessment.fault.isFault ? "destructive" : "outline"}
                    className="font-mono"
                  >
                    {fault(assessment.fault.dominantFault)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {t("an.f.confidence")}:{" "}
                    <span className="font-mono text-foreground">
                      {pct(assessment.fault.confidence)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("an.assessment.source")}: {assessment.fault.source ?? UNAVAILABLE}
                  </span>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {t("an.assessment.probabilities")}
                  </p>
                  <div className="space-y-2">
                    {assessment.fault.probabilities.slice(0, 5).map(([name, p]) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-44 truncate font-mono text-xs text-muted-foreground" title={name}>
                          {fault(name)}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/30">
                          <div
                            className={p >= assessment.fault!.confidence ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-primary/30"}
                            style={{ width: `${Math.max(1, p * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right font-mono text-xs">
                          {pct(p)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {assessment.fault.temporal ? (
                  <div className="rounded-md border border-violet-400/20 bg-violet-400/5 p-3 text-xs">
                    <p className="uppercase tracking-[0.14em] text-muted-foreground">
                      {t("an.assessment.temporal")}
                    </p>
                    <p className="mt-1 font-mono text-violet-200">
                      {fault(assessment.fault.temporal.aggregatedClass ?? UNAVAILABLE)}{" "}
                      · {t("an.assessment.voteShare")} {pct(assessment.fault.temporal.voteShare)}{" "}
                      · {t("an.assessment.windowsBuffered")} {assessment.fault.temporal.windowsBuffered}
                      {assessment.fault.temporal.stable ? ` · ${t("an.assessment.stable")}` : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("an.assessment.none")}</p>
            )}
          </CardContent>
        </Card>

        {/* RUL (deterministic Section 14) */}
        <Card className="border-border bg-card shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-primary" />
              {t("an.rul.title")}
            </CardTitle>
            <CardDescription>{t("an.rul.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {assessmentQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : assessment?.rul ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border/60 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("an.rul.estimate")}
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                    {assessment.rul.estimate}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {assessment.rul.status}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <EvidenceCell label={t("an.rul.slope")} value={num(assessment.rul.slopeSigmaPerDay, 4, " σ/day")} />
                  <EvidenceCell label={t("an.rul.trendWindow")} value={num(assessment.rul.trendWindowDays, 1, " d")} />
                  <EvidenceCell label={t("an.rul.trendPoints")} value={String(assessment.rul.trendPoints)} />
                  <EvidenceCell label={t("an.rul.lastWindow")} value={fmtTime(assessment.rul.lastWindowAt, "dd MMM HH:mm")} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {assessment?.rulUnavailableReason ?? t("an.assessment.none")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Decision authority */}
      <Card className="border-border bg-card shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4 text-violet-300" />
            {t("an.pipeline.title")}
          </CardTitle>
          <CardDescription>{t("an.pipeline.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border border-violet-400/20 bg-violet-400/5 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("an.pipeline.core")}
            </p>
            <p className="mt-1 font-mono text-xs text-violet-200">
              IF Gate (Cold-Start) → XGBoost v6c · 13-Class → Stage Engine 1-4 → RUL
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Live spectral evidence (Section 6.b technician payload) */}
      {activeMotorId ? (
        <LiveEvidencePanel query={technicianQuery} motorId={activeMotorId} />
      ) : null}
    </div>
  );
}

function EvidenceStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="mt-2 truncate font-mono text-sm text-foreground" title={value}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EvidenceCell({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border/70 bg-black/15 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-xs text-foreground ${mono ? "font-mono" : ""}`} title={value}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-black/20 text-muted-foreground">
      <Activity className="mb-2 h-8 w-8 opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
