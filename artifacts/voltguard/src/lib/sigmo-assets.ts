/**
 * Motor asset registry types + live enrichment hook.
 *
 * The browser never holds the admin API key. Registry reads go
 * through the /api/motor-assets serverless function, which verifies
 * the caller's Supabase session and role server-side (technicians
 * get the list without the downtime-cost field) and proxies the
 * backend's admin endpoint with the server-held key.
 */

import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase-client";

export type DriveType = "DOL" | "SOFT_STARTER" | "VFD";

export interface MotorAsset {
  motor_id: string;
  mcc_panel_id: string;
  cabinet_number: string;
  line_zone_id: string;
  nameplate_kw: number;
  rated_rpm: number;
  drive_type: DriveType;
  asset_tag?: string | null;
  bearing_part_number?: string | null;
  spare_capacitor_spec?: string | null;
  downtime_cost_etb_per_hour?: number | null;
  baseline_state?: string | null;
}

/**
 * Commissioned assets (session-scoped, fail-soft). Returns [] when
 * signed out or on any error — the enrichment must never break the
 * pages that consume it.
 */
export async function fetchMotorAssets(
  signal?: AbortSignal,
): Promise<MotorAsset[]> {
  try {
    const { data: sessionData } = await getSupabase().auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return [];
    const response = await fetch("/api/motor-assets", {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.assets) ? payload.assets : [];
  } catch {
    return [];
  }
}

/** Shared registry query — drives the "Awaiting telemetry" rows. */
export function useMotorAssets() {
  return useQuery<MotorAsset[], Error>({
    queryKey: ["sigmo-v2", "motor-assets"],
    queryFn: ({ signal }) => fetchMotorAssets(signal),
    refetchInterval: 60000,
  });
}
