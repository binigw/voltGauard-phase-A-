import { Activity, Database, LoaderCircle } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiErrorState } from "@/components/api-error-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SigmoLivePayload } from "@/lib/sigmo-api";

type SigmoLiveViewProps = {
  title: string;
  endpoint: string;
  query: UseQueryResult<SigmoLivePayload, Error>;
  emptyMessage?: string;
};

function payloadSummary(payload: SigmoLivePayload): string {
  if (Array.isArray(payload)) {
    return `${payload.length} record${payload.length === 1 ? "" : "s"}`;
  }

  if (payload && typeof payload === "object") {
    return `${Object.keys(payload).length} response field${Object.keys(payload).length === 1 ? "" : "s"}`;
  }

  if (payload === null) {
    return "Empty response";
  }

  return "Scalar response";
}

function formatPayload(payload: SigmoLivePayload): string {
  if (payload === null) return "No payload returned by endpoint.";
  if (typeof payload === "string") return payload;

  const formatted = JSON.stringify(payload, null, 2);
  return formatted ?? "Response could not be formatted.";
}

export function SigmoLiveView({
  title,
  endpoint,
  query,
  emptyMessage = "No response data returned.",
}: SigmoLiveViewProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="font-mono text-[11px]">
              {endpoint}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          >
            LIVE
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {query.isLoading ? (
          <div className="space-y-3" aria-label={`Loading ${title}`}>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <ApiErrorState
            message={query.error.message || `Unable to load ${title}.`}
          />
        ) : query.data === undefined ? (
          <div className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
            <Database className="h-4 w-4" />
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {payloadSummary(query.data)}
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-border/60 bg-black/20 p-3 text-xs leading-5 text-foreground/90">
              {formatPayload(query.data)}
            </pre>
          </div>
        )}
        {query.isFetching && !query.isLoading ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Refreshing live data…
          </div>
        ) : null}

      </CardContent>
    </Card>
  );
}