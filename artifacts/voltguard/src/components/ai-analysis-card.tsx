import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Languages,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import {
  AiExplanationApiError,
  fetchAiExplanation,
} from "@/lib/sigmo-api";

/**
 * AI Technician Analysis — the real-LLM bridge for field technicians.
 *
 * One explicit button (an LLM call costs money, so it is never
 * auto-fired on page load) sends the motor's live V2 evidence to
 * POST /api/v2/ai/explain and renders the bilingual result. The
 * section matching the operator's UI language comes FIRST; the other
 * language stays one click away behind a small toggle, so the card is
 * never bilingual-mismatched against the rest of the dashboard.
 * Honest states everywhere: 503 explains exactly which env var to
 * add on Render, failures offer a retry, and the response always
 * names its provider and model.
 */
export function AiAnalysisCard({
  motorId,
  contextLabel,
  className,
  titleKey = "ai.title",
}: {
  motorId?: string | null;
  contextLabel?: string;
  className?: string;
  titleKey?: string;
}) {
  const { t, language } = useI18n();
  const [result, setResult] = useState<{
    analysisAm: string;
    analysisEn: string;
    provider: string;
    model: string;
    elapsedMs: number | null;
  } | null>(null);
  // Secondary-language section of the last result (collapsed by
  // default; always reset when the UI language changes).
  const [showSecondary, setShowSecondary] = useState(false);
  useEffect(() => {
    setShowSecondary(false);
  }, [language]);

  const mutation = useMutation({
    mutationFn: (id: string) => fetchAiExplanation(id),
    onSuccess: (data) => {
      setResult({
        analysisAm: data.analysisAm,
        analysisEn: data.analysisEn,
        provider: data.provider,
        model: data.model,
        elapsedMs: data.elapsedMs,
      });
    },
  });

  const notConfigured =
    mutation.error instanceof AiExplanationApiError &&
    mutation.error.status === 503;

  return (
    <Card className={`border-primary/20 bg-card shadow-lg ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-emerald-300" />
          {t(titleKey)}
          {motorId ? (
            <Badge variant="outline" className="ml-auto font-mono text-xs">
              {motorId}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {t("ai.subtitle")}
          {contextLabel ? ` · ${contextLabel}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Idle / trigger */}
        {!mutation.isPending && !mutation.error && !result ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-emerald-400/30 bg-emerald-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <p className="max-w-xl text-sm text-muted-foreground">
                {t("ai.idleBody")}
              </p>
            </div>
            <Button
              onClick={() => motorId && mutation.mutate(motorId)}
              disabled={!motorId}
              className="shrink-0 border border-emerald-400/40 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25 hover:text-emerald-100"
              variant="outline"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("ai.run")}
            </Button>
          </div>
        ) : null}

        {/* Loading */}
        {mutation.isPending ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-400/25 bg-black/20 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("ai.loading")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("ai.loadingHint")}
                </p>
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {/* Error: not configured (503) */}
        {!mutation.isPending && notConfigured ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-100">
                  {t("ai.notConfiguredTitle")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                  {t("ai.notConfiguredBody")}
                </p>
                <code className="mt-2 block w-fit rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-amber-200">
                  OPENAI_API_KEY · DEEPSEEK_API_KEY · GEMINI_API_KEY
                </code>
              </div>
            </div>
          </div>
        ) : null}

        {/* Error: other failures */}
        {!mutation.isPending && mutation.error && !notConfigured ? (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("ai.failed")}
                </p>
                <p className="mt-1 max-w-2xl break-words text-xs text-muted-foreground">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : t("ai.failed")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-fit border-border"
              onClick={() => motorId && mutation.mutate(motorId)}
              disabled={!motorId}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("ai.retry")}
            </Button>
          </div>
        ) : null}

        {/* Result */}
        {!mutation.isPending && result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant="outline"
                className="border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              >
                <Bot className="mr-1 h-3 w-3" />
                {result.provider} · {result.model}
              </Badge>
              {result.elapsedMs != null ? (
                <span className="font-mono">
                  {(result.elapsedMs / 1000).toFixed(1)}s
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setShowSecondary((v) => !v)}
                aria-label={t("ai.otherLanguage")}
              >
                <Languages className="mr-1 h-3 w-3" />
                {language === "am" ? "English" : "አማርኛ"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                onClick={() => motorId && mutation.mutate(motorId)}
                disabled={!motorId}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                {t("ai.rerun")}
              </Button>
            </div>

            {/* Primary section: the operator's UI language first */}
            <section className="rounded-lg border border-border/70 bg-black/20 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">
                <Languages className="h-3.5 w-3.5" />
                {language === "am"
                  ? t("ai.amharicSection")
                  : t("ai.englishSection")}
              </h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {language === "am" ? result.analysisAm : result.analysisEn}
              </p>
            </section>

            {/* Secondary language stays available, one click away */}
            {showSecondary ? (
              <section className="rounded-lg border border-border/70 bg-black/20 p-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Languages className="h-3.5 w-3.5" />
                  {language === "am"
                    ? t("ai.englishSection")
                    : t("ai.amharicSection")}
                </h4>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {language === "am" ? result.analysisEn : result.analysisAm}
                </p>
              </section>
            ) : null}

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
              {t("ai.disclaimer")}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
