# VoltGuard AI — Dataset Selection & Compatibility Audit

**Date:** 2026-07-18  
**Scope:** Publicly available datasets for supervised motor fault classification and unsupervised anomaly detection.  
**Target fault classes:** Normal · Bearing Wear · High THD · High Vibration · Phase Imbalance · Overcurrent  
**Target models:** Random Forest (RF), XGBoost (XGB), Isolation Forest (IF)

---

## 1. VoltGuard Feature Vector (Ground Truth)

The VoltGuard ML training export (`GET /training-data/export.csv`) produces tabular samples with the following **raw sensor columns** that external datasets must map to:

| Column | Unit | Role | Threshold context |
|--------|------|------|-------------------|
| `current_amps` | A | Supply current RMS | < 8 A → Phase Imbalance; > 25 A → Overcurrent |
| `frequency_hz` | Hz | Supply frequency | Nominal 50 Hz |
| `thd_pct` | % | Total Harmonic Distortion | > 10 % → Bearing Wear zone; > 15 % → High THD zone; > 20 % → emergency trip |
| `noise_db` | dB | Acoustic / vibration level | > 82 dB → High Vibration zone; > 95 dB → emergency trip |
| `vibration_db` | dB | (same channel; acoustic proxy) | same |

**Derived columns** (computed server-side, usable as features):

| Column | Notes |
|--------|-------|
| `anomaly_score` | Weighted composite [0..1] — THD 50%, dB 35%, current 15% |
| `health_score` | 100 × (1 − anomaly_score) |
| `days_to_failure` | Linear decay from anomaly_score |

**Fault label priority order** (from `classifyFaultType()` in `severity.ts`):

1. **Overcurrent** — current > 25 A  
2. **Phase Imbalance** — current < 8 A  
3. **High Vibration** — THD > 10% AND dB > 82  
4. **High THD** — THD > 15%, dB normal  
5. **Bearing Wear** — THD 10–15%  
6. **High Vibration** — dB-only > 82  
7. **Normal** — all within baseline (THD ≈ 5%, dB ≈ 70)

---

## 2. Dataset Evaluations

---

### Dataset 1 — CWRU Bearing Dataset  
**Source:** Case Western Reserve University Bearing Data Center  
**URL:** https://engineering.case.edu/bearingdatacenter/home  
**Also available as CSV on Kaggle:** `brokenrotor/cwru-bearing-fault-dataset`

#### Overview
The gold-standard academic dataset for bearing fault detection, collected on a motor-driven test rig with seeded faults at the inner race, outer race, and rolling element. Widely cited in thousands of papers and the most reproduced motor fault benchmark in the field.

#### Fault Classes Available

| Dataset Label | Maps to VoltGuard Class | Notes |
|---------------|------------------------|-------|
| Normal | ✅ Normal | Healthy baseline, all severity levels |
| Inner Race Fault | ✅ Bearing Wear | 0.007"–0.028" EDM-seeded defects |
| Outer Race Fault | ✅ Bearing Wear | Multiple defect sizes and positions |
| Ball Fault | ✅ Bearing Wear | Rolling element damage |
| Combination Faults | ✅ High Vibration | Co-occurring IR + OR raises vibration signature |

**Missing VoltGuard classes:** Phase Imbalance, Overcurrent, High THD (electrical-only)

#### Sensor Types
- **Drive-end accelerometer** (primary): 3-axis vibration at motor shaft end
- **Fan-end accelerometer**: 3-axis at opposite shaft end
- **Base accelerometer**: Structural response
- **Motor current** (select experiments): 3-phase current via CT at 12 kHz

#### Sampling Rate
- **12,000 Hz** (standard experiments) — vibration + current
- **48,000 Hz** (high-resolution experiments) — vibration only
- Load conditions tested: 0, 1, 2, 3 HP (motor speeds 1797–1720 RPM)

#### File Format
MATLAB `.mat` files. Each file contains one array per sensor channel. The Kaggle CSV repackage provides pre-segmented windows with FFT features already extracted. Raw `.mat` preferred for feature engineering.

#### License
**Public domain / open academic use.** No restriction on commercial or research use. CWRU explicitly states the dataset is freely available. No registration required.

#### Data Quality
- **High quality.** Controlled lab conditions, calibrated sensors, well-documented experimental setup.
- Fault severity is quantifiable (defect diameter in inches is recorded).
- Class imbalance: normal samples abundant; large-defect fault samples fewer.
- No label noise — faults were physically seeded and verified.
- **Limitation:** Single-motor test rig; real-world variability not captured.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Derivation Method |
|-------------------|---------------|-------------------|
| `current_amps` | ✅ Direct (select files) | 3-phase current recorded at 12 kHz; compute RMS per window |
| `thd_pct` | ✅ Derivable | FFT of current waveform → harmonic amplitudes → THD = √(Σ H²ₙ) / H₁ × 100 |
| `noise_db` / `vibration_db` | ✅ Direct | Convert accelerometer RMS to dB: 20 × log₁₀(a_rms / a_ref) |
| `frequency_hz` | ✅ Derivable | Dominant frequency from FFT of current (slip frequency detection) |
| `anomaly_score` | ✅ Computable | Apply VoltGuard's `computeAnomalyScore()` to derived features |

**Overall compatibility: HIGH (3 of 4 raw features directly mappable; THD derivable via FFT)**

#### Verdict: ✅ **INCLUDE — Primary Bearing Fault Source**
Best available bearing dataset. Covers Bearing Wear and Normal extensively. Current signals in select experiments allow full THD derivation. Essential foundation dataset.

---

### Dataset 2 — Paderborn University KAt Bearing Dataset  
**Source:** University of Paderborn, Chair of Design and Drive Technology  
**URL:** https://mb.uni-paderborn.de/kat/forschung/datacenter/bearing-datacenter  
**Also available:** Partial repacks on Kaggle (search "Paderborn bearing")

#### Overview
Laboratory and real-world bearing fault dataset collected on the KAt test rig. Includes both artificially damaged bearings (EDM, drilling, electric engraving) and bearings with accelerated real damage from test-rig fatigue. Significantly more realistic than CWRU's purely seeded faults.

#### Fault Classes Available

| Dataset Label | Maps to VoltGuard Class | Notes |
|---------------|------------------------|-------|
| Healthy (K001–K004) | ✅ Normal | Multiple speeds and load torques |
| Artificial IR fault (KA01–KA09) | ✅ Bearing Wear | Seeded inner-race damage |
| Artificial OR fault (KI01–KI14) | ✅ Bearing Wear | Seeded outer-race damage |
| Real damage - fatigue (KA16–KA30) | ✅ Bearing Wear / High Vibration | Accelerated real-world damage — severity varies |
| Severe combined damage | ✅ High Vibration | High vibration + elevated current harmonics |

**Missing:** Phase Imbalance, Overcurrent, High THD (pure electrical)

#### Sensor Types
- **Vibration accelerometers** (x, y axes): radial vibration at 64 kHz
- **Motor current** (3-phase): measured at 64 kHz — **more current data than CWRU**
- **Temperature** (bearing housing + ambient)
- **Radial force sensor**
- Measurements at varied load torque (0.1, 0.7 Nm) and speed (900, 1500 RPM)

#### Sampling Rate
**64,000 Hz** (vibration and current) — highest resolution of any public motor dataset.

#### File Format
MATLAB `.mat` files organized by bearing condition code. Each file: 4s measurement window. ~26 GB total. Requires free registration on Paderborn website.

#### License
**Free for academic and research use with registration.** Commercial use not explicitly restricted but requires acknowledgement. Widely used in published research without reported licensing issues.

#### Data Quality
- **Very high quality.** Both artificial and real fatigue damage included — captures real degradation progression.
- Multiple operating conditions (speed × load combinations).
- Larger file volume than CWRU with richer sensor suite.
- **Limitation:** Registration required; German-language documentation in places.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Derivation Method |
|-------------------|---------------|-------------------|
| `current_amps` | ✅ Direct | 3-phase current at 64 kHz → per-window RMS |
| `thd_pct` | ✅ Derivable | FFT of current → THD computation |
| `noise_db` / `vibration_db` | ✅ Direct | Accelerometer RMS → dB conversion |
| `frequency_hz` | ✅ Derivable | Slip/fundamental from current FFT |

**Overall compatibility: HIGH (equivalent to CWRU, richer current data)**

#### Verdict: ✅ **INCLUDE — Complementary Bearing Source (Real Damage Variability)**
Complements CWRU with real fatigue damage, higher sampling rate, and richer current measurements. Reduces overfitting to CWRU's controlled lab conditions. Include both for a robust Bearing Wear class.

---

### Dataset 3 — Kaggle: "Electrical Fault Detection in Three-Phase Induction Motor"  
**Source:** Multiple Kaggle uploads (search exact title)  
**Example URLs:**  
- `kaggle.com/datasets/esathyaprakash/electrical-fault-detection-and-classification`  
- `kaggle.com/datasets/soundarya621/three-phase-induction-motor-faults`

#### Overview
Tabular dataset of three-phase voltage and current measurements under six electrical fault conditions. Collected on a laboratory induction motor test bench. Directly represents the electrical fault classes most absent from bearing-focused datasets — specifically Phase Imbalance and Overcurrent.

#### Fault Classes Available

| Dataset Label | Maps to VoltGuard Class | Confidence |
|---------------|------------------------|------------|
| Healthy / No Fault | ✅ Normal | Direct |
| Single Phasing (one phase lost) | ✅ Phase Imbalance | Direct — current on lost phase drops to near 0 A |
| Over Voltage | ⚠️ High THD (partial) | Elevated harmonics from saturation |
| Under Voltage | ⚠️ Bearing Wear (partial) | Reduced current, increased slip |
| Overloading | ✅ Overcurrent | Direct — current exceeds rated |
| Ground Fault / Short Circuit | ✅ Overcurrent (severe) | Extreme current spike |

#### Sensor Types
- **3-phase voltage** (Va, Vb, Vc) in volts
- **3-phase current** (Ia, Ib, Ic) in amperes
- Measurements pre-aggregated: RMS per phase per sample row (not raw waveforms)

#### Sampling Rate
Pre-computed RMS values — **not raw time-domain waveforms.** Original measurement rate varies by variant (typically 1–10 samples/second per condition). THD is **not directly available** but derivable from single-phase amplitude ratios across conditions.

#### File Format
**CSV** — directly importable. Multiple variants with different column naming. Typical row: `[Va, Vb, Vc, Ia, Ib, Ic, label]`. ~10,000–25,000 rows depending on variant.

#### License
**Open / CC BY 4.0** (varies by upload). Most variants are unrestricted. Verify per specific upload before use.

#### Data Quality
- **Moderate quality.** RMS aggregation loses waveform information; THD cannot be exactly derived.
- Class balance is reasonable (roughly equal samples per condition).
- Fault conditions are clearly defined and physically meaningful.
- **Limitation:** Pre-aggregated values limit spectral feature extraction. No vibration/acoustic data.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Notes |
|-------------------|---------------|-------|
| `current_amps` | ✅ Direct | Per-phase current; derive total RMS or dominant phase |
| `frequency_hz` | ⚠️ Inferred | Assume 50 Hz nominal; not recorded |
| `thd_pct` | ⚠️ Estimated | Derive rough THD proxy from phase imbalance ratios; not spectrally exact |
| `noise_db` / `vibration_db` | ❌ Absent | No acoustic or vibration sensor; must impute or use class-mean from CWRU |

**Overall compatibility: MEDIUM-HIGH for current features; LOW for vibration/acoustic features.**

#### Verdict: ✅ **INCLUDE — Primary Source for Phase Imbalance and Overcurrent**
Irreplaceable for the two fault classes not covered by bearing datasets. Phase Imbalance and Overcurrent samples are otherwise nearly impossible to collect from vibration-only rigs. The missing vibration column must be handled via imputation or cross-dataset feature alignment.

---

### Dataset 4 — MFPT Bearing Fault Dataset  
**Source:** Machinery Failure Prevention Technology Society  
**URL:** https://www.mfpt.org/fault-data-sets/  
**Kaggle repack:** `kaggle.com/datasets/vinayak123tyagi/bearing-dataset`

#### Overview
Bearing fault dataset collected from a laboratory test rig (MFPT Society). Includes normal baseline, outer race fault, and a small set of real-machine recordings donated by industry partners. One of the few datasets with confirmed real-machine (not just lab rig) samples.

#### Fault Classes Available

| Dataset Label | Maps to VoltGuard Class | Notes |
|---------------|------------------------|-------|
| Baseline / Normal | ✅ Normal | 3 recordings at 270 lbs load |
| Outer Race Fault | ✅ Bearing Wear | 7 recordings at varying loads |
| Real-machine OR fault | ✅ Bearing Wear / High Vibration | 3 real-world recordings |

**Missing:** Inner Race, Ball Fault, Phase Imbalance, Overcurrent, High THD (electrical)

#### Sensor Types
- **Accelerometer** (single axis): radial vibration only
- **No current sensor**

#### Sampling Rate
- **97,656 Hz** (lab test rig) — extremely high resolution
- **48,828 Hz** (real machine recordings)

#### File Format
MATLAB `.mat` files.

#### License
**Freely available.** MFPT Society permits research and educational use. No registration required.

#### Data Quality
- **Medium-high quality.** Small dataset (13 recordings total) limits class diversity.
- Real-machine recordings add practical value.
- No current data means THD cannot be derived from this dataset.
- **Limitation:** Only outer race faults; no inner race or ball fault; very small sample count.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Notes |
|-------------------|---------------|-------|
| `current_amps` | ❌ Absent | No current sensor |
| `thd_pct` | ❌ Not derivable | No current waveform to analyze |
| `noise_db` / `vibration_db` | ✅ Direct | Accelerometer → dB conversion |
| `frequency_hz` | ❌ Not available | |

**Overall compatibility: LOW (vibration only, no current or THD)**

#### Verdict: ⚠️ **CONDITIONAL INCLUDE — Augmentation Only**
Adds real-machine outer-race samples that differ texturally from CWRU's lab rig. Include only for the vibration (dB) feature when building a vibration-only model branch. Do **not** rely on it for current-based features. Recommended for augmentation, not primary training.

---

### Dataset 5 — FEMTO / PRONOSTIA Bearing Dataset  
**Source:** FEMTO-ST Institute, Besançon, France  
**URL:** https://ieee-dataport.org/open-access/pronostia (IEEE DataPort)  
**Also:** Available via PHM Society challenge archive

#### Overview
Run-to-failure bearing dataset designed for remaining useful life (RUL) prediction, not fault classification. Bearings were run continuously until total failure under constant load. Three platform configurations at different speed-load combinations.

#### Fault Classes Available
**No discrete fault labels.** Data is structured as continuous degradation trajectories. Fault state must be inferred from vibration amplitude growth over time. This is fundamentally a RUL/regression dataset, not a multi-class fault classification dataset.

#### Sensor Types
- Accelerometer (horizontal + vertical): vibration at 25.6 kHz
- Temperature (thermocouple)
- **No current sensor**

#### Sampling Rate
25,600 Hz (vibration, in 0.1s bursts every 10s)

#### File Format
CSV — time-indexed vibration and temperature readings per bearing.

#### License
**Open access** via IEEE DataPort. Free download, attribution required.

#### Data Quality
- **High quality for RUL tasks.** Well-documented experimental conditions.
- **Incompatible with VoltGuard's classification paradigm.** No discrete labels, no current measurements.
- Vibration only — cannot derive THD or current features.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Notes |
|-------------------|---------------|-------|
| `current_amps` | ❌ Absent | |
| `thd_pct` | ❌ Not derivable | |
| `noise_db` / `vibration_db` | ✅ Partial | Vibration only; no phase/electrical context |
| `frequency_hz` | ❌ Absent | |

**Overall compatibility: VERY LOW**

#### Verdict: ❌ **REJECT**
Wrong task paradigm (RUL, not classification). Missing current, THD, and frequency. Run-to-failure structure requires regression models, not the RF/XGB/IF classification/anomaly stack targeted by VoltGuard. No contribution to the 6 target fault classes.

---

### Dataset 6 — Kaggle: "Electric Motor Temperature" (Paderborn MagLab)  
**Source:** University of Paderborn, posted on Kaggle by Florian Pätzel  
**URL:** `kaggle.com/datasets/wkirgsn/electric-motor-temperature`

#### Overview
A large permanent-magnet synchronous motor (PMSM) dataset from a dynamometer test bench. Contains continuous recordings of voltage, current (dq-frame), temperatures, speed, and torque. Often cited in predictive maintenance literature.

#### Fault Classes Available
**None.** This is a **temperature prediction / regression dataset**. All recordings are from a healthy motor under varying load profiles. There are no fault conditions and no fault labels.

#### Sensor Types
- Motor speed, torque
- Stator and rotor temperatures (pm, stator_yoke, stator_tooth, stator_winding)
- d-axis / q-axis voltage and current (dq-transformed, not phase measurements)
- Coolant and ambient temperature

#### Sampling Rate
Not directly applicable — 1 Hz aggregated telemetry over multi-hour sessions.

#### File Format
CSV, ~1.3 million rows, ~128 MB.

#### License
**CC BY 4.0** — unrestricted.

#### Data Quality
High for temperature modeling. Irrelevant to fault classification.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Notes |
|-------------------|---------------|-------|
| `current_amps` | ⚠️ Partial | dq-frame current, not per-phase RMS — cannot directly compute THD |
| `thd_pct` | ❌ Not derivable | dq-transform removes harmonic content |
| `noise_db` / `vibration_db` | ❌ Absent | No vibration sensor |
| Fault labels | ❌ None | Healthy motor only |

#### Verdict: ❌ **REJECT**
No fault labels, wrong motor type (PMSM vs. induction), dq-transformed currents hide harmonic content needed for THD derivation, no vibration data. Zero contribution to target fault classes.

---

### Dataset 7 — AI4I 2020 Predictive Maintenance Dataset  
**Source:** UCI Machine Learning Repository; also on Kaggle  
**URL:** `kaggle.com/datasets/stephanmatzka/predictive-maintenance-dataset-ai4i-2020`

#### Overview
Synthetic dataset of 10,000 records representing a manufacturing process (CNC-like tool operation). Designed to benchmark predictive maintenance algorithms on tabular data.

#### Fault Classes Available

| Dataset Label | VoltGuard Relevance |
|---------------|---------------------|
| No Failure | — |
| Tool Wear Failure (TWF) | ❌ Tool wear — not a motor electrical fault |
| Heat Dissipation Failure (HDF) | ❌ Process heat, not motor thermal |
| Power Failure (PWF) | ⚠️ Tangential (power interruption, not motor current) |
| Overstrain Failure (OSF) | ❌ Mechanical tool strain — not motor electrical |
| Random Failure (RNF) | ❌ Synthetic noise |

#### Sensor Types
Synthetic tabular: air temperature, process temperature, rotational speed, torque, tool wear time (minutes). **No electrical current, no voltage, no vibration sensor, no THD.**

#### File Format
CSV, 10,000 rows.

#### License
**CC BY 4.0** — unrestricted.

#### Data Quality
Synthetic — mathematically generated with injected noise. Not representative of real motor electrical behavior.

#### Verdict: ❌ **REJECT**
Wrong domain (manufacturing tool, not induction motor). Features are process-level variables, not electrical sensor measurements. Synthetic data with no harmonic content. No contribution to any VoltGuard fault class.

---

### Dataset 8 — Southeast University (SEU) Gearbox/Motor Fault Dataset  
**Source:** Southeast University, Nanjing; available via research groups  
**Kaggle partial repack:** `kaggle.com/datasets/brjapon/sewage-pump-motor-fault-classification`  
(note: multiple SEU dataset repacks exist; verify provenance before use)

#### Overview
Lab dataset from a drivetrain fault simulator. Includes motor bearing faults and gearbox faults under variable speed and load. Focused on mechanical transmission rather than pure electrical fault signatures.

#### Fault Classes Available

| Dataset Label | Maps to VoltGuard Class | Notes |
|---------------|------------------------|-------|
| Healthy | ✅ Normal | |
| Chipped Tooth (gearbox) | ❌ No VoltGuard class | Gearbox fault, not motor |
| Missing Tooth (gearbox) | ❌ No VoltGuard class | Gearbox fault |
| Bearing Inner Race | ✅ Bearing Wear | Partial — gearbox context |
| Bearing Outer Race | ✅ Bearing Wear | Partial |

#### Sensor Types
- Vibration accelerometer (8 channels)
- Motor current (1 channel)
- No acoustic/noise sensor

#### Sampling Rate
**5,120 Hz** (vibration + current)

#### File Format
MATLAB `.mat` files.

#### License
**Open for academic use.** Source paper must be cited.

#### Data Quality
- Moderate quality for the vibration channels.
- Current signal available but at lower resolution than CWRU/Paderborn.
- Gearbox faults dilute the motor-specific fault signal.
- **Limitation:** Drivetrain complexity means bearing signatures are coupled with gearbox dynamics — harder to isolate pure motor bearing wear.

#### Compatibility with VoltGuard Telemetry

| VoltGuard Feature | Compatibility | Notes |
|-------------------|---------------|-------|
| `current_amps` | ✅ Partial | 1-channel current, 5 kHz — THD derivable |
| `thd_pct` | ✅ Derivable | FFT of current at 5 kHz (limited harmonic range) |
| `noise_db` / `vibration_db` | ✅ Derivable | 8-channel accelerometer → aggregate dB |
| `frequency_hz` | ✅ Derivable | Slip from current FFT |

**Overall compatibility: MEDIUM (gearbox coupling limits clean motor-class isolation)**

#### Verdict: ⚠️ **OPTIONAL — Low Priority**
Adds some Normal and Bearing Wear samples with both vibration and current, but gearbox coupling and low sampling rate limit usefulness. If CWRU + Paderborn provide sufficient Bearing Wear volume, skip this dataset to avoid label contamination from gearbox dynamics.

---

## 3. Fault Class Coverage Matrix

| Fault Class | CWRU | Paderborn KAt | Elec. Fault (Kaggle) | MFPT | SEU |
|-------------|:----:|:-------------:|:--------------------:|:----:|:---:|
| **Normal** | ✅ Rich | ✅ Rich | ✅ Good | ✅ Limited | ✅ Good |
| **Bearing Wear** | ✅ Rich | ✅ Rich (real damage) | ❌ | ✅ Limited OR-only | ✅ Limited |
| **High Vibration** | ✅ Derivable (combo faults) | ✅ Severe fatigue cases | ❌ | ❌ | ⚠️ Coupled |
| **High THD** | ✅ Derivable via FFT | ✅ Derivable via FFT | ⚠️ Estimated | ❌ | ⚠️ Low-res |
| **Phase Imbalance** | ❌ | ❌ | ✅ **Primary** | ❌ | ❌ |
| **Overcurrent** | ❌ | ❌ | ✅ **Primary** | ❌ | ❌ |

**Critical gap:** Without the Kaggle Electrical Fault dataset, Phase Imbalance and Overcurrent have **zero coverage** from any other evaluated dataset.

---

## 4. Recommended Dataset Combination

### Core Stack (Required)

```
CWRU Bearing Dataset
  + Paderborn KAt Bearing Dataset
  + Kaggle Electrical Fault Detection (Three-Phase Induction Motor)
```

This combination provides:
- **Normal:** 2,000–5,000 samples from CWRU baseline + Paderborn healthy bearings + electrical fault healthy class
- **Bearing Wear:** 8,000–15,000 samples from CWRU (IR, OR, ball, combined) + Paderborn (artificial + real fatigue)
- **High Vibration:** 2,000–4,000 samples — severe CWRU combo faults + large-defect Paderborn fatigue
- **High THD:** 1,500–3,000 samples — derived via FFT from CWRU/Paderborn current waveforms for high-THD operating conditions
- **Phase Imbalance:** 1,500–3,000 samples — Kaggle single-phasing class
- **Overcurrent:** 1,500–3,000 samples — Kaggle overloading + ground fault class

### Optional Augmentation

```
MFPT Bearing Dataset (vibration-only, outer race, real-machine samples)
```

Include only to add real-machine outer-race samples for the vibration feature branch. Do not use for current/THD features.

### Rejected Datasets

| Dataset | Reason |
|---------|--------|
| FEMTO/PRONOSTIA | RUL regression paradigm; no labels; no current; wrong task |
| Electric Motor Temperature (Kaggle) | No fault labels; healthy PMSM only; dq-frame hides harmonics |
| AI4I 2020 | Synthetic; tool/process faults; no motor electrical signals |
| SEU Gearbox | Low priority — gearbox coupling contaminates motor fault signatures; superseded by CWRU + Paderborn |

---

## 5. Model-Specific Recommendations

### Random Forest (RF) — Supervised Multi-class

**Recommended datasets:** CWRU + Paderborn KAt + Kaggle Electrical Fault  
**Feature set:**
- Direct: `current_amps`, `noise_db`
- Derived from FFT: `thd_pct`, `frequency_hz`
- Statistical window features: RMS, kurtosis, crest factor, skewness per signal window
- Derived: `anomaly_score` (apply VoltGuard's formula as a meta-feature)

**Key considerations:**
- Apply SMOTE or class-weighted training to compensate for Bearing Wear overrepresentation vs. Phase Imbalance/Overcurrent.
- Split by motor/experiment ID (not random row split) to prevent data leakage between test conditions.
- Target healthy:fault ratio of 0.8–1.5 as specified in VoltGuard's `TrainingDataStats` schema.

### XGBoost (XGB) — Supervised Multi-class

**Recommended datasets:** Same as RF  
**Feature set:** Same tabular features; XGBoost benefits more from raw statistical moments than from FFT-derived features, but both should be tested.

**Key considerations:**
- XGBoost is more tolerant of moderate class imbalance via `scale_pos_weight` tuning.
- Include interaction features: `thd_pct × noise_db` (directly relates to VoltGuard's High Vibration rule: THD > 10% AND dB > 82).
- The `anomaly_score` compound feature is a strong XGBoost predictor because it collapses the multi-sensor signal into a monotone scalar — include it.

### Isolation Forest (IF) — Unsupervised Anomaly Detection

**Recommended datasets:** CWRU (Normal class only) + Paderborn KAt (Healthy class only) + Kaggle Electrical Fault (Healthy class only)  
**Do NOT train on fault data for IF** — Isolation Forest learns the boundary of normality; fault samples must be excluded from training.

**Feature set:**
- `current_amps`, `thd_pct`, `noise_db`, `frequency_hz` (raw)
- Window statistical features: RMS, kurtosis, crest factor
- Do NOT include `anomaly_score` or `health_score` as IF features — they are labels/targets, not independent inputs

**Key considerations:**
- Isolation Forest will flag the "novel" fault types (Phase Imbalance, Overcurrent) most strongly because they deviate furthest from the normal current distribution.
- Tune `contamination` parameter against VoltGuard's `WARNING_THRESHOLDS.anomalyScore = 0.2` — the IF output should correlate with values above this threshold.
- Use IF as a complementary first-stage filter: flag anomalies first, then route to RF/XGBoost for fault class identification.

---

## 6. Feature Engineering Notes

### THD Derivation from Raw Current Waveforms

For datasets providing raw current time-series (CWRU, Paderborn KAt):

```
THD (%) = sqrt(sum(I_n^2, n=2..N)) / I_1 × 100

where:
  I_1 = fundamental component (50 Hz) from FFT
  I_n = nth harmonic amplitude
  N   = max harmonic order (recommend up to 10th = 500 Hz for 5 kHz+ sampling)
```

Window size recommendation: 1024 or 2048 samples with 50% overlap (Hanning window).

### Vibration → dB Conversion

For accelerometer data (CWRU, Paderborn, MFPT):

```
dB_vibration = 20 × log10(a_rms / a_ref)

where a_ref = 1e-6 m/s² (standard vibration reference)
```

Map the resulting dB range to VoltGuard's thresholds: 70 dB nominal, 82 dB warning, 95 dB critical trip.

### Cross-Dataset Feature Alignment

The core challenge is that CWRU/Paderborn provide vibration-primary data while the Kaggle Electrical dataset provides current-primary data without vibration. Two strategies:

1. **Feature subsetting per model input:** Train RF/XGBoost on common features (`current_amps`, `thd_pct`). For vibration-primary datasets, impute electrical features; for electrical-primary datasets, impute vibration features using class-conditional means from the other datasets.

2. **Separate feature branches:** Train a current-branch model (Kaggle Electrical data) alongside a vibration-branch model (CWRU/Paderborn), and ensemble at inference — this is the cleaner approach and avoids imputation bias.

### Sampling Rate Normalization

Raw waveforms across datasets range from 5,120 Hz (SEU) to 97,656 Hz (MFPT). Before FFT-based feature extraction, downsample all signals to a common rate:
- **Recommended common rate: 12,000 Hz** (matches CWRU standard files)
- Apply anti-aliasing filter before downsampling Paderborn (64 kHz → 12 kHz)

### Window Segmentation

Each raw recording must be segmented into fixed-length windows before tabular feature extraction:
- **Window size:** 4,096 samples at 12 kHz = ~341 ms per sample
- **Overlap:** 50%
- **Label:** Inherit fault label from parent recording (all windows in a fault recording share the same label)

---

## 7. Data Quality Warnings

| Risk | Affected Datasets | Mitigation |
|------|------------------|------------|
| **Leakage via test rig resonance** | CWRU (rig has known structural resonances at ~120 Hz) | Notch-filter structural resonance peaks before FFT; validate features are motor-not-rig-dependent |
| **Lab-to-field generalization gap** | All datasets | Supplement with VoltGuard's own `/telemetry/live-ingest` collected samples once operational; treat external datasets as pre-training, VoltGuard data as fine-tuning |
| **Class imbalance (Bearing Wear heavy)** | Combined stack | CWRU + Paderborn together produce 5–10× more Bearing Wear samples than Phase Imbalance / Overcurrent; apply SMOTE or class weights before training |
| **No VoltGuard-specific fault thresholds in source data** | All datasets | Apply VoltGuard's `classifyFaultType()` logic to relabelled derived features to ensure label consistency with production system |
| **Missing vibration in Electrical Fault dataset** | Kaggle Electrical Fault | Use class-conditional mean dB from CWRU Normal class for healthy rows; for fault rows, assign estimated dB from fault class mean |
| **THD derivation accuracy limited at low sampling rates** | SEU (5 kHz), some Kaggle repacks | Only derive up to 5th harmonic at 5 kHz; flag derived THD as lower-confidence |
| **Kaggle repack provenance variability** | Kaggle mirrors of CWRU, Paderborn | Always verify SHA checksum against original source files; multiple Kaggle repacks have label or unit errors |

---

## 8. Summary Verdict Table

| Dataset | Verdict | Primary Role | Missing VoltGuard Features |
|---------|---------|-------------|---------------------------|
| CWRU Bearing (Case Western) | ✅ **Include** | Normal, Bearing Wear, High Vibration | Phase Imbalance, Overcurrent |
| Paderborn KAt Bearing | ✅ **Include** | Bearing Wear (real damage), Normal | Phase Imbalance, Overcurrent |
| Kaggle Electrical Fault (3-phase induction) | ✅ **Include** | Phase Imbalance, Overcurrent, Normal | Vibration/dB |
| MFPT Bearing | ⚠️ **Optional** | Outer-race Bearing Wear augmentation | Current, THD, frequency |
| SEU Gearbox/Motor | ⚠️ **Low priority** | Skip if CWRU+Paderborn sufficient | Gearbox coupling, low-res current |
| FEMTO/PRONOSTIA | ❌ **Reject** | RUL task — wrong paradigm | Current, THD, frequency, labels |
| Electric Motor Temperature (Kaggle) | ❌ **Reject** | No faults — healthy PMSM only | All fault labels |
| AI4I 2020 Predictive Maintenance | ❌ **Reject** | Synthetic, wrong domain | All motor electrical signals |

---

*End of dataset audit. No training code was written. No project files were modified.*
