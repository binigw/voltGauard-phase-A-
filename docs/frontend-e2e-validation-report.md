# VoltGuard AI Frontend E2E Validation Report

**Validation date:** 2026-08-13  
**Scope:** Validate the existing VoltGuard frontend against the live API and runtime Decision Engine without redesigning or replacing the UI/UX.

## Executive summary

The existing frontend is connected to the live API for its primary operational views. Dashboard, Machines, Alerts, Fault Logs, Analytics, and Settings rendered successfully against live backend data. The API returned live motor health, status, THD, vibration/acoustic values, alert records, fault records, and analytics telemetry. The frontend workflow and API workflow both remained healthy during validation.

Four integration issues were fixed without changing the visual direction:

1. Dashboard motor sparklines now use `/api/analytics/trends?hours=24` instead of randomly generated values.
2. Live operational queries now refresh every 30 seconds, including motors, alerts, faults, analytics trends, system summary, personnel, and notification status.
3. Main data views now expose a visible API error state instead of silently rendering an empty/partial view. The sidebar system indicator also reflects the live summary and changes to **Attention Required** when stopped motors or high-priority alerts exist.
4. The OpenAPI `TelemetryResult` contract and generated client/server schemas now include the extended Decision Engine fields already returned by `POST /api/telemetry/update`.

One requested surface is not present in the existing product: `/reports` has no route or Reports page. It was documented as a gap and was not added because this validation was explicitly limited to the existing UI.

## Page and endpoint validation

| Page | Live API bindings verified | Loading / empty / error handling | Result |
|---|---|---|---|
| Dashboard `/` | `GET /api/system/summary`, `GET /api/motors`, `GET /api/alerts/live`, `GET /api/faults`, `GET /api/analytics/trends?hours=24`; fault re-analysis uses `POST /api/faults/:id/analyze` | Skeleton/loading states, existing empty states, and visible API error states | **Pass** |
| Machines `/machines` | `GET /api/motors`; CRUD bindings present for motor registration, update, and delete | Loading, empty, and visible API error states | **Pass** |
| Alerts `/alerts` | `GET /api/alerts`; acknowledge action uses `POST /api/alerts/:id/acknowledge` | Loading, filter-empty, and visible API error states | **Pass** |
| Fault Logs `/fault-logs` | `GET /api/faults`; re-analysis uses `POST /api/faults/:id/analyze` | Loading, empty, and visible API error states | **Pass** |
| Analytics `/analytics` | `GET /api/motors`; `GET /api/analytics/trends` with selected motor and hour range | Loading, no-data empty state, and visible API error states | **Pass** |
| Settings `/settings` | `GET /api/personnel`, `GET /api/notifications/status`; notification registration/removal bindings present | Personnel loading state and existing configuration/unsupported states; status refreshes live | **Pass** |
| Reports `/reports` | No frontend route or page exists | Not applicable | **Gap: missing route/page** |

All requested existing pages rendered with the current visual design. No replacement dashboard, new navigation item, or visual redesign was introduced.

## API endpoint validation

| Endpoint | Check | Result |
|---|---|---|
| `GET /api/healthz` | API health | **200 / Pass** |
| `GET /api/system/summary` | Dashboard KPI and sidebar status data | **200 / Pass** |
| `GET /api/motors` | Dashboard, Machines, Analytics, and Settings-related motor data | **200 / Pass** |
| `POST /api/telemetry/update` | Decision Engine response and persisted motor/telemetry projections | **200 / Pass; 400 validation cases also confirmed** |
| `GET /api/analytics/trends?hours=24` | Dashboard sparklines and Analytics charts | **200 / Pass** |
| `GET /api/alerts/live` | Dashboard live alert panel and sidebar badge | **200 / Pass** |
| `GET /api/alerts?acknowledged=false` | Alerts list and severity/acknowledgement filtering | **200 / Pass** |
| `POST /api/alerts/:id/acknowledge` | Existing acknowledge mutation binding | **Source-checked; not repeated against live data to avoid altering validation records** |
| `GET /api/faults` | Dashboard analysis selection and Fault Logs | **200 / Pass** |
| `POST /api/faults/:id/analyze` | Existing re-analysis mutation binding | **Source-checked; not repeated against live data to avoid altering validation records** |
| `GET /api/personnel` | Settings technician selector | **200 / Pass** |
| `GET /api/notifications/status` | Settings notification integration status | **200 / Pass** |
| Motor/personnel CRUD endpoints | Existing form mutation bindings | **Source-checked; not repeated against live data to avoid creating/deleting records** |

## Decision Engine field verification

The telemetry runtime response was checked directly through the live API. Existing list endpoints and pages consume the fields that are persisted by the current schema:

| Runtime field | Backend result | Existing frontend path | Result |
|---|---|---|---|
| `healthScore` | Returned by telemetry runtime and persisted to motors/faults/telemetry | Dashboard, Machines, Fault Logs, Analytics | **Pass** |
| `anomalyScore` | Returned by telemetry runtime and persisted to motors/faults/telemetry | Motor health/risk values, Fault Logs, Analytics | **Pass** |
| `anomalyDetected` | Returned by telemetry runtime | No existing component consumes the update response directly | **Not surfaced in existing UI** |
| `nextLogIntervalSeconds` | Returned by telemetry runtime; 60s normal / 5s anomaly in tested responses | No existing component consumes the update response directly | **Not surfaced in existing UI** |
| `severity` | Returned by telemetry runtime and mapped to persisted alert/fault severity | Alerts and Fault Logs | **Pass for persisted projections** |
| `message` | Returned by telemetry runtime and persisted as alert message when an alert is created | Dashboard Live Alerts and Alerts | **Pass for alert-producing scenarios** |
| `faultLabel` | Returned from the Decision Engine; persisted as `faultType` for alerts/fault logs | Alerts and Fault Logs display the persisted fault type | **Pass** |
| `faultConfidence` | Returned by `POST /api/telemetry/update`; now included in the generated `TelemetryResult` contract | No existing list endpoint or component consumes this response field | **Contract fixed; not surfaced in existing UI** |
| `mlActive` | Returned by `POST /api/telemetry/update`; now included in the generated `TelemetryResult` contract | No existing frontend telemetry-ingest component consumes it | **Contract fixed; not surfaced in existing UI** |
| `emergencyTrip` / relay status | Returned by telemetry runtime; `relayTripped` is used by the separate training-ingest acknowledgement | No existing operational page binds the telemetry update response to a relay-status display | **Backend verified; not surfaced in existing UI** |
| `overrideFired` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing list endpoint or component consumes it | **Contract fixed; not surfaced in existing UI** |
| `overrideReason` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing list endpoint or component consumes it | **Contract fixed; not surfaced in existing UI** |
| `ifAnomalyScore` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |
| `rfTopClass` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |
| `xgbTopClass` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |
| `modelsAgreed` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |
| `originalMlClass` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |
| `originalMlConf` | Returned by telemetry runtime; now included in the generated `TelemetryResult` contract | No existing component consumes it | **Contract fixed; not surfaced in existing UI** |

These fields are available and correct at the backend runtime boundary, and the generated contract now matches the response. The current frontend still has no telemetry-ingestion screen or persisted response endpoint through which to display them. They were not faked, remapped, or hidden behind fallback values.

The existing Fault Logs label **AI Confidence Index** is backed by the API's `anomalyScore`, as documented in the generated API schema. It is not the same field as Decision Engine `faultConfidence`.

## Live telemetry scenario results

The following scenarios were posted to `POST /api/telemetry/update` and the JSON response was inspected. The runtime logs also confirmed the XGBoost-primary, RF-shadow, Isolation-Forest-gate architecture and fail-safe rule overrides.

| Scenario | HTTP | `faultLabel` | `faultConfidence` | `healthScore` | `mlActive` | `emergencyTrip` | `overrideFired` | `overrideReason` |
|---|---:|---|---:|---:|---|---|---|---|
| Healthy | 200 | Normal | 0.500 | 93 | true | false | false | empty |
| Bearing Wear | 200 | Bearing Wear | 0.500 | 90 | true | false | true | `sensor_threshold_rule_engine_override` |
| High THD | 200 | High THD | 0.792 | 89 | true | false | true | `sensor_threshold_rule_engine_override` |
| High Vibration | 200 | High Vibration | 0.500 | 86 | true | false | true | `sensor_threshold_rule_engine_override` |
| Phase Imbalance | 200 | Phase Imbalance | 0.500 | 88 | true | false | true | `sensor_threshold_rule_engine_override` |
| Overcurrent | 200 | Overcurrent | 0.500 | 94 | true | false | true | `sensor_threshold_rule_engine_override` |
| Multi-fault / emergency | 200 | Overcurrent | 1.000 | 0 | true | true | true | `relay_threshold_rule_engine_override` |
| Missing sensor field (`db`) | 400 | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Validation error |
| Invalid sensor value (`thd: "not-a-number"`) | 400 | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Validation error |
| Extreme / out-of-range values | 200 | Overcurrent | 1.000 | 0 | true | true | true | `relay_threshold_rule_engine_override` |

The 400 cases were rejected before inference, preserving sensor-input fail-safe behavior. Extreme values produced the expected emergency-trip response rather than a silent fallback.

## Loading, empty, error, polling, and browser checks

- Frontend typecheck passed:
  - `pnpm --filter @workspace/voltguard run typecheck`
- `git diff --check` passed.
- Frontend workflow restarted successfully and remained running.
- API workflow remained running and returned 200 or 304 responses for the page data requests.
- Browser logs contained only normal Vite connection and React DevTools messages; no application errors were observed.
- Screenshots verified the happy-path render for Dashboard, Machines, Alerts, Fault Logs, Analytics, and Settings.
- Existing empty states were retained. Error branches were made explicit in the main operational pages; a forced network failure was not injected into the live UI, so those branches were source-validated rather than browser-triggered.
- Backend logs showed repeat requests for `/api/motors`, `/api/alerts/live`, `/api/faults`, `/api/system/summary`, `/api/analytics/trends`, `/api/personnel`, and `/api/notifications/status`, confirming polling bindings are active.

## Known limitations

1. Reports is not part of the existing router or navigation and remains unavailable at `/reports`.
2. The current frontend does not display the telemetry-update-only Decision Engine fields `faultConfidence`, `mlActive`, `emergencyTrip`, `overrideFired`, `overrideReason`, or the model diagnostics fields.
3. The backend system summary currently returns a fixed `healthTrend` value of `5.0`; the frontend displays it from the backend response, but it is not a calculated live trend.
4. Firebase startup still reports malformed credentials in the API workflow, affecting notification delivery configuration only; API and ML inference remained operational during this validation.

No ML model, preprocessing artifact, Decision Engine, safety-rule, or visual design changes were made as part of this frontend validation.