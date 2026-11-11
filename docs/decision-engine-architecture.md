# VoltGuard AI — Decision Engine Architecture
## From Model Outputs to System Actions

**Date:** 2026-07-18  
**Status:** Design specification — no code  
**Scope:** Ensemble combination, confidence scoring, conflict resolution, relay trip logic, notification rules, dashboard generation, health scoring, and fail-safe overrides  
**Models:** Isolation Forest (IF) · Random Forest (RF) · XGBoost (XGB)  
**Fault classes:** Normal (0) · Bearing Wear (1) · High THD (2) · High Vibration (3) · Phase Imbalance (4) · Overcurrent (5)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Model Output Specification](#2-model-output-specification)
3. [Stage 1 — Isolation Forest Gate](#3-stage-1--isolation-forest-gate)
4. [Stage 2 — Confidence Calculation](#4-stage-2--confidence-calculation)
5. [Stage 3 — Voting & Ensemble Fusion](#5-stage-3--voting--ensemble-fusion)
6. [Stage 4 — Conflict Resolution](#6-stage-4--conflict-resolution)
7. [Stage 5 — Fault Classification Decision](#7-stage-5--fault-classification-decision)
8. [Stage 6 — Severity Assessment](#8-stage-6--severity-assessment)
9. [Stage 7 — Relay Trip Logic](#9-stage-7--relay-trip-logic)
10. [Stage 8 — Health Score Calculation](#10-stage-8--health-score-calculation)
11. [Stage 9 — Dashboard Status Generation](#11-stage-9--dashboard-status-generation)
12. [Stage 10 — Notification Rules](#12-stage-10--notification-rules)
13. [Fail-Safe Safety Overrides](#13-fail-safe-safety-overrides)
14. [Complete Decision Flow Diagram](#14-complete-decision-flow-diagram)
15. [State Transition Model](#15-state-transition-model)
16. [Decision Engine Constants Reference](#16-decision-engine-constants-reference)

---

## 1. Architecture Overview

The VoltGuard Decision Engine is a **ten-stage sequential pipeline** that transforms raw model outputs into deterministic, auditable system actions. Every stage has defined inputs, outputs, and failure behavior.

```
[Feature Vector: 62 × float32]
         │
         ▼
   ┌─────────────┐
   │  Stage 1    │  Isolation Forest Gate
   │  IF Gate    │  Anomaly score → Normal bypass or fault path
   └─────────────┘
         │
         ▼ (fault path only)
   ┌─────────────┐
   │  Stage 2    │  Per-model confidence calculation
   │  Confidence │  Entropy, margin, calibration
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 3    │  Weighted voting & ensemble fusion
   │  Ensemble   │  RF + XGB class probabilities × dynamic weights
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 4    │  Conflict resolution
   │  Conflicts  │  Agreement test, tiebreaker rules, escalation
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 5    │  Final fault class + probability
   │  Decision   │  Single authoritative fault label
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 6    │  Severity assessment
   │  Severity   │  Maps class + confidence → critical/high/medium/low
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 7    │  Relay trip logic
   │  Relay      │  Hard thresholds override all model decisions
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 8    │  Health score calculation
   │  Health     │  Composite [0..100] incorporating all prior stages
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 9    │  Dashboard status generation
   │  Dashboard  │  running / warning / stopped + UI metadata
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │  Stage 10   │  Notification dispatch rules
   │  Notify     │  Telegram + FCM push + rate limiting
   └─────────────┘
         │
         ▼
   [System Actions: DB write · Alert record · Fault log · Relay command · Notifications]
```

**Design principles:**

1. **Safety first, ML second.** Hard sensor threshold overrides (Stage 7) can trigger the relay regardless of what all three models say. The relay is a deterministic safety device, not an ML output.
2. **No silent failures.** Every stage defines an explicit behavior when inputs are invalid, models fail, or confidence is below threshold. The system always produces a deterministic action.
3. **Auditability.** Every decision records which model voted for which class, the confidence scores, the conflict resolution path taken, and whether a fail-safe override fired. This is stored alongside the fault log.
4. **Consistency with the rule engine.** The VoltGuard `severity.ts` thresholds (e.g., THD > 20% = emergency) are reproduced in Stage 7 fail-safes to prevent the ML layer from suppressing a legitimate trip that sensor values have already triggered.

---

## 2. Model Output Specification

Each model produces a specific output format. All outputs are computed per analysis window (4,096 samples = 341 ms) and represent a single decision point.

### 2.1 Isolation Forest Output

```
IF output:
  anomaly_score   : float ∈ [0..1]
                    0 = deep inside normal distribution
                    1 = maximally anomalous / shortest isolation path
  is_anomaly      : bool
                    true  → anomaly_score > IF_THRESHOLD (0.50)
                    false → normal; route to Normal bypass
```

The IF anomaly score is derived from the average path length in the isolation trees:
- Short path → few splits needed → point is an outlier → high anomaly score
- Long path → many splits needed → point is surrounded by normal data → low anomaly score

**Threshold derivation:** `IF_THRESHOLD = 0.50` corresponds to the contamination parameter set at training time. This is calibrated to VoltGuard's `WARNING_THRESHOLDS.anomalyScore = 0.20` — all points the rule engine would flag as warning should also exceed the IF threshold. The IF threshold is intentionally set lower (more sensitive) than the rule engine to catch novel fault patterns not yet in the rule set.

### 2.2 Random Forest Output

```
RF output:
  class_probs     : float[6] summing to 1.0
                    [P(Normal), P(Bearing Wear), P(High THD),
                     P(High Vibration), P(Phase Imbalance), P(Overcurrent)]
  predicted_class : int ∈ {0..5}    → argmax(class_probs)
  vote_counts     : int[6]          → raw tree vote counts (n_estimators votes)
  oob_accuracy    : float           → out-of-bag accuracy at training time (static)
```

### 2.3 XGBoost Output

```
XGB output:
  class_probs     : float[6] summing to 1.0  (softmax over leaf scores)
                    [P(Normal), P(Bearing Wear), P(High THD),
                     P(High Vibration), P(Phase Imbalance), P(Overcurrent)]
  predicted_class : int ∈ {0..5}    → argmax(class_probs)
  leaf_margin     : float[6]        → raw pre-softmax log-odds for calibration
  best_iteration  : int             → early-stopping iteration used
```

### 2.4 Decision Record (Audit Trail)

Every decision point writes one `DecisionRecord` to the database alongside any fault log:

```
DecisionRecord {
  window_id           : uuid
  motor_id            : int
  timestamp           : datetime
  if_anomaly_score    : float
  if_is_anomaly       : bool
  rf_probs            : float[6]
  rf_predicted        : int
  xgb_probs           : float[6]
  xgb_predicted       : int
  ensemble_probs      : float[6]
  final_class         : int
  confidence          : float
  conflict_detected   : bool
  conflict_resolution : string    ("agreement" | "weighted_winner" | "severity_escalation" | "failsafe_override")
  relay_triggered     : bool
  relay_reason        : string    ("ml_decision" | "hard_threshold_thd" | "hard_threshold_db" | "hard_threshold_current" | "composite_score" | null)
  health_score        : int
  alert_severity      : string
  fault_label         : string
  notification_sent   : bool
}
```

---

## 3. Stage 1 — Isolation Forest Gate

The IF gate is the **first and fastest** stage. It routes the decision into two paths without invoking RF or XGB:

```
IF anomaly_score ≤ IF_THRESHOLD (0.50)
  → Normal bypass path:
      final_class = "Normal"
      confidence  = 1.0 − anomaly_score   (e.g., 0.40 score → 0.60 confidence)
      severity    = none
      health_score = f(anomaly_score)     (Stage 8)
      → Write telemetry log only, no alert, no fault log
      → Stage 3–7 SKIPPED

IF anomaly_score > IF_THRESHOLD (0.50)
  → Fault investigation path:
      → Proceed to Stage 2 (RF + XGB confidence)
```

**Why this gate exists:**

In a healthy industrial fleet, 70–90% of telemetry windows are normal. Invoking RF and XGBoost inference on every window wastes compute and produces meaningless class probability distributions on clearly normal data. The IF gate filters out the vast majority of normal windows with a single fast operation (average path length across 200 trees).

**Gate edge case — IF below threshold but sensor values in warning zone:**

If `anomaly_score ≤ 0.50` but the raw sensor features indicate warning (e.g., `thd_pct > 10%` from the feature vector), the Fail-Safe Override (Stage 13) still runs independently of this gate. The IF gate routes the ML decision path, not the hard-threshold safety path.

**IF Confidence on Normal Path:**

For the Normal bypass path, the confidence is not simply `1.0 − anomaly_score`. It is scaled so that `anomaly_score = 0` → confidence 1.00 and `anomaly_score = IF_THRESHOLD` → confidence 0.50:

```
IF_normal_confidence = 1.0 − (anomaly_score / IF_THRESHOLD) × 0.50
```

This prevents a motor at `anomaly_score = 0.49` (just below threshold) from being reported at high confidence as "Normal" — it correctly shows 0.51 confidence, which the dashboard can render as "low certainty normal."

---

## 4. Stage 2 — Confidence Calculation

On the fault investigation path, confidence is computed independently for RF and XGB before fusion.

### 4.1 RF Confidence

RF confidence uses **prediction margin** — the gap between the top-1 and top-2 class probabilities — combined with the **entropy** of the full probability distribution:

```
RF_margin   = RF_probs[predicted_class] − max(RF_probs excluding predicted_class)
RF_entropy  = −Σ p_i × log₂(p_i)     for all i where p_i > 0
RF_max_entropy = log₂(6) = 2.585      (uniform distribution over 6 classes)

RF_confidence = RF_margin × (1 − RF_entropy / RF_max_entropy)
```

**Interpretation:**
- High margin + low entropy → high confidence (model is certain and concentrated)
- Low margin + high entropy → low confidence (model is uncertain and spread across classes)
- High margin + high entropy → medium confidence (model picked a winner but other classes have significant votes)

**Why margin × (1 − entropy/max_entropy):**  
Margin alone can be misleading: a model distributing probability as [0.35, 0.15, 0.15, 0.15, 0.10, 0.10] has the same margin (0.20) as [0.60, 0.40, 0, 0, 0, 0] but is far less confident. Entropy corrects for this.

### 4.2 XGB Confidence

XGBoost confidence uses the **softmax margin** (same formula as RF) plus a **calibration penalty** based on the leaf margin:

```
XGB_margin     = XGB_probs[predicted_class] − max(XGB_probs excluding predicted_class)
XGB_entropy    = −Σ p_i × log₂(p_i)
XGB_raw_conf   = XGB_margin × (1 − XGB_entropy / log₂(6))

# Platt scaling calibration factor (fitted post-training)
XGB_calibration = sigmoid(XGB_leaf_margin[predicted_class] × calibration_slope + calibration_intercept)

XGB_confidence  = 0.70 × XGB_raw_conf + 0.30 × XGB_calibration
```

**Why calibration matters for XGB:**  
XGBoost's raw softmax outputs are known to be poorly calibrated (overconfident). Platt scaling on the pre-softmax leaf margins produces better-calibrated probabilities. The 70/30 blend retains the margin signal while correcting for overconfidence.

### 4.3 Combined Model Confidence

```
COMBINED_CONFIDENCE = (RF_OOB_weight × RF_confidence) + (XGB_val_weight × XGB_confidence)
                      ─────────────────────────────────────────────────────────────────
                                        RF_OOB_weight + XGB_val_weight
```

Where `RF_OOB_weight` and `XGB_val_weight` are the model's **validation F1 macro score** computed at training time — better models on the validation set get higher weight at inference time. These are stored as static model metadata alongside the serialized model artifacts.

---

## 5. Stage 3 — Voting & Ensemble Fusion

The ensemble combines RF and XGB class probability vectors into a single fused probability distribution over the 6 fault classes.

### 5.1 Dynamic Weight Calculation

Model weights are not fixed. They are adjusted dynamically based on:

1. **Validation performance weight (static, from training):**

```
W_rf_base  = RF_val_macro_F1
W_xgb_base = XGB_val_macro_F1
```

2. **Class-specific weight adjustment:**

For the Overcurrent and Phase Imbalance classes, XGBoost's monotone constraint training gives it an advantage — its validation precision on these classes is typically higher. For Bearing Wear, RF's ensemble of trees gives it higher precision on vibration-kurtosis-based splits. The class-specific weight override:

```
For class c:
  W_rf[c]  = W_rf_base  × class_weight_rf[c]
  W_xgb[c] = W_xgb_base × class_weight_xgb[c]

class_weight_rf:
  Normal       : 1.0    # Equal
  Bearing Wear : 1.2    # RF advantage (kurtosis splits)
  High THD     : 1.0    # Equal
  High Vibration : 1.0  # Equal
  Phase Imbalance : 0.8 # XGB advantage (monotone current constraint)
  Overcurrent  : 0.8    # XGB advantage (monotone margin feature)

class_weight_xgb:
  Normal       : 1.0
  Bearing Wear : 0.8
  High THD     : 1.0
  High Vibration : 1.0
  Phase Imbalance : 1.2
  Overcurrent  : 1.2
```

These class-weight multipliers are derived from the confusion matrix of each model on the held-out test set. They should be re-evaluated after each model retraining cycle.

### 5.2 Weighted Probability Fusion

```
For each class c ∈ {0..5}:
  ENSEMBLE_prob[c] = (W_rf[c] × RF_probs[c] + W_xgb[c] × XGB_probs[c])
                     ────────────────────────────────────────────────────
                                W_rf[c] + W_xgb[c]

# Renormalize to sum to 1.0
total = Σ ENSEMBLE_prob[c]
ENSEMBLE_prob[c] = ENSEMBLE_prob[c] / total   for all c
```

### 5.3 IF Anomaly Score Integration

The IF anomaly score is incorporated into the ensemble as a **class suppression modifier** — not as a class probability itself. High anomaly scores suppress the probability of the Normal class:

```
# Suppress Normal class probability proportional to IF anomaly score
IF_suppression_factor = anomaly_score / IF_THRESHOLD   (capped at 1.0 when score ≥ threshold)

ENSEMBLE_prob[Normal] = ENSEMBLE_prob[Normal] × (1 − 0.40 × IF_suppression_factor)

# Redistribute the suppressed Normal probability equally across fault classes
suppressed_mass = original_ENSEMBLE_prob[Normal] − adjusted_ENSEMBLE_prob[Normal]
for c ∈ {1..5}:
  ENSEMBLE_prob[c] += suppressed_mass / 5

# Re-normalize
ENSEMBLE_prob = ENSEMBLE_prob / sum(ENSEMBLE_prob)
```

**Why 40% suppression at threshold and not 100%:**  
On the fault path (`anomaly_score > IF_THRESHOLD`), the IF has already flagged the point as anomalous. However, RF and XGB may still assign some probability mass to Normal — this happens when the fault signature is subtle and the tree models haven't converged. A 40% Normal suppression at threshold (and 40% × scale below threshold) partially overrides this without fully discarding the supervised model signal.

---

## 6. Stage 4 — Conflict Resolution

A conflict exists when RF and XGB predict **different fault classes** with significant confidence. The conflict resolution stage determines which prediction wins, whether to escalate severity, or whether to abstain.

### 6.1 Agreement Test

```
# Models agree if both predict the same class
RF_class  = argmax(RF_probs)
XGB_class = argmax(XGB_probs)

MODELS_AGREE = (RF_class == XGB_class)
```

When `MODELS_AGREE = true`, proceed directly to Stage 5 with the agreed class and the ensemble probability. No conflict resolution needed.

### 6.2 Conflict Classification

When models disagree, classify the type of conflict:

```
CONFLICT_TYPE = classify_conflict(RF_class, XGB_class, RF_confidence, XGB_confidence)
```

| Conflict Type | Condition | Resolution Strategy |
|---------------|-----------|---------------------|
| **Mild disagreement** | Both confidences < 0.55 | Use ensemble winner; log conflict; no escalation |
| **Strong divergence** | One confidence > 0.70, other < 0.40 | Trust the high-confidence model |
| **Symmetric conflict** | Both confidences within 0.10 of each other, both > 0.50 | Severity-escalation rule (see 6.3) |
| **Safety conflict** | One model predicts safety-critical class (Phase Imbalance or Overcurrent) | Always escalate to safety-critical class (see 6.4) |
| **Normal vs. Fault conflict** | One predicts Normal, other predicts any fault class | Trust the fault class; flag for review |

### 6.3 Symmetric Conflict Resolution

When both models are confident but disagree:

```
# Step 1: Use ensemble winner (argmax of fused ENSEMBLE_prob)
ENSEMBLE_winner = argmax(ENSEMBLE_prob)
ENSEMBLE_winner_prob = ENSEMBLE_prob[ENSEMBLE_winner]

# Step 2: Apply minimum confidence gate
if ENSEMBLE_winner_prob < MINIMUM_CLASSIFICATION_CONFIDENCE (0.45):
  → Abstain: classify as "Anomaly Detected" (catch-all class, severity = medium)
  → CONFLICT_RESOLUTION = "abstain_low_confidence"
else:
  → Accept ensemble winner
  → CONFLICT_RESOLUTION = "weighted_winner"
```

**Abstain behavior:**  
When confidence is below the minimum gate, the engine does not guess. It produces a catch-all "Anomaly Detected" label (equivalent to the `severity.ts` catch-all) with medium severity. This triggers a notification asking for human inspection rather than asserting a potentially wrong fault class.

### 6.4 Safety Conflict Resolution (Non-Negotiable)

This rule overrides all other conflict resolution:

```
SAFETY_CRITICAL_CLASSES = {Phase Imbalance (4), Overcurrent (5)}

if RF_class ∈ SAFETY_CRITICAL_CLASSES OR XGB_class ∈ SAFETY_CRITICAL_CLASSES:
  # Use the safety-critical class regardless of which model predicted it
  # and regardless of relative confidence scores
  FINAL_CLASS = the safety-critical class (if both predict safety-critical but different → use higher-severity one: Overcurrent > Phase Imbalance)
  CONFLICT_RESOLUTION = "severity_escalation"
  ESCALATION_NOTE = "Safety-critical class asserted by {model name} — applied conservatively"
```

**Rationale:** Phase Imbalance causes winding burnout within minutes. Overcurrent causes thermal destruction within seconds to minutes. A false positive on these classes causes an unnecessary inspection. A false negative on these classes causes catastrophic motor failure. The asymmetric cost requires conservative escalation: if any model with any confidence predicts Phase Imbalance or Overcurrent, it wins.

### 6.5 Normal vs. Fault Conflict

```
if one_model_predicts_normal AND other_model_predicts_fault:
  # Always trust the fault prediction
  FINAL_CLASS = the fault class
  CONFLICT_RESOLUTION = "normal_vs_fault_resolved_to_fault"
  confidence = confidence of the fault-predicting model × 0.80  # Penalize confidence due to disagreement
```

**Rationale:** A false positive (unnecessary inspection) is far less costly than a false negative (missed fault). Whenever one model suspects a fault, it wins against Normal.

---

## 7. Stage 5 — Fault Classification Decision

After conflict resolution, Stage 5 produces the single authoritative fault label.

```
FINAL_CLASS    = resolved class ∈ {0..5} | "Anomaly Detected"
FINAL_LABEL    = class_name[FINAL_CLASS]
FINAL_PROB     = ENSEMBLE_prob[FINAL_CLASS]  (or penalized confidence from conflict resolution)
FINAL_CONFIDENCE = COMBINED_CONFIDENCE × conflict_penalty

# Conflict penalties:
#   agreement           → penalty = 1.0
#   weighted_winner     → penalty = 0.90
#   severity_escalation → penalty = 0.85 (label is conservative, not necessarily most likely)
#   abstain             → penalty = 0.70
```

**Minimum confidence thresholds for reporting:**

| Confidence Level | Action |
|-----------------|--------|
| ≥ 0.80 | Report fault class with full confidence; high-certainty fault log |
| 0.60 – 0.79 | Report fault class; flag as "moderate confidence"; suggest inspection |
| 0.45 – 0.59 | Report fault class; flag as "low confidence"; request re-inspection in next cycle |
| < 0.45 | Abstain → report as "Anomaly Detected"; medium severity; human review |

---

## 8. Stage 6 — Severity Assessment

Severity maps the final fault class and confidence to the alert/fault severity enum used throughout VoltGuard (`critical / high / medium / low / none`).

### 6.1 Base Severity by Fault Class

| Fault Class | Base Severity | Justification |
|-------------|--------------|---------------|
| Normal | none | No action needed |
| Bearing Wear | medium | Progressive — days to failure; schedule maintenance |
| High THD | medium | Electrical distortion — damaging but not immediate |
| High Vibration | high | Combined mechanical+electrical — accelerated failure rate |
| Phase Imbalance | critical | Motor winding burnout within minutes of onset |
| Overcurrent | critical | Thermal destruction within seconds to minutes |
| Anomaly Detected (abstain) | medium | Unknown — requires human inspection |

### 6.2 Severity Modifiers

Severity is escalated or de-escalated by the following conditions:

| Condition | Modifier | Result |
|-----------|----------|--------|
| `FINAL_CONFIDENCE < 0.60` | De-escalate by one level | critical→high, high→medium, medium→low |
| `IF_anomaly_score > 0.85` | Escalate by one level | medium→high, high→critical |
| `IF_anomaly_score < 0.55` (borderline) | De-escalate by one level | |
| Fault class confirmed in 3 consecutive windows | Escalate by one level | Sustained fault is more serious than transient |
| Fault class contradicted in next window | De-escalate by one level | Possible transient; do not escalate |
| Motor previously in "warning" status ≥ 1 hour | Escalate by one level | Chronic fault is more serious than new fault |

**Final severity clamp:** Severity can never exceed `critical` or go below `none` after modifier application.

### 6.3 Consecutive Window Confirmation

The engine maintains a **per-motor fault state buffer** of the last 5 consecutive window decisions:

```
FaultStateBuffer[motor_id] = [class_t, class_t-1, class_t-2, class_t-3, class_t-4]

# A fault is "confirmed" when ≥ 3 of the last 5 windows agree on the same non-Normal class
confirmed_fault = mode(FaultStateBuffer) if count(mode) ≥ 3 else None

# A "sustained" fault has been confirmed for ≥ 12 consecutive windows (≈ 1 hour at 5 min poll)
```

Transient spikes (single-window faults) produce alerts but are not escalated. This dramatically reduces false positives from electrical transients on the supply.

---

## 9. Stage 7 — Relay Trip Logic

The relay trip stage is **the most critical stage in the entire engine**. It runs **independently of and in parallel with** the ML decision pipeline — it does not wait for ML model outputs to complete, and it cannot be suppressed by low ML confidence.

### 9.1 Hard Threshold Conditions (Fail-Safe)

The relay fires when **any one** of the following conditions is true, evaluated directly from the raw feature vector (not model outputs):

```
RELAY_TRIP_CONDITIONS = {

  # Hard electrical threshold — matches severity.ts CRITICAL_THRESHOLDS
  THD_TRIP      : thd_pct       ≥ 20.0  (CRITICAL_THRESHOLDS.thd)
  DB_TRIP       : noise_db      ≥ 95.0  (CRITICAL_THRESHOLDS.db)
  CURRENT_HIGH  : current_amps  ≥ 45.0  (extreme overcurrent — 1.8× rated max)

  # Composite VoltGuard engine score — matches severity.ts
  COMPOSITE_TRIP : vg_anomaly_score ≥ 0.75  (CRITICAL_THRESHOLDS.anomalyScore)

  # ML-driven trip — models agree on critical fault with high confidence
  ML_TRIP : FINAL_CLASS ∈ {Phase Imbalance, Overcurrent}
            AND FINAL_CONFIDENCE ≥ 0.75
            AND IF_anomaly_score ≥ 0.70
}

RELAY_FIRES = THD_TRIP OR DB_TRIP OR CURRENT_HIGH OR COMPOSITE_TRIP OR ML_TRIP
```

### 9.2 Trip Conditions — Priority and Reason Code

When multiple conditions are true simultaneously, record all of them but use the highest-priority as the canonical `relay_reason`:

| Priority | Condition | relay_reason code | Response time |
|----------|-----------|------------------|---------------|
| 1 (highest) | `CURRENT_HIGH` (≥ 45 A) | `hard_threshold_current` | **Immediate** (< 100 ms) |
| 2 | `THD_TRIP` (≥ 20%) | `hard_threshold_thd` | **Immediate** (< 100 ms) |
| 3 | `DB_TRIP` (≥ 95 dB) | `hard_threshold_db` | **Immediate** (< 100 ms) |
| 4 | `COMPOSITE_TRIP` | `composite_score` | **Immediate** (< 100 ms) |
| 5 (lowest) | `ML_TRIP` | `ml_decision` | Within current window (≤ 341 ms) |

**Hard threshold trips (priority 1–4) must not wait for ML model inference.** They evaluate directly on the incoming sensor values as they arrive. The ML pipeline may still run in parallel to classify the fault type for the fault log, but the relay command is issued before that completes.

### 9.3 Relay Inhibit Conditions

The relay will NOT fire even if trigger conditions are met when:

```
RELAY_INHIBITED = (
  motor.status == "stopped"         # Motor already off — relay command is redundant
  OR motor.testMode == true         # Maintenance test mode — inhibit all trips
  OR relay_already_tripped_within(5 seconds)  # Prevent relay chatter / coil damage
)
```

### 9.4 Relay Trip Consequence Chain

When relay fires:

```
1. Send relay_trip command to motor controller
2. Record fault log with:
     severity = "critical"
     fault_label = FINAL_CLASS (or "Emergency Trip" if ML not yet complete)
     relay_tripped = true
     relay_reason = <reason code>
3. Create HIGH-priority alert (unacknowledged)
4. Set motor.status = "stopped"
5. Dispatch IMMEDIATE Telegram notification (bypasses rate limiter — see Stage 10)
6. Dispatch IMMEDIATE FCM push notification to all personnel assigned to this motor
7. Set days_to_failure = 0  (motor has failed / tripped)
```

---

## 10. Stage 8 — Health Score Calculation

The health score is a single integer [0..100] representing the overall motor health. It is the primary indicator displayed on the VoltGuard dashboard.

### 8.1 Multi-Component Health Score Formula

```
H_ml      = (1 − ENSEMBLE_prob[FINAL_CLASS_IF_FAULT]) × 100
              OR (1 − 0) × 100 = 100 if final_class = Normal

H_if      = (1 − IF_anomaly_score) × 100

H_thd     = max(0, 100 − (thd_pct − 5.0) / (20.0 − 5.0) × 100)
              (= 100 at THD = 5%; = 0 at THD = 20%)

H_db      = max(0, 100 − (noise_db − 70.0) / (95.0 − 70.0) × 100)
              (= 100 at dB = 70; = 0 at dB = 95)

H_current = max(0, min(100,
              current_amps ∈ [8, 25]  → 100
              current_amps > 25       → 100 − (current_amps − 25) / 20 × 100
              current_amps < 8        → current_amps / 8 × 100
            ))

HEALTH_SCORE = round(
  0.25 × H_ml +
  0.20 × H_if +
  0.25 × H_thd +
  0.20 × H_db +
  0.10 × H_current
)

HEALTH_SCORE = clamp(HEALTH_SCORE, 0, 100)
```

### 8.2 Component Weights Rationale

| Component | Weight | Rationale |
|-----------|--------|-----------|
| H_ml (ML ensemble) | 25% | ML class probability captures multi-sensor fault pattern |
| H_if (Isolation Forest) | 20% | Independent unsupervised signal; catches novel anomalies not in training set |
| H_thd (THD) | 25% | Primary MCSA signal; weighted highest in VoltGuard severity engine (50% weight there) |
| H_db (vibration/acoustic) | 20% | Secondary signal; 35% weight in severity engine |
| H_current | 10% | Tertiary signal — important for Phase Imbalance/Overcurrent but less diagnostic overall |

**Note:** The VoltGuard severity engine (`severity.ts`) uses `computeHealthScore(anomaly_score)` as a single-formula score. The Decision Engine's health score is a richer multi-component version that incorporates ML model outputs. The two are related: when all sensors are at baseline, both produce 100; when all sensors are at critical thresholds, both produce ~0. But the Decision Engine's score diverges when one sensor is normal and the ML ensemble has detected a subtle multi-sensor pattern.

### 8.3 Relay Trip Health Score Override

If relay has been tripped:
```
HEALTH_SCORE = 0
```
A tripped motor has, by definition, zero operational health.

### 8.4 Consecutive Window Decay

Health score is not computed fresh from zero every window. It is smoothed using an exponential moving average to prevent dashboard flickering:

```
HEALTH_SCORE_smoothed[t] = 0.30 × HEALTH_SCORE[t] + 0.70 × HEALTH_SCORE_smoothed[t-1]
```

Exception: When `RELAY_FIRES = true`, set immediately to 0 with no smoothing.

---

## 11. Stage 9 — Dashboard Status Generation

The dashboard motor status is one of three values: `running | warning | stopped`. This is derived from the health score and relay state.

### 9.1 Status Rules

```
if relay_tripped OR motor.status == "stopped" (previous state):
  status = "stopped"

else if HEALTH_SCORE_smoothed < 60:
  status = "warning"

else if HEALTH_SCORE_smoothed < 85:
  status = "warning"

else:
  status = "running"
```

More precisely, status is mapped from health score ranges:

| Health Score Range | Status | VoltGuard Anomaly Score Equivalent |
|-------------------|--------|-----------------------------------|
| 85 – 100 | `running` | 0.0 – 0.15 |
| 50 – 84 | `warning` | 0.15 – 0.50 |
| 1 – 49 | `warning` (critical warning) | 0.50 – 0.99 |
| 0 | `stopped` | 1.0 |

**Note:** The three-value status enum (`running / warning / stopped`) is preserved from the existing VoltGuard data model. `stopped` exclusively means relay-tripped or administratively offline. `warning` covers the full non-normal non-tripped range. The health score provides finer granularity within the `warning` band.

### 9.2 Dashboard Metadata Bundle

Every telemetry update generates the following metadata bundle for the dashboard:

```
DashboardUpdate {
  motor_id          : int
  status            : "running" | "warning" | "stopped"
  health_score      : int         [0..100]
  anomaly_score     : float       [0..1]    (= vg_anomaly_score from feature vector)
  thd_pct           : float                 (raw sensor)
  noise_db          : float                 (raw sensor)
  current_amps      : float                 (raw sensor)
  fault_label       : string      (final fault classification)
  fault_confidence  : float       [0..1]
  alert_severity    : string      (none/low/medium/high/critical)
  days_to_failure   : int | null
  relay_tripped     : bool
  if_anomaly_score  : float       (raw IF output — for advanced dashboard view)
  rf_top_class      : string      (RF prediction — for transparency view)
  xgb_top_class     : string      (XGB prediction — for transparency view)
  models_agreed     : bool        (conflict flag)
  timestamp         : datetime
}
```

### 9.3 Remaining Useful Life — Pending Survival Model

Rule-based remaining-useful-life and days-to-failure estimates are disabled.
The API and database retain nullable `daysToFailure` fields for the future
Survival Model, but all current telemetry, fallback, and simulator paths
return `null`. A safety trip is not encoded as zero days remaining.

---

## 12. Stage 10 — Notification Rules

Notifications are dispatched through two channels: Telegram (technician messages) and Firebase Cloud Messaging (FCM push to dashboard browsers).

### 10.1 Notification Triggers

| Trigger | Telegram | FCM Push | Condition |
|---------|----------|----------|-----------|
| Relay trip | ✅ **Immediate** | ✅ **Immediate** | `relay_tripped = true` |
| New critical/high alert | ✅ Yes | ✅ Yes | Severity ∈ {critical, high} AND not rate-limited |
| New medium alert | ❌ No | ✅ Yes | Severity = medium |
| New low alert | ❌ No | ❌ No | Severity = low — recorded only |
| Fault confirmed (3 windows) | ✅ Yes | ✅ Yes | Confirmation promotes medium→high or high→critical |
| Health score crosses 50 threshold | ✅ Yes | ✅ Yes | Going below 50 for the first time |
| Health score recovers above 80 | ✅ Yes | ✅ Yes | Recovery notification |
| Anomaly detected (abstain class) | ❌ No | ✅ Yes | Low-confidence catch-all |

### 10.2 Rate Limiting Rules

Prevents notification floods during sustained fault conditions:

```
RATE_LIMITS {
  Telegram per motor:
    min_interval_same_fault    : 15 minutes  (don't repeat same fault class)
    min_interval_any_fault     :  5 minutes  (don't send anything more often)
    relay_trip_bypass          : true        (relay trips always bypass rate limit)

  FCM push per motor:
    min_interval_same_fault    :  5 minutes
    min_interval_any_fault     :  2 minutes
    relay_trip_bypass          : true

  Global Telegram rate:
    max_per_minute             : 20          (Telegram Bot API limit)
    burst_queue_size           : 50          (queue messages during burst, drain over time)
}
```

### 10.3 Telegram Message Format

```
RELAY TRIP — [CRITICAL]
━━━━━━━━━━━━━━━━━━━━━━
🔴 Motor:      {motor_name}
📍 Location:   {motor_location}
⚡ Fault:      {fault_label}
📊 Confidence: {confidence × 100}%
🏥 Health:     {health_score}/100
📡 THD:        {thd_pct}%  (limit: 20%)
🔊 Vibration:  {noise_db} dB  (limit: 95 dB)
⚡ Current:    {current_amps} A
⏰ Detected:   {timestamp}
━━━━━━━━━━━━━━━━━━━━━━
Relay tripped. Motor stopped.
Assign to: {assigned_personnel_names}
```

For non-trip alerts:
```
⚠️ FAULT ALERT — [{SEVERITY}]
━━━━━━━━━━━━━━━━━━━━━━
Motor:      {motor_name}  ({motor_location})
Fault:      {fault_label}
Confidence: {confidence × 100}%
Health:     {health_score}/100
Est. failure in: {days_to_failure} days | N/A
━━━━━━━━━━━━━━━━━━━━━━
{recommended_action_1}
{recommended_action_2}
```

### 10.4 Personnel Routing Rules

Notifications are routed to the right people, not everyone:

```
NOTIFY_LIST = {
  relay_trip OR critical severity:
    → All personnel with motor in their assignedMotorIds
    → Team lead / supervisor (role = "Supervisor" or "Team Lead")

  high severity:
    → All personnel with motor in their assignedMotorIds

  medium severity (FCM only):
    → First available assigned technician (round-robin among assignedMotorIds)
}
```

If no personnel are assigned to the motor:
```
→ Send to all personnel with role "Supervisor"
→ Include note: "No technician assigned to this motor"
```

---

## 13. Fail-Safe Safety Overrides

Fail-safe overrides are **independent of all ML model outputs**. They run as a parallel check on raw sensor values. If any fail-safe fires, it **overrides the ML decision** for safety purposes.

### 13.1 Override Conditions

```
FAILSAFE_OVERRIDES = [

  # Override 1: Model says Normal but sensors disagree
  if FINAL_CLASS == "Normal"
     AND (thd_pct > WARNING_THRESHOLDS.thd OR noise_db > WARNING_THRESHOLDS.db OR
          current_amps > OVERCURRENT_THRESHOLD OR current_amps < PHASE_IMBALANCE_CURRENT_MAX):
    → FINAL_CLASS = classifyFaultType(raw_readings)  [from severity.ts rule engine]
    → FINAL_CONFIDENCE × 0.70  (penalized — models missed this)
    → severity = at least "medium"
    → OVERRIDE_REASON = "ml_normal_override_sensor_threshold"
    → Log warning: "ML predicted Normal but sensor thresholds indicate {fault_class}"

  # Override 2: Model confidence too low for any decision
  if FINAL_CONFIDENCE < 0.30 AND IF_anomaly_score > 0.60:
    → FINAL_CLASS = classifyFaultType(raw_readings)  [rule engine takes over]
    → severity = "medium"
    → OVERRIDE_REASON = "ml_confidence_too_low_rule_engine_fallback"

  # Override 3: All models failed (model load error, timeout, exception)
  if models_failed:
    → FINAL_CLASS = classifyFaultType(raw_readings)  [full rule engine fallback]
    → IF_anomaly_score = computeAnomalyScore(raw_readings)
    → health_score = computeHealthScore(IF_anomaly_score)
    → severity based on rule engine thresholds
    → OVERRIDE_REASON = "ml_model_unavailable_rule_engine_fallback"
    → Log error: "ML inference failed; rule engine fallback active"
    → FCM push: "AI models offline — running on sensor rules only"

  # Override 4: ML predicts non-critical but sensors at critical threshold
  if FINAL_CLASS ∉ {Phase Imbalance, Overcurrent}
     AND (thd_pct ≥ CRITICAL_THRESHOLDS.thd OR noise_db ≥ CRITICAL_THRESHOLDS.db
          OR vg_anomaly_score ≥ CRITICAL_THRESHOLDS.anomalyScore):
    → RELAY_FIRES = true  (Stage 7 already catches this, but confirm here)
    → SEVERITY = "critical"
    → OVERRIDE_REASON = "sensor_critical_threshold_relay_forced"
]
```

### 13.2 Override Logging

Every fail-safe override is logged in the `DecisionRecord`:

```
override_fired     : bool
override_reason    : string  (one of the OVERRIDE_REASON codes above)
original_ml_class  : string  (what the ML would have decided without override)
original_ml_conf   : float
rule_engine_class  : string  (what the rule engine decided)
```

This creates a feedback loop: a high rate of `ml_normal_override_sensor_threshold` events indicates model drift — the ML models need retraining because they are predicting Normal for conditions the sensor rules correctly identify as faults.

### 13.3 Model Drift Monitoring Trigger

```
# Compute weekly drift metric:
DRIFT_RATE = count(override_reason = "ml_normal_override_sensor_threshold") 
             ─────────────────────────────────────────────────────────────────
             total_decisions in last 7 days

if DRIFT_RATE > 0.05:  # > 5% of decisions require rule engine override
  → Log drift alert
  → FCM push to system administrator: "ML model drift detected — retraining recommended"
  → Set isReadyForTraining = false in TrainingDataStats
  → Increase training data capture rate via adaptive telemetry (5s interval)
```

---

## 14. Complete Decision Flow Diagram

```
INPUT: [Feature Vector: 62 features]
       [Raw sensors: current, thd, noise_db, frequency]
          │
          ├─────────────────────────────────────────────────────────────────────┐
          │  PARALLEL: Fail-Safe Hard Threshold Check                          │
          │  (runs independently, cannot be blocked)                           │
          │  thd ≥ 20 OR db ≥ 95 OR current ≥ 45 OR composite ≥ 0.75         │
          │       │                                                             │
          │       ├── YES → RELAY_FIRES immediately                            │
          │       │         → Skip ML decision for relay                       │
          │       │         → Continue ML for fault classification only        │
          │       └── NO  → Relay held; continue                               │
          │                                                                     │
          └─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼ ML decision path
         ┌────────────────────────────────────────────────┐
         │  STAGE 1: Isolation Forest                      │
         │  → anomaly_score = IF.predict(features)         │
         │  → is_anomaly = (anomaly_score > 0.50)          │
         └────────────────────────────────────────────────┘
                    │              │
              is_anomaly=false   is_anomaly=true
                    │              │
                    ▼              ▼
         ┌──────────────┐   ┌────────────────────────────────┐
         │ Normal bypass │   │ STAGE 2: RF + XGB Inference    │
         │ confidence =  │   │ → RF_probs[6]                  │
         │ 1 - IF_score  │   │ → XGB_probs[6]                 │
         │               │   └────────────────────────────────┘
         │               │              │
         │               │              ▼
         │               │   ┌────────────────────────────────┐
         │               │   │ STAGE 2b: Confidence Calc      │
         │               │   │ → RF_confidence (margin+entropy)│
         │               │   │ → XGB_confidence (calibrated)  │
         │               │   │ → COMBINED_CONFIDENCE           │
         │               │   └────────────────────────────────┘
         │               │              │
         │               │              ▼
         │               │   ┌────────────────────────────────┐
         │               │   │ STAGE 3: Ensemble Fusion       │
         │               │   │ → Dynamic class weights        │
         │               │   │ → Weighted prob fusion         │
         │               │   │ → IF Normal suppression        │
         │               │   │ → ENSEMBLE_probs[6]            │
         │               │   └────────────────────────────────┘
         │               │              │
         │               │              ▼
         │               │   ┌────────────────────────────────┐
         │               │   │ STAGE 4: Conflict Resolution   │
         │               │   │ → Agreement test               │
         │               │   │ → Safety-critical override     │
         │               │   │ → Normal-vs-fault rule         │
         │               │   │ → Abstain if conf < 0.45       │
         │               │   └────────────────────────────────┘
         │               │              │
         │               │              ▼
         │               │   ┌────────────────────────────────┐
         │               │   │ STAGE 5: Final Fault Label     │
         │               │   │ → FINAL_CLASS                  │
         │               │   │ → FINAL_CONFIDENCE             │
         │               │   │ → FINAL_LABEL                  │
         │               │   └────────────────────────────────┘
         │               │              │
         └───────────────┼──────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  FAIL-SAFE OVERRIDE CHECK                       │
         │  → ML says Normal but sensors say fault?        │
         │  → Confidence < 0.30 with high IF score?        │
         │  → Model failed entirely?                       │
         │  If any → rule engine takes over               │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  STAGE 6: Severity Assessment                   │
         │  → Base severity by fault class                 │
         │  → Confidence modifier                          │
         │  → IF score modifier                            │
         │  → Consecutive window modifier                  │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  STAGE 7: ML Relay Trip Logic                   │
         │  (Hard threshold relay already fired if needed) │
         │  → ML_TRIP: Phase Imbalance/Overcurrent         │
         │    AND confidence ≥ 0.75 AND IF ≥ 0.70          │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  STAGE 8: Health Score                          │
         │  → 5-component weighted formula                 │
         │  → EMA smoothing (0.30 new + 0.70 prior)       │
         │  → Relay trip → force 0                         │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  STAGE 9: Dashboard Status                      │
         │  → status (running/warning/stopped)             │
         │  → DashboardUpdate bundle                       │
         │  → days_to_failure estimate                     │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  STAGE 10: Notification Dispatch                │
         │  → Route by severity and personnel assignments  │
         │  → Rate limiting (bypass on relay trip)        │
         │  → Telegram + FCM                              │
         └────────────────────────────────────────────────┘
                         │
                         ▼
         ┌────────────────────────────────────────────────┐
         │  DATABASE WRITES                                │
         │  → telemetry row                               │
         │  → training_sample row (always)                │
         │  → alert row (if severity ≥ medium)            │
         │  → fault_log row (if severity ≥ high)          │
         │  → DecisionRecord (always, for audit trail)    │
         │  → motor status update                         │
         └────────────────────────────────────────────────┘
```

---

## 15. State Transition Model

The motor state machine has four states with defined transitions:

```
States: HEALTHY | DEGRADED | CRITICAL | TRIPPED

HEALTHY → DEGRADED:
  Condition: health_score drops below 85 OR fault confirmed in 3 consecutive windows
  Action: severity = medium or high; start monitoring at 5s interval

HEALTHY → CRITICAL:
  Condition: sensor hits critical threshold (THD ≥ 20 OR dB ≥ 95 OR composite ≥ 0.75)
  Action: severity = critical; relay trip pending

DEGRADED → HEALTHY:
  Condition: health_score ≥ 85 in 5 consecutive windows (fault sustained resolution)
  Action: clear alert if acknowledged; resume 60s interval; recovery notification

DEGRADED → CRITICAL:
  Condition: fault class escalates to Phase Imbalance or Overcurrent with high confidence
  Action: severity = critical; prepare relay trip

DEGRADED → TRIPPED:
  Condition: composite score ≥ 0.75 or hard threshold met
  Action: relay fires; status = stopped; health = 0

CRITICAL → TRIPPED:
  Condition: any relay trip condition met
  Action: relay fires immediately; all notifications

TRIPPED → HEALTHY:
  Condition: motor.status manually reset by authenticated personnel
  Action: relay reset; health recalculated from sensor values; resume monitoring
  Guard: requires explicit admin action — cannot auto-reset

HEALTHY → HEALTHY:
  Condition: all sensor values within normal bounds; IF score < 0.30
  Action: telemetry log only; no alert; 60s polling interval
```

---

## 16. Decision Engine Constants Reference

All constants in one place. These are the authoritative values aligned with `severity.ts`:

```
# Isolation Forest
IF_THRESHOLD                  = 0.50    # anomaly_score above this → fault path
IF_NORMAL_CONFIDENCE_SCALE    = 0.50    # confidence penalty at IF_THRESHOLD boundary

# Fault classification
MINIMUM_CLASSIFICATION_CONFIDENCE = 0.45  # below this → abstain to "Anomaly Detected"
SAFETY_ESCALATION_CONFIDENCE  = 0.75    # safety-critical ML trip requires this
CONFLICT_SYMMETRIC_THRESHOLD  = 0.10    # confidence gap below this = symmetric conflict
NORMAL_BYPASS_CONFIDENCE_MIN  = 0.50    # minimum IF-normal confidence to skip fault path

# Relay trip hard thresholds (mirror severity.ts)
CRITICAL_THRESHOLDS = {
  thd           : 20.0,   # %
  noise_db      : 95.0,   # dB
  current_high  : 45.0,   # A (extreme overcurrent — 1.8× VoltGuard's OVERCURRENT_THRESHOLD)
  anomaly_score : 0.75,   # composite
}

# Warning thresholds (mirror severity.ts)
WARNING_THRESHOLDS = {
  thd           : 10.0,   # % — Bearing Wear zone
  noise_db      : 82.0,   # dB — High Vibration zone
  anomaly_score : 0.20,   # composite warning
}

# Motor current fault boundaries (mirror severity.ts)
OVERCURRENT_THRESHOLD         = 25.0   # A — above this → Overcurrent class
PHASE_IMBALANCE_CURRENT_MAX   = 8.0    # A — below this → Phase Imbalance class

# THD fault boundaries (mirror severity.ts)
BEARING_WEAR_THD_MIN          = 10.0   # % — entry of Bearing Wear zone
HIGH_THD_THRESHOLD            = 15.0   # % — above this and normal dB → High THD

# Health score weights
HEALTH_WEIGHTS = {
  ml_ensemble   : 0.25,
  isolation_forest : 0.20,
  thd           : 0.25,
  noise_db      : 0.20,
  current       : 0.10,
}

# Health score EMA smoothing
HEALTH_EMA_ALPHA              = 0.30   # weight of new observation

# Health score thresholds
HEALTH_RUNNING_MIN            = 85     # below this → status = warning
HEALTH_CRITICAL_MAX           = 49     # below this → critical warning zone

# Consecutive window confirmation
FAULT_BUFFER_SIZE             = 5      # windows retained per motor
FAULT_CONFIRMED_THRESHOLD     = 3      # windows with same class needed for confirmation
FAULT_SUSTAINED_WINDOWS       = 12     # windows for "sustained fault" escalation (≈ 1 hour at 5 min poll)

# Notification rate limits
TELEGRAM_MIN_INTERVAL_SAME    = 15 × 60  # seconds
TELEGRAM_MIN_INTERVAL_ANY     =  5 × 60  # seconds
FCM_MIN_INTERVAL_SAME         =  5 × 60  # seconds
FCM_MIN_INTERVAL_ANY          =  2 × 60  # seconds
TELEGRAM_MAX_PER_MINUTE       = 20

# Model drift detection
DRIFT_RATE_THRESHOLD          = 0.05   # 5% override rate triggers retraining alert

# Relay
RELAY_CHATTER_GUARD_SECONDS   = 5      # minimum time between relay fires on same motor

# Adaptive telemetry intervals (mirror severity.ts)
INTERVAL_NORMAL_SECONDS       = 60
INTERVAL_ANOMALY_SECONDS      = 5
```

---

*End of Decision Engine Architecture. No code written. No project files modified except this document.*
