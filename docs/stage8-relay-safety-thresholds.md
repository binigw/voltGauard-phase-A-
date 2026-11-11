# VoltGuard AI — Stage 8 Relay Safety Review

**Review date:** 2026-08-13  
**Scope:** Existing Stage 8 decision-engine relay behavior only. No new safety threshold was invented.

The relay decision remains fail-safe and independent of classifier confidence for the
hard sensor limits. Threshold comparisons below are inclusive for emergency limits
(`>=`) and exclusive for warning/classification limits (`>` or `<`) exactly as
implemented in `severity.ts`.

| Condition | Existing threshold | Result |
|---|---:|---|
| Phase Imbalance | current `< 8 A` | Non-Normal fault and warning path. Does **not** trip the relay from the sensor rule alone. It may trip through the existing ML safety path only when XGBoost's final Phase Imbalance result has confidence `>= 0.75` and the Isolation Forest score is `>= 0.70`. |
| Ordinary Overcurrent | current `> 25 A` | Non-Normal Overcurrent warning/alert path. Does **not** trip the relay from the ordinary overcurrent rule alone. |
| Extreme Overcurrent | current `>= 45 A` | Hard emergency relay trip, independent of ML output. |
| High THD | THD `>= 20%` | Hard emergency relay trip. THD `> 15%` is classified as High THD; values above the warning band but below the hard limit remain warning/alert conditions. |
| High Vibration | dB `>= 95` | Hard emergency relay trip. dB `> 82` is classified as High Vibration; values above the warning band but below the hard limit remain warning/alert conditions. |
| Composite anomaly | rule-engine score `>= 0.75` | Hard emergency relay trip. This is the existing deterministic safety-score rule, not the deprecated API `anomalyScore` field. |
| Multi-fault / emergency | Any hard condition above, or the existing ML Phase Imbalance safety path | Relay trip, critical fault severity, high alert severity, stopped dashboard status, and trip message. |

The existing five-second relay chatter guard can suppress a repeated command that
arrives immediately after a prior trip. It does not change the fault classification
or critical severity of the new decision.

## Model roles

- **XGBoost** remains the primary classifier.
- **Random Forest** remains shadow-only and cannot change the final class, severity,
  health score, or relay decision.
- **Isolation Forest** remains the anomaly gate and the source of
  `ifAnomalyScore`. It is not used as a replacement for the health score.

## Contract note

`ifAnomalyScore` is the actual normalized Isolation Forest score and is nullable
when ML inference is unavailable. `anomalyDetected` means the final Decision
Engine result is non-Normal, including a sensor-rule or hard-relay override.
The legacy `anomalyScore` field is retained only for compatibility and is
deprecated; it is the inverse of the smoothed health score and must not be
interpreted as an Isolation Forest score.