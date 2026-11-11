import { useEffect } from "react";

/**
 * Sets the browser tab title for the current page, e.g.
 * "Dashboard · SIGMO". Re-runs whenever the translated title changes,
 * so switching the UI language updates the tab title too.
 */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    const trimmed = title?.trim();
    document.title = trimmed ? `${trimmed} · SIGMO` : "SIGMO";
  }, [title]);
}
