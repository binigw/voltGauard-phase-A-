# VoltGuard AI — Data Preparation Pipeline
## From Raw Datasets to Final Training-Ready merged_clean.csv

**Date:** 2026-07-18  
**Status:** Design specification — no code  
**Scope:** All preprocessing stages from raw source files through label mapping, feature extraction, normalization, outlier removal, class balancing, splitting, and final dataset structure  
**Sources:** CWRU Bearing · Paderborn KAt · Kaggle Electrical Fault · VoltGuard Live Telemetry  
**Target:** `merged_clean.csv` — final training dataset for Random Forest, XGBoost, and Isolation Forest

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Source Dataset Inventory](#2-source-dataset-inventory)
3. [Stage 1 — Raw Data Loading](#3-stage-1--raw-data-loading)
4. [Stage 2 — Resampling to 12 kHz](#4-stage-2--resampling-to-12-khz)
5. [Stage 3 — Signal Filtering](#5-stage-3--signal-filtering)
6. [Stage 4 — Window Segmentation](#6-stage-4--window-segmentation)
7. [Stage 5 — FFT Processing](#7-stage-5--fft-processing)
8. [Stage 6 — Feature Extraction](#8-stage-6--feature-extraction)
9. [Stage 7 — Label Mapping](#9-stage-7--label-mapping)
10. [Stage 8 — VoltGuard Live Telemetry Integration](#10-stage-8--voltguard-live-telemetry-integration)
11. [Stage 9 — Dataset Merging](#11-stage-9--dataset-merging)
12. [Stage 10 — Outlier Detection and Removal](#12-stage-10--outlier-detection-and-removal)
13. [Stage 11 — Normalization and Feature Scaling](#13-stage-11--normalization-and-feature-scaling)
14. [Stage 12 — Class Balancing with SMOTE](#14-stage-12--class-balancing-with-smote)
15. [Stage 13 — Train / Validation / Test Splitting](#15-stage-13--train--validation--test-splitting)
16. [Stage 14 — Final Dataset Validation](#16-stage-14--final-dataset-validation)
17. [Final merged_clean.csv Structure](#17-final-merged_cleancsv-structure)
18. [Pipeline Execution Order and Dependencies](#18-pipeline-execution-order-and-dependencies)
19. [Intermediate File Manifest](#19-intermediate-file-manifest)
20. [Quality Gates](#20-quality-gates)

---

## 1. Pipeline Overview

The data preparation pipeline has **14 sequential stages** grouped into four logical phases:

```
PHASE 1: ACQUISITION (Stages 1–2)
  Load raw source files → resample to common 12 kHz

PHASE 2: SIGNAL PROCESSING (Stages 3–6)
  Filter → segment → FFT → extract 62 features per window

PHASE 3: UNIFICATION (Stages 7–11)
  Map labels → integrate live telemetry → merge datasets → remove outliers → scale features

PHASE 4: DATASET FINALIZATION (Stages 12–14)
  Class balance (SMOTE) → stratified split → validate → produce merged_clean.csv
```

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOURCES                                                                  │
│  CWRU (.mat)   Paderborn (.mat)   Kaggle (CSV)   VoltGuard (DB/CSV)      │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 1: Raw Loading    │  Per-source loaders
                    │  → Structured buffer     │  Handle .mat, CSV, DB
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 2: Resample       │  All → 12,000 Hz
                    │  → 12 kHz time series    │  Anti-alias before decimate
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 3: Filter         │  HPF + Notch + LPF
                    │  → Clean waveforms       │  Per-channel filter chain
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 4: Windowing      │  N=4096, 50% overlap
                    │  → Window array          │  Hanning taper applied
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 5: FFT            │  4096-pt DFT
                    │  → Magnitude spectrum    │  + Hilbert envelope
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 6: Feature        │  62 features/window
                    │  Extraction              │  Groups A–F
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 7: Label Mapping  │  → 6 VoltGuard classes
                    │  → Labelled rows         │  Per-source rules
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 8: VoltGuard      │  Direct scalar features
                    │  Live Telemetry          │  from /training-data/export.csv
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 9: Merge          │  4 sources → one frame
                    │  → raw_merged.csv        │  Source tag retained
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 10: Outliers      │  IQR + LOF per class
                    │  → clean frame           │  Max 5% removal
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 11: Normalize     │  RobustScaler / MinMax
                    │  → scaled frame          │  Fit on train only
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 12: SMOTE         │  Per-class target counts
                    │  → balanced frame        │  Only on train split
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 13: Split         │  Train / Val / Test
                    │  → 3 partitions          │  Motor-aware stratified
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  STAGE 14: Validate      │  Quality gates
                    │  → merged_clean.csv      │  Schema + distributions
                    └─────────────────────────┘
```

---

## 2. Source Dataset Inventory

| Source ID | Dataset | Raw Format | Approx. Size | Native Rate | Channels Available |
|-----------|---------|-----------|-------------|------------|-------------------|
| `cwru` | CWRU Bearing Data Center | `.mat` (MATLAB) | ~2 GB | 12 kHz / 48 kHz | Vibration (drive-end, fan-end), motor current (select files) |
| `paderborn` | Paderborn KAt Bearing | `.mat` (MATLAB) | ~26 GB | 64 kHz | Vibration (x,y), motor current (3-phase), temperature, radial force |
| `kaggle_elec` | Kaggle Electrical Fault Detection (Three-Phase Induction Motor) | `.csv` | ~30 MB | Pre-aggregated RMS (not raw waveform) | 3-phase voltage (Va,Vb,Vc), 3-phase current (Ia,Ib,Ic), fault label |
| `voltguard` | VoltGuard Live Telemetry (`/training-data/export.csv`) | `.csv` | Growing | Per-window scalar | current_amps, frequency_hz, thd_pct, noise_db, anomaly_score, health_score, fault_label |

---

## 3. Stage 1 — Raw Data Loading

Each source requires a dedicated loader that produces a **Structured Buffer** — a standardized in-memory representation before any signal processing.

### Structured Buffer Schema

```
StructuredBuffer {
  source_id       : string       ("cwru" | "paderborn" | "kaggle_elec" | "voltguard")
  recording_id    : string       Unique identifier within the source (e.g. "CWRU_DE_OR021_1")
  motor_id        : string       Motor or bearing identifier within the source
  fault_class_raw : string       Original label from the dataset (e.g. "OR021", "KA01", "Overloading")
  load_condition  : float | null  Load in HP or Nm; null if not available
  speed_rpm       : float | null  Shaft speed; null if not available
  current_12k     : float[]      Current waveform at 12 kHz (after resampling, Stage 2)
  vibration_12k   : float[]      Vibration waveform at 12 kHz (after resampling, Stage 2)
  sample_rate_hz  : int          Original native sample rate before resampling
  is_precomputed  : bool         true for kaggle_elec and voltguard (no raw waveform available)
}
```

### 3.1 CWRU Loader

CWRU `.mat` files contain variable-length arrays named by channel. Each file represents one experimental condition (bearing type × fault size × load).

**File naming convention:**
```
{fault_location}{fault_diameter}_{load_hp}.mat

Examples:
  OR021_0.mat   → Outer race, 0.021" defect, 0 HP load
  IR014_1.mat   → Inner race, 0.014" defect, 1 HP load
  B028_3.mat    → Ball, 0.028" defect, 3 HP load
  Normal_2.mat  → Normal/baseline, 2 HP load
```

**Channel extraction rules:**
- Variable `DE_time` or `X097_DE_time` → drive-end accelerometer (primary vibration channel)
- Variable `FE_time` or `X097_FE_time` → fan-end accelerometer (secondary; use if DE absent)
- Variable `BA_time` or `X097_BA_time` → base accelerometer (discard — structural, not motor)
- Variable `RPM` → shaft speed (scalar)
- Current channel: available only in files from the extended dataset (variable `I_time`). If absent, mark `current_12k = null` and derive current proxy from vibration in Stage 6.

**CWRU load-to-RPM mapping** (use when RPM variable absent):
```
0 HP → 1797 RPM → slip ≈ 0.17%
1 HP → 1772 RPM → slip ≈ 1.56%
2 HP → 1750 RPM → slip ≈ 2.78%
3 HP → 1730 RPM → slip ≈ 3.89%
```

**Native sampling rate detection:**
```
if filename contains "12k" or file size < 50 MB → 12,000 Hz
if filename contains "48k" or file size > 200 MB → 48,000 Hz
```

**CWRU loading output:**
- One `StructuredBuffer` per unique (fault_class_raw, load_condition) combination
- 48 kHz files: mark `sample_rate_hz = 48000` and resample in Stage 2
- 12 kHz files: mark `sample_rate_hz = 12000` and skip resampling in Stage 2

### 3.2 Paderborn KAt Loader

Paderborn files are organized by bearing condition code. Each `.mat` file contains one 4-second measurement window at 64 kHz.

**Directory structure:**
```
KAt_dataset/
  K001/    ← Healthy bearing, condition K001
    K001_1.mat, K001_2.mat, ... K001_20.mat  (20 measurements)
  KA01/    ← Artificial inner race fault
    ...
  KI04/    ← Artificial outer race fault
    ...
  KA16/    ← Real fatigue damage
    ...
```

**Variable extraction from each `.mat`:**
- `Sensor_Data.ch1` → vibration (X-axis)
- `Sensor_Data.ch2` → vibration (Y-axis) — use X-axis only (radial); discard Y for simplicity
- `Sensor_Data.ch3` → current (phase A) — primary current channel
- `Sensor_Data.ch4` → torque sensor — discard
- `Sensor_Data.ch5` → temperature — discard (not a VoltGuard feature)
- `Meta_Data.Speed` → shaft speed in RPM
- `Meta_Data.Load_Torque` → load in Nm

**Condition code classification:**
```
Healthy codes   : K001, K002, K003, K004
Artificial fault: KA01–KA09 (inner race), KI01–KI14 (outer race)
Real damage     : KA16–KA30 (combined fatigue; severity varies)
```

**Paderborn loading output:**
- One `StructuredBuffer` per `.mat` file (already 4-second windows, but will be re-segmented in Stage 4 for consistent window size)
- `sample_rate_hz = 64000` for all files
- All files have both current and vibration channels

### 3.3 Kaggle Electrical Fault Loader

This dataset is pre-aggregated — no raw waveforms. Each row contains RMS measurements per fault condition. The loader maps CSV rows directly to a partial `StructuredBuffer` with `is_precomputed = true`.

**Expected CSV columns** (verify against downloaded file; column names vary across Kaggle uploads):
```
Ia, Ib, Ic     → 3-phase current RMS (A)
Va, Vb, Vc     → 3-phase voltage RMS (V)  [optional — use if present]
Output         → fault label string
```

**Column name normalization** (handle multiple Kaggle upload variants):
```
Normalize to: {Ia, Ib, Ic, Va, Vb, Vc, label_raw}

Known variants:
  "Ia(A)" → Ia,  "Phase_A_Current" → Ia,  "ia" → Ia  (case-insensitive strip)
  "Output" → label_raw,  "Fault_Type" → label_raw,  "label" → label_raw
```

**Derived features computed at load time** (since no raw waveform is available):
```
current_rms_total = sqrt((Ia² + Ib² + Ic²) / 3)
current_imbalance = std([Ia, Ib, Ic]) / mean([Ia, Ib, Ic])
voltage_rms_total = sqrt((Va² + Vb² + Vc²) / 3)  [if voltage available]
```

**Kaggle loading output:**
- One `StructuredBuffer` (partial, `is_precomputed = true`) per CSV row
- `current_12k = null`, `vibration_12k = null` (no raw waveform)
- FFT-based features (Groups B, C, D) will be imputed in Stage 6

### 3.4 VoltGuard Telemetry Loader

The VoltGuard system exports its training dataset via `GET /training-data/export.csv`. This is also pre-aggregated scalar data with VoltGuard-native features and confirmed labels.

**Expected CSV columns** (from OpenAPI spec):
```
id, captured_at, source, motor_id, motor_name, motor_type, motor_location,
current_amps, frequency_hz, thd_pct, noise_db, vibration_db,
anomaly_score, health_score, derived_status, fault_label,
relay_tripped, alert_severity, days_to_failure
```

**Loading rules:**
- Filter `source = "telemetry_update"` or `"live_ingest"` — both are valid training samples
- Discard rows where `fault_label = NULL` or `fault_label = ""` — unlabelled samples
- Keep `relay_tripped = true` rows — these are confirmed critical fault events and are valuable
- Map `motor_id` to a unique string: `"voltguard_{motor_id}"` (namespace to avoid ID collision with other datasets)

**VoltGuard loading output:**
- One partial `StructuredBuffer` per CSV row
- `is_precomputed = true`
- Has native VoltGuard features: `thd_pct`, `noise_db`, `current_amps` — these are the authoritative scalar values
- Already has fault label in VoltGuard's class names → label mapping in Stage 7 is a direct pass-through

---

## 4. Stage 2 — Resampling to 12 kHz

All raw waveform sources must be resampled to a common 12,000 Hz before any further processing.

### Resampling Decision Table

| Source | Native Rate | Action |
|--------|------------|--------|
| CWRU (12 kHz files) | 12,000 Hz | **Skip** — already at target |
| CWRU (48 kHz files) | 48,000 Hz | **Downsample 4:1** |
| Paderborn KAt | 64,000 Hz | **Downsample ~5.33:1** |
| Kaggle Electrical | Pre-aggregated | **Skip** — no waveform |
| VoltGuard | Pre-aggregated | **Skip** — no waveform |

### Downsampling Protocol

For any source where `sample_rate_hz ≠ 12000`:

**Step 1: Anti-aliasing low-pass filter (applied before decimation)**
- Type: Butterworth, 8th order
- Cutoff: 5,800 Hz (slightly below new Nyquist of 6,000 Hz to provide rolloff margin)
- Applied forward-backward (`filtfilt`) to achieve zero phase shift

**Step 2: Decimation**
- Compute decimation factor `D = round(native_rate / 12000)`
  - CWRU 48 kHz → D = 4
  - Paderborn 64 kHz → D = 5 (with 1,333 Hz residual — use polyphase resampling, not integer decimation)
- For non-integer D (Paderborn): use polyphase rational resampling with ratio 12000/64000 = 3/16

**Why polyphase for Paderborn:**  
Simple integer decimation with D=5 would give 12,800 Hz, not 12,000 Hz. Polyphase resampling handles the non-integer ratio exactly without introducing spectral distortion. The resampled waveform has exactly 12,000 samples per second.

**Verification after resampling:**  
Check that the 50 Hz fundamental is preserved: compute FFT of a 4096-sample window and verify `|X(k)| at k = round(50/2.93) = k_17` is the dominant peak. If another peak dominates, the resampling or anti-aliasing has corrupted the signal.

---

## 5. Stage 3 — Signal Filtering

Applied identically to CWRU and Paderborn waveforms. Kaggle and VoltGuard (pre-aggregated) skip this stage.

### Filter Chain — Current Channel

Applied in order:

```
1. DC block HPF (Butterworth, 2nd order, fc = 1 Hz, forward-backward filtfilt)
   Purpose: Remove CT magnetization DC offset

2. Structural resonance notch (IIR, Q=35, fn = 100 Hz)
   Purpose: Remove test-rig 2× line-frequency structural resonance (50 Hz supply)
   Note: Apply only to CWRU recordings — Paderborn rig has different resonance profile

3. Structural resonance notch (IIR, Q=35, fn = 150 Hz)
   Purpose: Remove 3× line-frequency resonance
   Note: CWRU only

4. Anti-alias guard LPF (Butterworth, 8th order, fc = 5,990 Hz)
   Purpose: Final Nyquist guard — already applied in Stage 2 but re-applied after notch
   to catch any numerical artifact from filter transients
```

### Filter Chain — Vibration Channel

```
1. DC block HPF (Butterworth, 2nd order, fc = 1 Hz, forward-backward filtfilt)
   Purpose: Remove sensor bias

2. Electromagnetic coupling notch (IIR, Q=50, fn = 50 Hz)
   Purpose: Remove power-line EM coupling into accelerometer

3. Anti-alias guard LPF (Butterworth, 8th order, fc = 5,990 Hz)
   Purpose: Final guard
```

### Filter Transient Handling

IIR filters produce transients at the beginning and end of a finite signal. To avoid these corrupting the first and last windows:

- Pad each waveform with 1,000 samples (zero-padding) at start and end before filtering
- Apply filters
- Trim the 1,000-sample pads after filtering
- The resulting filtered waveform has valid signal throughout its length

---

## 6. Stage 4 — Window Segmentation

Applied to all sources that have raw waveforms (CWRU, Paderborn). Kaggle and VoltGuard rows are already individual samples and skip this stage.

### Segmentation Parameters

```
N      = 4,096 samples  (341.3 ms at 12 kHz)
STRIDE = 2,048 samples  (50% overlap)
WINDOW = Hanning taper  (applied multiplicatively to each window before FFT)
```

### Segmentation Procedure

For each `StructuredBuffer` with `is_precomputed = false`:

```
1. Compute number of windows:
   n_windows = floor((len(waveform) − N) / STRIDE) + 1

2. For window i (0-indexed):
   start = i × STRIDE
   end   = start + N
   I_win[i] = current_12k[start:end]     × hanning_window(N)
   V_win[i] = vibration_12k[start:end]   × hanning_window(N)

3. Each window inherits all metadata from its parent StructuredBuffer:
   recording_id, motor_id, fault_class_raw, load_condition, speed_rpm, source_id

4. Minimum useful windows per recording:
   if n_windows < 20: log warning; discard recording as too short
```

### Hanning Window

```
w[n] = 0.5 × (1 − cos(2π × n / (N − 1)))  for n = 0, 1, ..., N−1

Amplitude correction factor = N / sum(w)   ≈ 2.0
Applied after FFT to correct for energy loss from windowing
```

### Output of Stage 4

Each window becomes a candidate row in the feature matrix. A 10-second CWRU recording at 12 kHz with 50% overlap produces:

```
n_windows = floor((120,000 − 4,096) / 2,048) + 1 = floor(56.6) + 1 = 57 windows
```

Expected total window count before outlier removal:
- CWRU: ~25,000–40,000 windows (varies by number of files downloaded)
- Paderborn: ~60,000–100,000 windows (26 GB dataset, many recordings)
- Kaggle Electrical: ~10,000–25,000 rows (pre-aggregated, no windowing)
- VoltGuard: variable (depends on operational data collected)

---

## 7. Stage 5 — FFT Processing

Applied to each window from Stage 4. Produces the spectral representation used by Stage 6 feature extraction.

### FFT Procedure per Window

```
Input:  I_win[N], V_win[N]   (Hanning-tapered, N=4096 samples)

1. Compute DFT:
   X_I[k] = DFT(I_win),  k = 0..N−1
   X_V[k] = DFT(V_win)

2. Compute single-sided magnitude spectrum (bins 0..N/2):
   |X_I[k]| = |X_I[k]| × (2/N)    for k = 1..N/2−1
   |X_I[0]| = |X_I[0]| × (1/N)    (DC bin)
   |X_I[N/2]| = |X_I[N/2]| × (1/N)  (Nyquist bin)
   Same for |X_V[k]|

3. Compute Power Spectral Density:
   PSD_I[k] = |X_I[k]|² × N / (12000 × sum(w²))
   PSD_V[k] = |X_V[k]|² × N / (12000 × sum(w²))

4. Compute frequency axis:
   f[k] = k × 12000 / N = k × 2.930 Hz   for k = 0..2047

5. Compute Hilbert envelope (vibration channel only):
   Analytic signal: z[n] = V_win[n] + j × H{V_win[n]}
   Envelope:        env_V[n] = |z[n]|
   Envelope FFT:    X_env[k] = DFT(env_V)

6. Outputs per window:
   mag_I[k]  : float[2048]    current magnitude spectrum
   mag_V[k]  : float[2048]    vibration magnitude spectrum
   psd_I[k]  : float[2048]    current PSD
   psd_V[k]  : float[2048]    vibration PSD
   env_V[n]  : float[4096]    vibration envelope (time domain)
   mag_env_V[k]: float[2048]  vibration envelope spectrum
```

### Key Frequency Bin Indices

Pre-compute these bin indices once (constants for all windows):

```
BINS = {
  f0        : round(50.0 / 2.930) = 17       (50 Hz fundamental)
  f0_lsb    : round(47.0 / 2.930) = 16       (lower slip sideband at 3% slip)
  f0_usb    : round(53.0 / 2.930) = 18       (upper slip sideband)
  H2        : round(100.0 / 2.930) = 34      (2nd harmonic)
  H3        : round(150.0 / 2.930) = 51      (3rd)
  H5        : round(250.0 / 2.930) = 85      (5th)
  H7        : round(350.0 / 2.930) = 119     (7th)
  H9        : round(450.0 / 2.930) = 153     (9th)
  H10       : round(500.0 / 2.930) = 170     (10th — THD ceiling)
  BPFO_lsb  : round((50.0 − 83.0) / 2.930) → negative → wrap to round(|50−83| / 2.930) = 11
  BPFO_usb  : round((50.0 + 83.0) / 2.930) = 45  (133 Hz)
  BPFI_lsb  : round((50.0 − 135.0) / 2.930) → 29 (absolute: 85 Hz)
  BPFI_usb  : round((50.0 + 135.0) / 2.930) = 63  (185 Hz)
  BSF_lsb   : round((50.0 − 55.0) / 2.930) = 2
  BSF_usb   : round((50.0 + 55.0) / 2.930) = 36
}
```

Note: Bearing frequencies assume a standard 6205 bearing and f_rot ≈ 24.25 Hz. For datasets that provide shaft speed (Paderborn: `Meta_Data.Speed`), compute f_rot = RPM/60 and recompute BPFO, BPFI, BSF per recording. Use a ±5 Hz search window (±2 bins) around expected frequency to find peak amplitude rather than reading a fixed bin.

---

## 8. Stage 6 — Feature Extraction

For each window, extract all 62 features defined in the Feature Extraction Architecture (`docs/feature-extraction-architecture.md`).

### 6.1 Pre-normalization Step (required before Group A)

Before computing Group A statistical features, compute and record `I_std` (raw standard deviation) as the amplitude scale:

```
I_std_raw  = std(I_win_before_hanning)  ← raw, before taper
V_std_raw  = std(V_win_before_hanning)
```

Then apply per-window Z-score normalization:
```
I_win_norm = (I_win − mean(I_win)) / I_std_raw
V_win_norm = (V_win − mean(V_win)) / V_std_raw
```

All Group A features except `I_rms`, `I_peak`, `I_std`, `V_rms`, `V_peak`, and `V_variance` are computed on the normalized waveforms. `I_rms`, `I_peak`, `I_std`, `V_rms`, `V_peak`, `V_variance` are computed on the **pre-normalization** waveforms to preserve absolute amplitude — these are the features that detect Overcurrent and Phase Imbalance.

### 6.2 Missing Channel Handling

For sources that lack one channel:

**CWRU files without current** (vibration only):
- Set all current-channel Group A features to `NaN`: `I_rms, I_peak, I_crest_factor, I_kurtosis, I_skewness, I_std, I_p2p, I_shape_factor, I_impulse_factor`
- Set all current spectral features to `NaN`: `I_fundamental_amp, I_thd, I_thd_3_5_7, I_slip_lsb_amp, I_slip_usb_amp, I_slip_sideband_ratio`
- Set all MCSA harmonic features to `NaN`: `H2_amp...bearing_sideband_to_fundamental`
- Set cross-channel features to `NaN`: `I_V_coherence, I_V_thd_to_db_ratio, phase_imbalance_proxy, overcurrent_margin`
- Set VoltGuard current composite: `vg_current_score = 0.0` (assume nominal current), `vg_anomaly_score` computed from THD + dB components only

**Kaggle Electrical files** (no raw waveform — pre-aggregated):
- Current features derivable from RMS values: set `I_rms = current_rms_total`, `I_std = current_imbalance × mean_current`
- All FFT-derived current features: `NaN` (no waveform to analyze)
- All vibration features: `NaN` (no vibration sensor)
- Group F VoltGuard composites: compute from `current_rms_total` using VoltGuard thresholds

**VoltGuard live telemetry**:
- `I_rms = current_amps` (direct)
- `I_thd` proxy = `thd_pct` (direct — VoltGuard's THD is already computed server-side)
- `V_db_rms = noise_db` (direct)
- `vg_anomaly_score = anomaly_score` (direct from VoltGuard)
- All FFT-derived features and envelope features: `NaN`

### 6.3 NaN Strategy

NaN values from missing channels are handled differently for each model:

- **Random Forest:** RF natively handles NaN if using sklearn's `HistGradientBoostingClassifier` (use this instead of standard `RandomForestClassifier` for the mixed dataset). Alternatively, impute NaN with class-conditional medians (computed from complete-channel rows of the same fault class).
- **XGBoost:** Handles NaN natively by learning the best default direction for missing values at each split. No imputation needed.
- **Isolation Forest:** Cannot handle NaN. Impute with class-conditional medians before IF training, or train IF on the subset of features with no NaN values (feature subset: Groups D + E + F have no NaN for any source).

**Class-conditional median imputation procedure:**
```
For each feature f with NaN values:
  For each fault class c:
    median_f_c = median(rows where label=c AND feature_f is not NaN)
    Fill: rows where label=c AND feature_f is NaN → median_f_c

Exception: Do not impute I_rms, I_std, overcurrent_margin, phase_imbalance_proxy
from class-conditional medians — these are the PRIMARY discriminants for
Phase Imbalance and Overcurrent. Imputing them from class means defeats their purpose.
For these features, impute from the NORMAL class median only (a conservative safe default).
```

---

## 9. Stage 7 — Label Mapping

Every raw label from every source must be mapped to one of the six VoltGuard fault classes:

```
LABEL_MAP = {
  0: "Normal"
  1: "Bearing Wear"
  2: "High THD"
  3: "High Vibration"
  4: "Phase Imbalance"
  5: "Overcurrent"
}
```

### 7.1 CWRU Label Mapping

| CWRU Label | Fault Size | VoltGuard Class | Numeric |
|------------|-----------|-----------------|---------|
| `Normal` | — | Normal | 0 |
| `IR007`, `IR014`, `IR021`, `IR028` | 0.007"–0.028" | Bearing Wear | 1 |
| `OR007@6`, `OR014@6`, `OR021@6` | 0.007"–0.021", 6 o'clock | Bearing Wear | 1 |
| `OR007@3`, `OR014@3`, `OR021@3` | 0.007"–0.021", 3 o'clock | Bearing Wear | 1 |
| `OR007@12`, `OR014@12`, `OR021@12` | 0.007"–0.021", 12 o'clock | Bearing Wear | 1 |
| `B007`, `B014`, `B021`, `B028` | 0.007"–0.028" | Bearing Wear | 1 |
| Combined `IR + OR` (if any) | — | High Vibration | 3 |

**CWRU severity sub-labelling:**  
For tree model feature importance analysis, record the original fault size as a metadata column (`cwru_defect_diameter`) but do NOT use it as a label. The fault class is binary: present or absent. Defect size affects feature values (larger defect → higher kurtosis) but not the class label.

**CWRU class not represented:**  
CWRU does not produce High THD (electrical), Phase Imbalance, or Overcurrent class samples. These classes will come from Paderborn (limited THD from current harmonics at large defects) and Kaggle Electrical.

### 7.2 Paderborn KAt Label Mapping

| Paderborn Code | Description | VoltGuard Class | Numeric |
|----------------|-------------|-----------------|---------|
| K001–K004 | Healthy | Normal | 0 |
| KA01–KA09 | Artificial inner race damage | Bearing Wear | 1 |
| KI01–KI14 | Artificial outer race damage | Bearing Wear | 1 |
| KA16, KA22, KA30 | Real damage, mild–moderate | Bearing Wear | 1 |
| KA17, KA19, KA21 | Real damage, severe | High Vibration | 3 |
| KA18, KA20, KA23–KA29 | Real damage, moderate–severe | Bearing Wear or High Vibration (see note) |

**Paderborn High Vibration threshold:**  
A Paderborn recording is labelled High Vibration (class 3) rather than Bearing Wear (class 1) when the derived `V_db_rms` feature exceeds 82 dB **and** `I_thd` exceeds 10% after feature extraction. This mirrors VoltGuard's `classifyFaultType()` joint-threshold rule for High Vibration: `THD > 10% AND dB > 82`.

If a Paderborn "severe damage" recording produces `V_db_rms < 82` or `I_thd < 10%`, it remains Bearing Wear regardless of the damage label in the dataset documentation.

**This is critical:** Labels are assigned by VoltGuard's rule logic, not by the source dataset's damage description. The rule engine is the authoritative label source for ambiguous Paderborn severe-damage cases.

### 7.3 Kaggle Electrical Fault Label Mapping

| Kaggle Label | VoltGuard Class | Numeric | Notes |
|-------------|-----------------|---------|-------|
| `Healthy` / `No Fault` / `Normal` | Normal | 0 | |
| `Single Phasing` / `Single Phase Fault` / `One Phase Lost` | Phase Imbalance | 4 | Direct |
| `Two Phase Fault` | Phase Imbalance | 4 | Still an imbalance condition |
| `Overloading` / `Over Current` / `Overcurrent` | Overcurrent | 5 | Direct |
| `Ground Fault` / `Short Circuit` | Overcurrent | 5 | Extreme current — same class |
| `Over Voltage` | High THD | 2 | Over-voltage causes harmonic current distortion |
| `Under Voltage` | Bearing Wear | 1 | Reduced voltage → increased slip → bearing-wear current signature (partial; low confidence) |
| `Three Phase Fault` | Phase Imbalance | 4 | All three phases disrupted |

**Kaggle under-voltage mapping note:**  
Under-voltage maps to Bearing Wear with low confidence because the current signature (increased THD at 10–15% from elevated slip) partially overlaps the Bearing Wear zone. Rows labelled from under-voltage are tagged with `label_confidence = 0.70` to allow down-weighting during training.

### 7.4 Label Confidence Scores

Each row receives a `label_confidence` metadata field [0..1]:

| Source / Condition | Confidence |
|-------------------|------------|
| CWRU Normal | 1.00 |
| CWRU known fault (seeded) | 1.00 |
| Paderborn Healthy | 1.00 |
| Paderborn artificial fault (seeded) | 1.00 |
| Paderborn real fatigue — Bearing Wear | 0.95 |
| Paderborn real fatigue — High Vibration (derived by threshold) | 0.85 |
| Kaggle Healthy, Single Phasing, Overloading | 1.00 |
| Kaggle Ground Fault, Short Circuit → Overcurrent | 0.90 |
| Kaggle Over Voltage → High THD | 0.80 |
| Kaggle Under Voltage → Bearing Wear | 0.70 |
| VoltGuard relay_tripped = true | 1.00 |
| VoltGuard fault_label from rule engine | 0.95 |
| VoltGuard fault_label = "Anomaly Detected" | 0.50 — **exclude from supervised training** |

**Rows with `label_confidence < 0.70` are excluded from RF and XGB training.** They may optionally be included in Isolation Forest training (class-agnostic, only Normal class used).

---

## 10. Stage 8 — VoltGuard Live Telemetry Integration

VoltGuard's `/training-data/export.csv` produces a fundamentally different format from the signal-processing pipeline. It requires a separate integration path.

### 8.1 Feature Construction from VoltGuard Scalars

The VoltGuard export has scalar telemetry values (`current_amps`, `thd_pct`, `noise_db`, `frequency_hz`) but no raw waveforms. Feature groups A–D from the feature vector are not computable. Instead, populate the feature vector partially:

```
Feature mapping from VoltGuard scalars:

Group A (time-domain):
  I_rms   = current_amps                 ← direct
  I_std   = current_amps × 0.05         ← estimated 5% ripple (placeholder)
  V_db_rms = noise_db                   ← direct mapping
  All others in Group A → NaN

Group B (frequency-domain):
  I_thd   = thd_pct                     ← direct
  I_fundamental_amp = I_rms / sqrt(1 + (thd_pct/100)²)  ← approximate
  All others in Group B → NaN

Group C (MCSA harmonics) → NaN (no waveform)

Group D (vibration):
  V_db_rms = noise_db                   ← direct
  V_db_peak = noise_db + 3.0            ← approximate: peak ≈ RMS + 3 dB
  V_db_above_warning = max(0, noise_db − 82.0)  ← computable
  V_db_above_critical = max(0, noise_db − 95.0)  ← computable
  All envelope features → NaN

Group E (cross-channel):
  I_V_thd_to_db_ratio = thd_pct / (noise_db + ε)  ← computable
  overcurrent_margin = max(0, current_amps − 25.0)  ← computable
  phase_imbalance_proxy → NaN (no 3-phase breakdown)
  I_V_coherence → NaN

Group F (VoltGuard composites):
  vg_thd_score = min(1, max(0, (thd_pct − 5.0) / 15.0))
  vg_db_score  = min(1, max(0, (noise_db − 70.0) / 25.0))
  vg_current_score = [formula from severity.ts]
  vg_anomaly_score = anomaly_score                 ← direct from export
```

### 8.2 VoltGuard Data Quality Check

Before integration, apply quality filters:

```
EXCLUDE rows where:
  current_amps ≤ 0             (sensor error)
  thd_pct < 0 OR thd_pct > 100  (impossible value)
  noise_db < 30 OR noise_db > 130  (sensor error)
  fault_label = "Anomaly Detected"  (catch-all — no reliable class)
  relay_tripped = true AND fault_label = "Normal"  (contradictory — data error)
```

### 8.3 VoltGuard Sampling Bias Mitigation

VoltGuard's adaptive telemetry samples at 5-second intervals during anomaly conditions and 60-second intervals during normal operation. This creates a sampling bias: fault conditions are over-represented relative to their true occurrence rate.

**Correction:** Downsample VoltGuard fault-class rows to match the temporal density of normal-class rows:

```
Normal rows sampled at: 1 sample / 60 seconds
Fault rows sampled at:  1 sample / 5 seconds  → 12× over-represented

Correction: For each motor, when consecutive fault-class rows are < 30 seconds apart,
keep only 1 in every 12 fault-class rows (random selection).
This corrects the temporal bias without losing unique fault events.
```

Exception: `relay_tripped = true` rows are always kept regardless of downsampling.

---

## 11. Stage 9 — Dataset Merging

Combine all four source-specific feature matrices into one unified frame.

### 9.1 Schema Alignment

Before concatenation, verify all sources have identical column ordering:

```
CANONICAL_COLUMN_ORDER = [
  # Metadata (not features — kept for audit trail, dropped before model training)
  "row_id", "source_id", "recording_id", "motor_id",
  "window_index",      # window number within recording (CWRU/Paderborn only)
  "load_condition",    # HP or Nm; NaN for pre-aggregated sources
  "speed_rpm",         # shaft speed; NaN for pre-aggregated sources
  "label_confidence",  # [0..1] per row
  "captured_at",       # timestamp for VoltGuard; NaN for signal datasets

  # Features (indices 0–61, matching feature-extraction-architecture.md)
  "I_rms", "I_peak", "I_crest_factor", "I_kurtosis", "I_skewness",
  "I_std", "I_p2p", "I_shape_factor", "I_impulse_factor",
  "V_rms", "V_peak", "V_crest_factor", "V_kurtosis", "V_skewness",
  "V_peak2peak", "V_variance", "V_waveform_length", "V_zero_crossing_rate",
  "I_fundamental_amp", "I_thd", "I_thd_3_5_7",
  "I_slip_lsb_amp", "I_slip_usb_amp", "I_slip_sideband_ratio",
  "V_dominant_freq", "V_spectral_centroid", "V_spectral_bandwidth",
  "V_spectral_entropy", "V_high_band_energy", "V_low_band_energy",
  "H2_amp", "H3_amp", "H5_amp", "H7_amp", "H9_amp",
  "H3_H5_ratio", "H_odd_to_even_ratio", "I_harmonic_rolloff",
  "BPFO_lsb", "BPFO_usb", "BPFI_lsb", "BPFI_usb",
  "bearing_sideband_sum", "bearing_sideband_to_fundamental",
  "V_env_rms", "V_env_kurtosis", "V_env_bpfo_amp", "V_env_bpfi_amp", "V_env_bsf_amp",
  "V_db_rms", "V_db_peak", "V_db_above_warning", "V_db_above_critical", "V_1_3_octave_energy",
  "I_V_coherence", "I_V_thd_to_db_ratio", "phase_imbalance_proxy", "overcurrent_margin",
  "vg_thd_score", "vg_db_score", "vg_current_score", "vg_anomaly_score",

  # Label
  "fault_label",    # string: "Normal" | "Bearing Wear" | "High THD" | "High Vibration" | "Phase Imbalance" | "Overcurrent"
  "fault_class_id"  # int: 0 | 1 | 2 | 3 | 4 | 5
]
```

### 9.2 Pre-merge Row Counts (Expected)

| Source | Est. Rows Before Merge | Primary Classes |
|--------|------------------------|----------------|
| CWRU | 25,000–40,000 | Normal, Bearing Wear |
| Paderborn KAt | 60,000–100,000 | Normal, Bearing Wear, High Vibration |
| Kaggle Electrical | 10,000–25,000 | Normal, Phase Imbalance, Overcurrent, (High THD) |
| VoltGuard | Variable | All 6 classes (operational data) |
| **Total raw** | **~100,000–165,000** | |

### 9.3 Output: `raw_merged.csv`

The concatenated, un-cleaned dataset is saved as an intermediate file:

```
data/intermediate/raw_merged.csv
  Columns: all canonical columns above
  Rows: all rows from all sources
  NaN values: present (handled in Stage 12/13 normalization)
  Labels: string + integer, mapped to VoltGuard classes
  label_confidence: [0..1] per row
```

---

## 12. Stage 10 — Outlier Detection and Removal

Remove rows that are statistically extreme within their own class — these represent sensor errors, waveform corruption, or recording artifacts, not genuine fault signatures.

### 10.1 Per-Class IQR Outlier Removal

Applied independently per fault class on each feature in Group A (time-domain statistical features — most sensitive to sensor errors):

```
For each fault class c ∈ {0..5}:
  For each feature f ∈ {I_rms, I_kurtosis, V_kurtosis, V_crest_factor, V_db_rms, I_thd}:
    Q1 = 25th percentile of feature_f within class c
    Q3 = 75th percentile of feature_f within class c
    IQR = Q3 − Q1
    LOWER_FENCE = Q1 − 3.0 × IQR    (3×IQR = extreme outlier, not just mild)
    UPPER_FENCE = Q3 + 3.0 × IQR

    Flag row as outlier if feature_f < LOWER_FENCE OR feature_f > UPPER_FENCE

Remove rows flagged as outlier in ≥ 2 features simultaneously.
(A row with one extreme feature value is possibly a genuine fault event;
a row with two or more extreme values simultaneously is likely a sensor error.)
```

**Why 3×IQR and not 1.5×IQR:**  
Fault conditions genuinely produce extreme kurtosis values (bearing kurtosis = 15–30 is real, not an error). Standard 1.5×IQR would remove legitimate fault signatures. 3×IQR targets only sensor glitches and waveform corruption.

### 10.2 Local Outlier Factor (LOF) — Per Class

After IQR removal, apply Local Outlier Factor (n_neighbors=20) within each class to detect multivariate outliers:

```
For each fault class c:
  Compute LOF scores on the subset of rows with fault_class_id = c
  using features: {I_rms, I_kurtosis, V_kurtosis, I_thd, V_db_rms, vg_anomaly_score}

  Remove rows where LOF_score > 2.5
  (LOF > 2 generally indicates a significant outlier;
   2.5 is conservative to avoid removing genuine rare fault events)
```

### 10.3 Outlier Removal Cap

Apply a hard cap: **no more than 5% of rows per class** may be removed by outlier detection combined:

```
For each class c:
  max_removable = 0.05 × count(rows in class c)
  if IQR_removals + LOF_removals > max_removable:
    Sort flagged rows by outlier score (most extreme first)
    Remove only the top max_removable rows
```

This prevents aggressive outlier removal from eliminating genuine fault events in classes with inherently high variance (e.g., severe Bearing Wear kurtosis can be 20–50, which IQR would flag but is real).

### 10.4 Outlier Removal Log

Record a summary in the pipeline log:
```
Outlier removal summary:
  Normal:           removed X of Y rows (Z%)
  Bearing Wear:     removed X of Y rows (Z%)
  High THD:         removed X of Y rows (Z%)
  High Vibration:   removed X of Y rows (Z%)
  Phase Imbalance:  removed X of Y rows (Z%)
  Overcurrent:      removed X of Y rows (Z%)
```

---

## 13. Stage 11 — Normalization and Feature Scaling

Feature scaling is applied **after** the train/test split seed is determined (Stage 13 defines the split, Stage 11 fits scalers on the training partition only). Operationally, Stages 11 and 13 are interleaved: split first to identify train rows, then fit scalers on train rows, then apply to all partitions.

### 11.1 Scaler Assignment by Feature Group

| Feature Group | Features | Scaler | Rationale |
|---------------|----------|--------|-----------|
| A — Time-domain statistical | All 18 | **RobustScaler** (median, IQR) | Heavy-tailed distributions; kurtosis and crest factor have extreme values in fault conditions. StandardScaler would compress the fault-discriminating high end |
| B — Frequency-domain | All 12 | **MinMaxScaler** [0..1] | Non-negative, bounded by signal energy; relative magnitudes meaningful |
| C — MCSA harmonics | H2–H9 amplitudes, ratios | **RobustScaler** | Amplitudes have extreme values in fault conditions; ratios are naturally bounded |
| D — Vibration/acoustic dB | V_db_rms, V_db_peak | **None** (passthrough) | dB values are already on a physically meaningful scale aligned to VoltGuard thresholds (82, 95 dB). Scaling would break the threshold alignment |
| D — Vibration/acoustic dB excess | V_db_above_warning, V_db_above_critical | **None** (passthrough) | Already [0, ∞) with physically meaningful zero point |
| D — Envelope features | V_env_rms, V_env_kurtosis, envelope spectra | **RobustScaler** | Same rationale as Group A |
| D — V_1_3_octave_energy | scalar | **MinMaxScaler** | Normalized energy ratio |
| E — Cross-channel | I_V_coherence, I_V_thd_to_db_ratio | **MinMaxScaler** | Coherence ∈ [0..1]; ratio is positive and bounded by sensor ranges |
| E — Phase imbalance proxy | phase_imbalance_proxy | **MinMaxScaler** | Coefficient of variation ∈ [0, large] |
| E — Overcurrent margin | overcurrent_margin | **None** (passthrough) | Already in Amperes above threshold; physically meaningful zero point |
| F — VoltGuard composites | All 4 | **None** (passthrough) | Already [0..1] by construction. Must not be rescaled — preserves alignment with rule engine |

### 11.2 Scaler Fitting Protocol

```
FIT on: training split only (rows with split = "train")
APPLY to: train, validation, and test splits
SAVE to: data/scalers/{group_name}_scaler.pkl   (for inference-time application)

Scaler artifacts saved alongside model artifacts — always load together.
```

### 11.3 NaN Handling Before Scaling

Scalers cannot process NaN values. Apply class-conditional median imputation (defined in Stage 6.3) before fitting scalers:

```
Imputation order:
  1. Compute class-conditional medians from training rows only
  2. Apply imputation to training rows
  3. Apply same imputation values to validation and test rows
     (use training medians, not val/test medians — prevents data leakage)
  4. Save imputation table: data/imputation/class_conditional_medians.csv
```

---

## 14. Stage 12 — Class Balancing with SMOTE

After normalization, the dataset has severe class imbalance. CWRU and Paderborn contribute far more Bearing Wear and Normal samples than the Kaggle Electrical dataset contributes Phase Imbalance and Overcurrent samples.

### 12.1 Expected Pre-SMOTE Class Distribution

| Fault Class | Est. Count | % of Total | Problem |
|-------------|-----------|------------|---------|
| Normal | 30,000–50,000 | 30–40% | Over-represented |
| Bearing Wear | 40,000–70,000 | 40–50% | Severely over-represented |
| High THD | 2,000–5,000 | 2–4% | Under-represented |
| High Vibration | 5,000–10,000 | 5–8% | Under-represented |
| Phase Imbalance | 3,000–7,000 | 3–5% | Under-represented |
| Overcurrent | 3,000–7,000 | 3–5% | Under-represented |

Without balancing, RF and XGBoost would predict Bearing Wear for nearly everything, achieving high accuracy on the dominant class while failing on Phase Imbalance and Overcurrent — the safety-critical classes.

### 12.2 SMOTE Configuration

**SMOTE (Synthetic Minority Over-sampling Technique)** generates synthetic samples for minority classes by interpolating between existing samples in feature space.

**Applied only to the training split, never to validation or test splits.**

```
SMOTE parameters:
  algorithm    : SMOTE (standard, not ADASYN — more stable for industrial data)
  k_neighbors  : 5      (standard; 5 nearest neighbors for interpolation)
  random_state : 42     (reproducible)

Target distribution after SMOTE:
  Normal        : 30,000 samples   (downsample if > 35,000 before SMOTE)
  Bearing Wear  : 30,000 samples   (downsample + oversample if needed)
  High THD      : 15,000 samples   (oversample via SMOTE)
  High Vibration: 20,000 samples   (oversample via SMOTE)
  Phase Imbalance: 20,000 samples  (oversample via SMOTE)
  Overcurrent   : 20,000 samples   (oversample via SMOTE)
  ─────────────────────────────────
  Total training: ~135,000 samples

Rationale for unequal target counts:
  - Normal and Bearing Wear are the most common real-world conditions;
    giving them more samples matches prior probability
  - Safety-critical classes (Phase Imbalance, Overcurrent) are intentionally
    given 20,000 rather than 30,000 to avoid over-synthetic-sampling classes
    where real examples are sparse (risk of SMOTE artifacts)
  - High THD is given fewer because it overlaps with Bearing Wear in THD range
    10–15%; too many SMOTE samples can blur this boundary
```

### 12.3 SMOTE Application to NaN-Imputed Data

SMOTE requires complete rows (no NaN). Ensure imputation is complete before SMOTE runs. After SMOTE:
- Mark synthetic rows with `row_id = "SMOTE_{class}_{index}"`
- Mark `source_id = "smote_synthetic"`
- Do not save synthetic rows to `merged_clean.csv` features section — save them to a separate `smote_augmented_train.csv`

### 12.4 Under-sampling Strategy for Normal and Bearing Wear

When Natural count > target (30,000), apply **random under-sampling** with stratification by source:

```
Bearing Wear under-sampling:
  Preserve ratio of source contributions:
  Keep (cwru_count / total_bw) × 30,000 from CWRU
  Keep (paderborn_count / total_bw) × 30,000 from Paderborn
  This ensures both datasets contribute proportionally after balancing
```

### 12.5 SMOTE on Kaggle Electrical Dataset Rows

The Kaggle Electrical dataset has NaN for all FFT-derived features (no raw waveform). SMOTE on these rows would generate synthetic rows that also have NaN for those features — this is acceptable because XGBoost handles NaN natively.

For RF, which requires imputation, SMOTE is applied **after** imputation, so synthetic rows have imputed (not NaN) values for the missing features. The synthetic values interpolate between imputed values of real rows, which is a slight distortion but acceptable.

---

## 15. Stage 13 — Train / Validation / Test Splitting

### 15.1 Split Strategy

**Motor-aware stratified split** — windows from the same recording (CWRU) or same motor (VoltGuard) must not appear in both training and test partitions. This prevents data leakage where the model memorizes a specific motor's waveform characteristics rather than learning generalizable fault signatures.

```
Split ratios:
  Training   : 70%
  Validation : 15%
  Test       : 15%
```

### 15.2 Split Procedure

```
Step 1: Group rows by (source_id, motor_id) into "motor groups"
  Each unique (source_id, motor_id) combination is an atomic unit.
  Windows from the same motor stay together.

  CWRU motor groups:
    "cwru_Normal_0hp", "cwru_Normal_1hp", ..., "cwru_IR021_2hp", etc.
    Each motor group contains all windows from all files of that (fault_type, load) combination

  Paderborn motor groups:
    "paderborn_K001", "paderborn_KA01", ..., "paderborn_KA30"
    Each bearing condition code is one group

  Kaggle Electrical motor groups:
    Rows have no recording_id → group by label only: each fault class is one group
    (already pre-aggregated; no temporal structure to preserve)

  VoltGuard motor groups:
    "voltguard_{motor_id}" — each physical motor is one group

Step 2: Stratified split at motor-group level
  For each fault class c:
    Collect motor groups whose majority class is c
    Randomly assign 70% of groups to train, 15% to val, 15% to test
    random_state = 42

Step 3: Expand to row level
  Train rows = all rows belonging to train motor groups
  Val rows   = all rows belonging to val motor groups
  Test rows  = all rows belonging to test motor groups

Step 4: Verify split class distributions
  Each partition must have all 6 classes.
  If a class is missing from val or test (too few motor groups for that class),
  force at least 2 motor groups from that class into val and test.
```

### 15.3 Temporal Integrity Check

For VoltGuard live data (which has timestamps), enforce temporal split:

```
VoltGuard temporal constraint:
  All rows with captured_at before SPLIT_DATE go to train
  Rows between SPLIT_DATE and SPLIT_DATE + 30 days go to validation
  Rows after SPLIT_DATE + 30 days go to test

SPLIT_DATE = median timestamp of the VoltGuard export
```

This prevents the model from "seeing the future" when validated on VoltGuard's own data.

### 15.4 SMOTE Application Timing

SMOTE is applied ONLY to the training split AFTER splitting:

```
CORRECT order:
  1. Split → train / val / test
  2. Fit scalers on train
  3. Apply scalers to train, val, test
  4. Apply SMOTE to train only
  5. DO NOT apply SMOTE to val or test

INCORRECT (data leakage):
  ❌ Apply SMOTE to all data, then split
  ❌ Fit scalers on all data, then split
```

### 15.5 Expected Post-Split Counts

| Split | Before SMOTE | After SMOTE |
|-------|-------------|-------------|
| Train (70%) | ~70,000–115,000 | ~135,000 (SMOTE target) |
| Validation (15%) | ~15,000–25,000 | Unchanged |
| Test (15%) | ~15,000–25,000 | Unchanged |

---

## 16. Stage 14 — Final Dataset Validation

Before writing `merged_clean.csv`, run automated quality checks.

### Quality Gate Checklist

```
GATE 1: Class completeness
  All 6 classes present in train, validation, and test partitions
  Minimum per class per partition: 500 rows in train, 100 in val, 100 in test
  → FAIL if any class falls below minimum in any partition

GATE 2: Feature completeness
  For features expected to be non-NaN from all sources
  (Group F VoltGuard composites, V_db_above_warning, V_db_above_critical,
   overcurrent_margin, I_rms for rows with current):
  NaN rate must be < 5% for these features
  → FAIL if NaN rate exceeds 5% for any of these features

GATE 3: Label distribution check
  healthy_to_fault_ratio = count(Normal) / count(all_fault_classes)
  Target range: 0.3 – 0.6 after SMOTE
  → WARN if outside range (do not fail; SMOTE targets are configurable)

GATE 4: Feature scale check
  After normalization:
  All MinMax-scaled features must be in [0..1]
  All RobustScaler features must have median ≈ 0, IQR ≈ 1
  All passthrough features (Group F) must be in [0..1]
  → FAIL if any feature has value outside expected range by > 10%

GATE 5: Leakage check
  Verify no (source_id, motor_id) combination appears in both train and test
  → FAIL if any leakage detected

GATE 6: Source contribution check
  Each source must contribute ≥ 5% of training rows
  → WARN if any source contributes < 5% (possible loading failure)

GATE 7: Safety class presence
  Phase Imbalance AND Overcurrent each must have ≥ 1,000 rows in training split
  (These are the safety-critical classes — insufficient examples = unsafe model)
  → FAIL if either safety class has < 1,000 training rows

GATE 8: Correlation check
  No pair of features may have |Pearson correlation| > 0.98 within the training set
  → WARN and log collinear pairs (do not remove automatically — flag for human review)
```

---

## 17. Final merged_clean.csv Structure

The final output file is a single CSV with metadata, features, and labels for all three partitions. Model training scripts select the appropriate partition using the `split` column.

### 17.1 File Layout

```
data/merged_clean.csv
```

**Columns (in order):**

```
# ── Identity & provenance ─────────────────────────────────────────────
row_id              : string   Unique row identifier (e.g. "cwru_IR021_2hp_w0042")
source_id           : string   "cwru" | "paderborn" | "kaggle_elec" | "voltguard" | "smote_synthetic"
recording_id        : string   Source recording identifier; NaN for pre-aggregated sources
motor_id            : string   Motor/bearing identifier within source
window_index        : int      Window number within recording; NaN for pre-aggregated
load_condition      : float    Load in HP (CWRU) or Nm (Paderborn); NaN otherwise
speed_rpm           : float    Shaft RPM; NaN if not recorded
captured_at         : datetime Timestamp for VoltGuard rows; NaN for signal datasets
label_confidence    : float    [0..1] per Stage 7 mapping confidence
split               : string   "train" | "val" | "test"
is_synthetic        : bool     true for SMOTE-generated rows

# ── Features (62 total, Groups A–F) ──────────────────────────────────
# Group A — Time-domain statistical (18 features)
I_rms               : float    [pre-normalization, Amperes]
I_peak              : float    [pre-normalization, Amperes]
I_crest_factor      : float    [dimensionless]
I_kurtosis          : float    [dimensionless; Gaussian = 3]
I_skewness          : float    [dimensionless]
I_std               : float    [pre-normalization, Amperes]
I_p2p               : float    [pre-normalization, Amperes]
I_shape_factor      : float    [dimensionless]
I_impulse_factor    : float    [dimensionless]
V_rms               : float    [pre-normalization, m/s²]
V_peak              : float    [pre-normalization, m/s²]
V_crest_factor      : float    [dimensionless]
V_kurtosis          : float    [dimensionless; Gaussian = 3]
V_skewness          : float    [dimensionless]
V_peak2peak         : float    [pre-normalization, m/s²]
V_variance          : float    [pre-normalization, m²/s⁴]
V_waveform_length   : float    [dimensionless, sum of abs differences]
V_zero_crossing_rate : float   [crossings per sample]

# Group B — Frequency-domain (12 features)
I_fundamental_amp   : float    [scaled]
I_thd               : float    [%]
I_thd_3_5_7         : float    [%]
I_slip_lsb_amp      : float    [scaled]
I_slip_usb_amp      : float    [scaled]
I_slip_sideband_ratio : float  [dimensionless]
V_dominant_freq     : float    [Hz]
V_spectral_centroid : float    [Hz]
V_spectral_bandwidth : float   [Hz]
V_spectral_entropy  : float    [bits]
V_high_band_energy  : float    [fraction, 0..1]
V_low_band_energy   : float    [fraction, 0..1]

# Group C — MCSA harmonic (14 features)
H2_amp              : float    [scaled]
H3_amp              : float    [scaled]
H5_amp              : float    [scaled]
H7_amp              : float    [scaled]
H9_amp              : float    [scaled]
H3_H5_ratio         : float    [dimensionless]
H_odd_to_even_ratio : float    [dimensionless]
I_harmonic_rolloff  : float    [dB/octave, log-log slope]
BPFO_lsb            : float    [scaled]
BPFO_usb            : float    [scaled]
BPFI_lsb            : float    [scaled]
BPFI_usb            : float    [scaled]
bearing_sideband_sum : float   [scaled]
bearing_sideband_to_fundamental : float  [dimensionless]

# Group D — Vibration/acoustic (10 features)
V_env_rms           : float    [m/s²]
V_env_kurtosis      : float    [dimensionless]
V_env_bpfo_amp      : float    [scaled]
V_env_bpfi_amp      : float    [scaled]
V_env_bsf_amp       : float    [scaled]
V_db_rms            : float    [dB — NOT rescaled; physically meaningful]
V_db_peak           : float    [dB — NOT rescaled]
V_db_above_warning  : float    [dB excess above 82 dB; zero if below threshold]
V_db_above_critical : float    [dB excess above 95 dB; zero if below threshold]
V_1_3_octave_energy : float    [max 1/3-octave band energy, scaled]

# Group E — Cross-channel relational (4 features)
I_V_coherence       : float    [0..1]
I_V_thd_to_db_ratio : float    [scaled ratio]
phase_imbalance_proxy : float  [coefficient of variation, scaled]
overcurrent_margin  : float    [Amperes above 25 A threshold; zero if below]

# Group F — VoltGuard engine-aligned (4 features — NOT rescaled)
vg_thd_score        : float    [0..1]
vg_db_score         : float    [0..1]
vg_current_score    : float    [0..1]
vg_anomaly_score    : float    [0..1]

# ── Labels ────────────────────────────────────────────────────────────
fault_label         : string   "Normal" | "Bearing Wear" | "High THD" |
                                "High Vibration" | "Phase Imbalance" | "Overcurrent"
fault_class_id      : int      0 | 1 | 2 | 3 | 4 | 5
```

**Total columns: 11 metadata + 62 features + 2 labels = 75 columns**

### 17.2 Companion Output Files

```
data/
  merged_clean.csv                   ← Primary training dataset
  intermediate/
    raw_merged.csv                   ← Pre-outlier-removal merge (for debugging)
    outlier_removal_log.csv          ← Rows removed by Stage 10
  splits/
    train.csv                        ← Training split rows only
    val.csv                          ← Validation split rows only
    test.csv                         ← Test split rows only
    smote_augmented_train.csv        ← Training split + SMOTE synthetic rows (for RF/XGB)
    isolation_forest_train.csv       ← Normal-class rows only (for IF training)
  scalers/
    group_a_robust_scaler.pkl
    group_b_minmax_scaler.pkl
    group_c_robust_scaler.pkl
    group_d_envelope_robust_scaler.pkl
    group_d_octave_minmax_scaler.pkl
    group_e_minmax_scaler.pkl
  imputation/
    class_conditional_medians.csv    ← Imputation values fitted on train split
  reports/
    pipeline_summary.json            ← Row counts, class distributions, quality gate results
    feature_nan_rates.csv            ← NaN rate per feature per source
    class_distribution_by_source.csv ← Rows per class per source
    split_class_distribution.csv     ← Rows per class per split
```

---

## 18. Pipeline Execution Order and Dependencies

```
Stage 1: Load all four sources                  [parallelizable: all 4 sources independent]
           │
Stage 2: Resample CWRU 48kHz + Paderborn       [parallelizable: CWRU and Paderborn independent]
  Kaggle + VoltGuard: skip
           │
Stage 3: Filter CWRU + Paderborn                [parallelizable]
  Kaggle + VoltGuard: skip
           │
Stage 4: Window segment CWRU + Paderborn        [parallelizable]
  Kaggle + VoltGuard: skip (already row-per-sample)
           │
Stage 5: FFT — CWRU + Paderborn                 [parallelizable; can parallelize per recording]
  Kaggle + VoltGuard: skip
           │
Stage 6: Feature extraction — all sources       [parallelizable per source; Kaggle/VG use fast path]
           │
Stage 7: Label mapping — all sources            [parallelizable; fast, no computation]
           │
Stage 8: VoltGuard quality filter + temporal downsample  [independent of Stages 7 CWRU/Pad/Kaggle]
           │
Stage 9: Merge all into raw_merged.csv          [requires Stages 7+8 complete]
           │
Stage 10: Outlier removal                       [requires Stage 9]
           │
Stage 13a: Determine split assignments          [requires Stage 10; split before fitting scalers]
           │
Stage 11: Fit scalers on train; apply to all    [requires Stage 13a split assignments]
Stage 11b: Fit imputation on train; apply to all
           │
Stage 12: Apply SMOTE to train split only       [requires Stage 11]
           │
Stage 14: Quality gate validation               [requires Stage 12]
           │
Stage 14b: Write final merged_clean.csv + companions
```

---

## 19. Intermediate File Manifest

| File | Created After | Purpose | Delete After? |
|------|--------------|---------|--------------|
| `raw_merged.csv` | Stage 9 | Full merge before outlier removal | No — keep for debugging |
| `outlier_removal_log.csv` | Stage 10 | Audit trail of removed rows | No — keep for audit |
| `train.csv`, `val.csv`, `test.csv` | Stage 13 | Model training inputs | No — primary outputs |
| `smote_augmented_train.csv` | Stage 12 | RF/XGB training with synthetic rows | No — primary output |
| `isolation_forest_train.csv` | Stage 13 | IF training (Normal only) | No — primary output |
| `*.pkl` scalers | Stage 11 | Inference-time feature scaling | No — required for inference |
| `class_conditional_medians.csv` | Stage 11b | Inference-time NaN imputation | No — required for inference |
| `pipeline_summary.json` | Stage 14 | Pipeline health report | No — operational record |

---

## 20. Quality Gates

Summary of all quality gates and their blocking behavior:

| Gate | Stage | Check | Failure Mode | Blocking? |
|------|-------|-------|-------------|-----------|
| G1 | 14 | All 6 classes present in each split | Class missing from test | ✅ FAIL |
| G2 | 14 | NaN rate < 5% for non-optional features | High NaN in Group F | ✅ FAIL |
| G3 | 14 | Healthy/fault ratio 0.3–0.6 | Class imbalance remains | ⚠️ WARN |
| G4 | 14 | Feature scale within expected ranges | Scaler applied incorrectly | ✅ FAIL |
| G5 | 14 | No motor group in both train and test | Data leakage detected | ✅ FAIL |
| G6 | 14 | Each source ≥ 5% of training rows | Source loader failed | ⚠️ WARN |
| G7 | 14 | Phase Imbalance + Overcurrent ≥ 1,000 train rows | Safety-critical classes too sparse | ✅ FAIL |
| G8 | 14 | No feature pair with \|r\| > 0.98 | Severe collinearity | ⚠️ WARN |
| G9 | 2 | Resampled waveforms have 50 Hz dominant peak | Resampling corrupted signal | ✅ FAIL |
| G10 | 7 | No class assigned `label_confidence < 0.70` reaches model inputs | Low-confidence labels included | ✅ FAIL |

**FAIL gates block pipeline execution and require human intervention.**  
**WARN gates log and continue; results are flagged in `pipeline_summary.json`.**

---

*End of Data Preparation Pipeline. No code written. No project files modified except this document.*
