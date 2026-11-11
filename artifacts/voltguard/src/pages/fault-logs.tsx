import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Languages,
  Lock,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { ApiErrorState } from "@/components/api-error-state";
import { DecisionEngineStatus } from "@/components/decision-engine-status";
import { AiAnalysisCard } from "@/components/ai-analysis-card";
import { StageBadge } from "@/components/ui/badges";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useMotorsOverview, toLegacyMotor } from "@/lib/sigmo-motors";
import { fetchFaultLogs, fetchTechnicianView, type V2FaultLog } from "@/lib/sigmo-api";

const UNAVAILABLE = "—";

function num(v: unknown, digits = 2, suffix = ""): string {
  return typeof v === "number" && Number.isFinite(v)
    ? `${v.toFixed(digits)}${suffix}`
    : UNAVAILABLE;
}

function listNum(v: unknown, digits = 1, suffix = ""): string {
  return Array.isArray(v) && v.every((x) => typeof x === "number")
    ? (v as number[]).map((x) => x.toFixed(digits)).join(" / ") + suffix
    : UNAVAILABLE;
}

function fmtFull(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? UNAVAILABLE
    : format(d, "yyyy-MM-dd HH:mm:ss");
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? UNAVAILABLE
    : formatDistanceToNow(d, { addSuffix: true });
}

/** "Stage 2 BPFO ... (evidence)" -> "Stage 2 BPFO ..." */
function taxonomyName(code: string): string {
  const idx = code.lastIndexOf(" (");
  return idx > 0 ? code.slice(0, idx) : code;
}

export function FaultLogs() {
  const { t, language } = useI18n();
  usePageTitle(t("fl.title"));
  // Repair-protocol display language: follows the global UI language;
  // the in-card toggle only overrides it for this card (null = follow).
  const [protocolLangOverride, setProtocolLangOverride] = useState<
    "en" | "am" | null
  >(null);
  const protocolLang = protocolLangOverride ?? language;
  useEffect(() => {
    setProtocolLangOverride(null);
  }, [language]);
  const [motorFilter, setMotorFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const overviewQuery = useMotorsOverview();
  const motors = useMemo(
    () => overviewQuery.data?.motors ?? [],
    [overviewQuery.data],
  );

  const faultsQuery = useQuery({
    queryKey: ["sigmo-v2", "faults", motorFilter],
    queryFn: ({ signal }) =>
      fetchFaultLogs(motorFilter === "all" ? null : motorFilter, 200, signal),
    refetchInterval: 30000,
  });
  const faultRecords = useMemo(
    () => faultsQuery.data?.faults ?? [],
    [faultsQuery.data],
  );

  // Auto-select the most recent incident
  useEffect(() => {
    if (faultRecords.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (selectedId === null || !faultRecords.some((f) => f.id === selectedId)) {
      setSelectedId(faultRecords[0].id);
    }
  }, [faultRecords, selectedId]);

  const selectedFault: V2FaultLog | null =
    faultRecords.find((f) => f.id === selectedId) ?? null;
  const selectedOverviewMotor = selectedFault
    ? motors.find((m) => m.motor_id === selectedFault.motorId)
    : undefined;
  const technicianQuery = useQuery({
    queryKey: ["sigmo-v2", "faults", "technician", selectedFault?.motorId],
    enabled: Boolean(selectedFault),
    queryFn: ({ signal }) =>
      fetchTechnicianView(selectedFault!.motorId, signal),
    refetchInterval: 30000,
  });

  const ev = selectedFault?.spectralEvidence ?? {};
  const breaches = Array.isArray(ev["absolute_threshold_breaches"])
    ? (ev["absolute_threshold_breaches"] as string[])
    : [];
  const technician = technicianQuery.data as Record<string, unknown> | null;
  const protocol =
    technician && typeof technician["amharic_repair_protocol"] === "string"
      ? (technician["amharic_repair_protocol"] as string)
      : null;
  const protocolEn =
    technician && typeof technician["repair_protocol_en"] === "string"
      ? (technician["repair_protocol_en"] as string)
      : null;
  const tools =
    technician &&
    typeof technician["required_tools_and_spares"] === "object" &&
    technician["required_tools_and_spares"] !== null
      ? (technician["required_tools_and_spares"] as Record<string, unknown>)
      : null;
  const toolItems = Array.isArray(tools?.["items"])
    ? (tools!["items"] as string[])
    : [];
  const toolItemsEn = Array.isArray(tools?.["items_en"])
    ? (tools!["items_en"] as string[])
    : [];
  // The UI language decides the display edition; the Amharic rulebook
  // stays canonical. Honest fallback: if the English edition is not
  // available (older backend), the canonical protocol is shown.
  const displayProtocol =
    protocolLang === "en" ? (protocolEn ?? protocol) : protocol;
  const displayToolItems =
    protocolLang === "en" && toolItemsEn.length > 0 ? toolItemsEn : toolItems;

  const fourSignals = selectedFault
    ? [
        {
          label: t("fl.fourSignal.sigma"),
          ok: selectedFault.populationSigma > 5.0,
          value: `${selectedFault.populationSigma.toFixed(2)} σ`,
        },
        {
          label: t("fl.fourSignal.threshold"),
          ok: selectedFault.absoluteThresholdBreached,
          value: breaches.length ? breaches.join(", ") : t("fl.fourSignal.none"),
        },
        {
          label: t("fl.fourSignal.confidence"),
          ok: selectedFault.modelConfidence > 0.7,
          value: `${(selectedFault.modelConfidence * 100).toFixed(1)}%`,
        },
        {
          label: t("fl.fourSignal.trend"),
          ok: selectedFault.trendConfirmed,
          value: selectedFault.trendConfirmed
            ? t("fl.fourSignal.confirmed")
            : t("fl.fourSignal.pending"),
        },
      ]
    : [];

  const isLoading = faultsQuery.isLoading || overviewQuery.isLoading;

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex flex-wrap items-center gap-3">
            <FileWarning className="h-8 w-8 text-primary" />
            {t("fl.title")}
            <Badge
              variant="outline"
              className="gap-1.5 border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground"
              title={t("alerts.immutabilityNote")}
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              {t("fl.immutable")}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            {t("fl.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
          <Select value={motorFilter} onValueChange={setMotorFilter}>
            <SelectTrigger className="w-[190px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("fl.allMotors")}</SelectItem>
              {motors.map((m) => (
                <SelectItem key={m.motor_id} value={m.motor_id}>
                  {m.motor_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 flex-1 min-h-0">
        {/* Left column: incident list */}
        <Card className="col-span-1 border-border bg-card flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="border-b border-border bg-card/50 py-4">
            <CardTitle className="text-lg flex items-center gap-2">
              {t("fl.incidentHistory")}
              {faultsQuery.data ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {faultsQuery.data.returned}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {isLoading ? (
              <div className="space-y-4 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : faultsQuery.isError ? (
              <ApiErrorState message={t("fl.error")} />
            ) : faultRecords.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <ShieldCheck className="mx-auto mb-3 h-10 w-10 opacity-20" />
                <p className="text-sm font-medium text-foreground">
                  {t("fl.noFaults")}
                </p>
                <p className="mt-2 text-xs">{t("fl.noFaultsDesc")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {faultRecords.map((fault) => (
                  <button
                    key={fault.id}
                    onClick={() => setSelectedId(fault.id)}
                    className={`w-full p-4 text-left transition-colors hover:bg-muted/50 ${
                      selectedId === fault.id
                        ? "border-l-2 border-primary bg-muted/80"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span
                        className="truncate font-medium text-foreground"
                        title={fault.taxonomyCode}
                      >
                        {taxonomyName(fault.taxonomyCode)}
                      </span>
                      <StageBadge
                        stage={fault.urgencyStage}
                        className="shrink-0"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{fault.motorId}</span>
                      <span>{fmtRelative(fault.detectedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      {fault.resolvedAt ? (
                        <span className="text-emerald-300">✓ {t("fl.resolved")}</span>
                      ) : (
                        <span className="text-amber-300">● {t("fl.open")}</span>
                      )}
                      {fault.fourSignalConfirmed ? (
                        <span className="text-emerald-300">· 4/4 {t("fl.confirmed")}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          · {t("fl.pending")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: incident detail */}
        <div className="col-span-1 flex flex-col gap-6 lg:col-span-2 lg:overflow-y-auto">
          {!selectedFault ? (
            <Card className="border-border bg-card flex-1">
              <CardContent className="flex h-full min-h-[300px] flex-col items-center justify-center text-muted-foreground">
                <AlertTriangle className="mb-4 h-12 w-12 opacity-20" />
                <p className="text-sm">{t("fl.selectHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header + four-signal confirmation */}
              <Card className="border-border bg-card shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">
                        {`FLT-${selectedFault.id.toString().padStart(4, "0")}`}
                        <span className="ml-3 font-mono text-sm font-normal text-muted-foreground">
                          {selectedFault.motorId}
                        </span>
                      </CardTitle>
                      <CardDescription className="mt-1 font-mono text-xs">
                        {t("fl.detected")} {fmtFull(selectedFault.detectedAt)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StageBadge stage={selectedFault.urgencyStage} />
                      {selectedFault.fourSignalConfirmed ? (
                        <Badge className="border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {t("fl.confirmed")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t("fl.pending")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="pt-2 text-sm text-foreground/90">
                    {taxonomyName(selectedFault.taxonomyCode)}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {t("fl.fourSignal.title")}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fourSignals.map((signal) => (
                      <div
                        key={signal.label}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-black/15 p-2.5 text-xs"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {signal.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                          )}
                          {signal.label}
                        </span>
                        <span className="truncate font-mono text-foreground" title={signal.value}>
                          {signal.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    {selectedFault.physicallyVerified
                      ? `${t("fl.physicallyVerified")}${selectedFault.verifiedBy ? ` · ${selectedFault.verifiedBy}` : ""}`
                      : t("fl.notVerified")}
                  </p>
                </CardContent>
              </Card>

              {/* Live motor state */}
              <DecisionEngineStatus
                motor={selectedOverviewMotor ? toLegacyMotor(selectedOverviewMotor) : undefined}
                modelVersion={overviewQuery.data?.model_version}
              />

              {/* Spectral evidence */}
              <Card className="border-border bg-card shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                    {t("fl.evidence.title")}
                  </CardTitle>
                  <CardDescription>{t("fl.evidence.desc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <EvidenceCell label={t("analytics.legend.thd")} value={num(ev["thd_percent_max"], 2, "%")} />
                    <EvidenceCell label={t("analytics.legend.unbalance")} value={num(ev["current_unbalance_percent"], 2, "%")} />
                    <EvidenceCell label={t("analytics.legend.crest")} value={num(ev["crest_factor_max"], 3)} />
                    <EvidenceCell label={t("analytics.legend.sideband")} value={num(ev["rotor_sideband_db_max"], 1, " dB")} />
                    <EvidenceCell label={t("an.f.fundamental")} value={num(ev["fundamental_hz"], 2, " Hz")} />
                    <EvidenceCell label={t("an.f.sigma")} value={num(ev["zscore_max"], 2, " σ")} />
                    <EvidenceCell label={t("fl.evidence.envelope")} value={listNum(ev["envelope_peak_hz"], 1, " Hz")} />
                    <EvidenceCell label={t("fl.evidence.sidebandPhases")} value={listNum(ev["rotor_sideband_db"], 1, " dB")} />
                  </div>
                  {breaches.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {breaches.map((b) => (
                        <Badge
                          key={b}
                          variant="outline"
                          className="border-destructive/50 bg-destructive/10 text-destructive"
                        >
                          {b}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Repair protocol (follows the UI language) + tools */}
              <Card className="border-border bg-card shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-primary" />
                    {t("fl.protocol.title")}
                    {displayProtocol ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setProtocolLangOverride(
                            protocolLang === "en" ? "am" : "en",
                          )
                        }
                        aria-label={t("fl.protocol.switch")}
                      >
                        <Languages className="mr-1 h-3 w-3" />
                        {protocolLang === "en" ? "አማርኛ" : "English"}
                      </Button>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{t("fl.protocol.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {technicianQuery.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : displayProtocol ? (
                    <div className="whitespace-pre-wrap rounded-md border border-border/70 bg-black/20 p-4 text-sm leading-relaxed text-foreground/90">
                      {displayProtocol}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("fl.protocol.none")}
                    </p>
                  )}
                  {displayToolItems.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {t("fl.tools.title")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {displayToolItems.map((item) => (
                          <Badge
                            key={item}
                            variant="outline"
                            className="border-emerald-400/30 text-emerald-300"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                      {typeof tools?.["asset_bearing_part_number"] === "string" ? (
                        <p className="mt-3 font-mono text-xs text-muted-foreground">
                          {t("fl.tools.bearing")}: {tools["asset_bearing_part_number"]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-black/15 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
