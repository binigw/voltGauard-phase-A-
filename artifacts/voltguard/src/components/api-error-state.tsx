import { AlertTriangle } from "lucide-react";

export function ApiErrorState({ message = "Unable to load live data." }: { message?: string }) {
  return (
    <div
      role="alert"
      className="flex min-h-24 items-center justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive"
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}