import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import { Activity, Gauge, ShieldAlert, Waves } from "lucide-react";
import { format } from "date-fns";
import { ApiErrorState } from "@/components/api-error-state";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useMotorsOverview } from "@/lib/sigmo-motors";
import { fetchMotorHistory } from "@/lib/sigmo-api";

/** Requested windows per range — bounded by the backend limit cap. */
const LIMIT_BY_HOURS: Record<string, number> = {
  "6": 500,
  "12": 500,
  "24": 500,
  "72": 800,
  "168": 1000,
  "720": 2000,
};

const RANGE_OPTIONS = ["6", "12", "24", "72", "168", "720"] as const;

/** Tooltip unit per dataKey — keeps localization out of number parsing. */
const UNIT_BY_DATA_KEY: Record<string, string> = {
  healthPercent: "%",
  confidencePercent: "%",
  thdPercent: "%",
  unbalancePercent: "%",
  sidebandDb: " dB",
  crestFactor: "",
};

export function Analytics() {
  const { t } = useI18n();
  usePageTitle(t("analytics.title"));
  const [selectedMotorId, setSelectedMotorId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("168");

  const overviewQuery = useMotorsOverview();
  const motors = useMemo(
    () => overviewQuery.data?.motors ?? [],
    [overviewQuery.data],
  );

  // Default to the highest-risk motor (same precedence as the dashboard
  // alert card); the user's explicit pick always wins.
  const defaultMotorId = useMemo(() => {
    const alert = motors.find((m) => m.stage >= 2 || m.is_fault);
    return (alert ?? motors[0])?.motor_id ?? "";
  }, [motors]);
  const activeMotorId = selectedMotorId || defaultMotorId;

  const hours = Number.parseInt(timeRange, 10);
  const limit = LIMIT_BY_HOURS[timeRange] ?? 500;

  const historyQuery = useQuery({
    queryKey: ["sigmo-v2", "trends", activeMotorId, hours, limit],
    queryFn: ({ signal }) =>
      fetchMotorHistory(activeMotorId, hours, limit, signal),
    enabled: activeMotorId !== "",
    refetchInterval: 30000,
  });

  const isLoading = overviewQuery.isLoading || (activeMotorId !== "" && historyQuery.isLoading);
  const isError =
    overviewQuery.isError ||
    (activeMotorId !== "" && activeMotorId === defaultMotorId && historyQuery.isError);
  const trends = historyQuery.data;

  const chartData = useMemo(() => {
    return (trends?.points ?? []).map((p) => ({
      formattedTime:
        hours <= 48
          ? safeFormat(p.recordedAt, "HH:mm")
          : safeFormat(p.recordedAt, "dd MMM HH:mm"),
      fullTime: safeFormat(p.recordedAt, "dd MMM yyyy · HH:mm"),
      healthPercent: p.healthPercent,
      confidencePercent:
        p.modelConfidence == null ? null : p.modelConfidence * 100,
      thdPercent: p.thdPercentMax,
      unbalancePercent: p.unbalancePercent,
      sidebandDb: p.rotorSidebandDbMax,
      crestFactor: p.crestFactorMax,
    }));
  }, [trends, hours]);

  const noMotors = !isLoading && motors.length === 0;

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" />
            {t("analytics.title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("analytics.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-card p-2 rounded-lg border border-border">
          <Select
            value={activeMotorId}
            onValueChange={setSelectedMotorId}
            disabled={motors.length === 0}
          >
            <SelectTrigger aria-label={t("analytics.selectMotor")} className="w-[190px] bg-background border-border">
              <SelectValue placeholder={t("analytics.selectMotor")} />
            </SelectTrigger>
            <SelectContent>
              {motors.map((m) => (
                <SelectItem key={m.motor_id} value={m.motor_id}>
                  {m.motor_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger aria-label={t("analytics.selectRange")} className="w-[150px] bg-background border-border">
              <SelectValue placeholder={t("analytics.selectRange")} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health Index & Fault Confidence */}
        <Card className="col-span-1 lg:col-span-2 border-border bg-card shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {t("analytics.health.title")}
              {trends ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {trends.returned} {t("analytics.windows")} · {trends.modelVersion}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>{t("analytics.health.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 h-[350px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : noMotors ? (
              <EmptyChartState message={t("analytics.noMotors")} />
            ) : isError ? (
              <ApiErrorState message={t("analytics.error")} />
            ) : chartData.length === 0 ? (
              <EmptyChartState message={t("analytics.empty")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHealth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="hsl(var(--muted-foreground))" fontSize={12} tickMargin={10} minTickGap={30} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="healthPercent"
                    name={t("analytics.legend.health")}
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorHealth)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="confidencePercent"
                    name={t("analytics.legend.confidence")}
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Power Quality — THD & Unbalance */}
        <Card className="col-span-1 border-border bg-card shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-[hsl(var(--chart-2))]" />
              {t("analytics.pq.title")}
            </CardTitle>
            <CardDescription>{t("analytics.pq.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 h-[300px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : noMotors ? (
              <EmptyChartState message={t("analytics.noMotors")} />
            ) : isError ? (
              <ApiErrorState message={t("analytics.error")} />
            ) : chartData.length === 0 ? (
              <EmptyChartState message={t("analytics.empty")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="hsl(var(--muted-foreground))" fontSize={12} minTickGap={30} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `${val}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="thdPercent"
                    name={t("analytics.legend.thd")}
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="unbalancePercent"
                    name={t("analytics.legend.unbalance")}
                    stroke="hsl(var(--chart-5))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Rotor Sideband & Crest Factor */}
        <Card className="col-span-1 border-border bg-card shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-[hsl(var(--chart-4))]" />
              {t("analytics.mech.title")}
            </CardTitle>
            <CardDescription>{t("analytics.mech.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 h-[300px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : noMotors ? (
              <EmptyChartState message={t("analytics.noMotors")} />
            ) : isError ? (
              <ApiErrorState message={t("analytics.error")} />
            ) : chartData.length === 0 ? (
              <EmptyChartState message={t("analytics.empty")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="hsl(var(--muted-foreground))" fontSize={12} minTickGap={30} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `${val} dB`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="sidebandDb"
                    name={t("analytics.legend.sideband")}
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="crestFactor"
                    name={t("analytics.legend.crest")}
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-black/20">
      <Activity className="h-8 w-8 mb-2 opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// Custom Tooltip for Recharts — units come from the dataKey map, so the
// number formatting stays correct in every language.
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const full = payload.find((entry: any) => entry?.payload?.fullTime);
    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-xl text-sm">
        <p className="font-semibold text-foreground mb-2">
          {full?.payload?.fullTime ?? label}
        </p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
            </div>
            <span className="font-mono text-foreground font-medium">
              {formatSeriesValue(entry.dataKey, entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function formatSeriesValue(dataKey: string, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const unit = UNIT_BY_DATA_KEY[dataKey] ?? "";
  return `${value.toFixed(1)}${unit}`;
}

function safeFormat(iso: string, pattern: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : format(date, pattern);
}
