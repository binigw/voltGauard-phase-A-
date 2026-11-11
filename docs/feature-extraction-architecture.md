# VoltGuard AI — Feature Extraction Architecture
## MCSA Preprocessing Pipeline & ML Feature Vector Specification

**Date:** 2026-07-18  
**Status:** Design specification — no code  
**Scope:** Raw current + vibration → tabular feature vector for RF, XGBoost, and Isolation Forest  
**Target fault classes:** Normal · Bearing Wear · High THD · High Vibration · Phase Imbalance · Overcurrent

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Signal Acquisition & Sensor Specifications](#2-signal-acquisition--sensor-specifications)
3. [Stage 1 — Analog Conditioning & Anti-aliasing](#3-stage-1--analog-conditioning--anti-aliasing)
4. [Stage 2 — Window Segmentation](#4-stage-2--window-segmentation)
5. [Stage 3 — Signal Normalization & Detrending](#5-stage-3--signal-normalization--detrending)
6. [Stage 4 — Spectral Decomposition (FFT)](#6-stage-4--spectral-decomposition-fft)
7. [Stage 5 — Feature Extraction](#7-stage-5--feature-extraction)
   - [5A: Time-Domain Statistical Features](#5a-time-domain-statistical-features)
   - [5B: Frequency-Domain Features](#5b-frequency-domain-features)
   - [5C: MCSA Harmonic Features (Current)](#5c-mcsa-harmonic-features-current)
   - [5D: Vibration/Acoustic Features](#5d-vibrationacoustic-features)
   - [5E: Cross-Channel Relational Features](#5e-cross-channel-relational-features)
   - [5F: VoltGuard Engine-Aligned Composite Features](#5f-voltguard-engine-aligned-composite-features)
8. [Complete Feature Vector](#8-complete-feature-vector)
9. [Normalization Strategy](#9-normalization-strategy)
10. [Model-Specific Feature Justifications](#10-model-specific-feature-justifications)
11. [Fault Class — Feature Discriminability Map](#11-fault-class--feature-discriminability-map)
12. [Pipeline Architecture Diagram](#12-pipeline-architecture-diagram)
13. [Hyperparameters Summary](#13-hyperparameters-summary)

---

## 1. Pipeline Overview

The VoltGuard feature extraction pipeline converts raw analog sensor signals into a fixed-length, fully normalized tabular feature vector of **62 features** per analysis window. This vector is the sole input to all three ML models.

```
Raw Signals
  [Current (A), 12 kHz]  [Vibration (m/s²), 12 kHz]
         │                         │
         ▼                         ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 1: Analog Conditioning & Anti-aliasing   │
  │  LPF cutoff 5,990 Hz | DC blocking HPF 1 Hz     │
  └─────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 2: Window Segmentation                   │
  │  N=4096 samples | 50% overlap | Hanning window  │
  └─────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 3: Normalization & Detrending            │
  │  Z-score per window | linear detrend            │
  └─────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 4: Spectral Decomposition (FFT)          │
  │  4096-point FFT | resolution 2.93 Hz/bin        │
  └─────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │  Stage 5: Feature Extraction (62 features)      │
  │  5A: Time-domain statistical (18)               │
  │  5B: Frequency-domain (12)                      │
  │  5C: MCSA harmonic / current (14)               │
  │  5D: Vibration / acoustic (10)                  │
  │  5E: Cross-channel relational (4)               │
  │  5F: VoltGuard engine-aligned composites (4)    │
  └─────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │  Feature Vector [62 × float32]                  │
  │  + Label {0..5} for RF/XGB | no label for IF    │
  └─────────────────────────────────────────────────┘
```

---

## 2. Signal Acquisition & Sensor Specifications

### 2.1 Current Signal

| Parameter | Specification | Rationale |
|-----------|--------------|-----------|
| Sensor type | Clamp-on CT (current transformer) or Hall-effect sensor | Non-invasive; compatible with existing motor wiring |
| Channels | 1 (single phase RMS) or 3 (three-phase Ia, Ib, Ic) | 3-phase preferred for Phase Imbalance detection; 1-phase minimum for MCSA |
| Sampling rate | **12,000 Hz** | Captures up to 10th harmonic of 50 Hz (500 Hz) and motor slip sideband frequencies with adequate resolution |
| ADC resolution | ≥ 16-bit | Sufficient dynamic range to resolve sideband amplitudes at −40 dB below fundamental |
| Measurement range | 0–50 A peak | Covers VoltGuard's Phase Imbalance threshold (< 8 A) through Overcurrent threshold (> 25 A) with headroom |

**Why 12,000 Hz specifically:**  
- 50 Hz fundamental → 10th harmonic = 500 Hz → Nyquist requires > 1,000 Hz minimum
- MCSA slip sideband for a 4-pole motor at ~3% slip: (1 ± 2s)f₀ = 47 Hz and 53 Hz — comfortably resolved at 12 kHz
- Bearing fault characteristic frequencies (BPFI, BPFO, BSF, FTF) modulate the 50 Hz fundamental by ±5–300 Hz; 12 kHz captures all relevant sidebands
- Matches CWRU dataset's standard sampling rate for cross-dataset consistency

### 2.2 Vibration / Acoustic Signal

| Parameter | Specification | Rationale |
|-----------|--------------|-----------|
| Sensor type | MEMS accelerometer (PCB-mounted) or acoustic microphone | Accelerometer preferred for vibration; microphone for acoustic noise |
| Channels | 1 (radial, perpendicular to shaft) | Radial direction captures bearing fault impulses most strongly |
| Sampling rate | **12,000 Hz** | Matches current channel; bearing fault frequencies well below Nyquist |
| ADC resolution | ≥ 16-bit | |
| Measurement range | ±50 g (accelerometer) or 40–120 dB SPL (microphone) | |
| Mounting | Rigid bracket at bearing housing | Direct vibration path; minimizes structural resonance corruption |

### 2.3 VoltGuard Current Telemetry Mapping

The VoltGuard API already ingests `current_amps` (RMS), `thd_pct`, `noise_db`, and `frequency_hz`. For devices that cannot stream raw waveforms, the pipeline also defines a **pre-aggregated fast path** (see Section 7F) that operates on these scalar values directly.

---

## 3. Stage 1 — Analog Conditioning & Anti-aliasing

### 3.1 DC Blocking (High-Pass Filter)

- **Type:** Butterworth HPF, 2nd order
- **Cutoff:** 1 Hz
- **Purpose:** Remove DC offset introduced by sensor bias or CT magnetization. DC bias shifts the current waveform off-zero, causing spectral leakage that corrupts the fundamental and all harmonic bins.

### 3.2 Anti-aliasing Low-Pass Filter

- **Type:** Butterworth LPF, 8th order
- **Cutoff:** 5,990 Hz (= 0.999 × Nyquist for 12,000 Hz sampling)
- **Purpose:** Prevent aliasing of frequencies above Nyquist (6,000 Hz) from folding back into the 50–500 Hz harmonic band.
- **Applied before ADC digitization** — this is a hardware requirement, not software.

### 3.3 Structural Resonance Notch Filter (Current Channel)

- **Type:** IIR Notch, Q = 35
- **Notch frequencies:** 120 Hz, 180 Hz (for 60 Hz grid) or 100 Hz, 150 Hz (for 50 Hz grid)
- **Purpose:** The motor test rig often has structural resonances at twice and three times line frequency. These are environmental artifacts, not motor fault signatures. The notch removes them before feature extraction.
- **Applied only to current channel** — vibration channel retains these for structural-resonance-related feature extraction.

### 3.4 Powerline Interference Notch (Vibration Channel)

- **Type:** IIR Notch, Q = 50
- **Notch frequency:** 50 Hz (or 60 Hz)
- **Purpose:** Electromagnetic coupling of the power line frequency into vibration sensors appears as a 50 Hz component in the vibration spectrum that is not mechanically meaningful.

---

## 4. Stage 2 — Window Segmentation

### 4.1 Window Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Window size N** | **4,096 samples** | At 12 kHz → 341.3 ms per window. This captures ~17 cycles of the 50 Hz fundamental, providing strong frequency resolution while keeping latency under 350 ms |
| **Overlap** | **50% (2,048 samples)** | Doubles effective sample count; prevents loss of transient fault events that straddle window boundaries |
| **Window function** | **Hanning (Hann)** | Excellent sidelobe suppression (−31.5 dB) for detecting small-amplitude fault sidebands adjacent to the large 50 Hz fundamental. Preferred over Hamming for MCSA because sideband amplitudes can be 40–60 dB below fundamental |
| **Minimum windows per label** | 20 | Ensures statistical stability of per-window features before aggregation to a training sample |

**Why Hanning over rectangular (no windowing):**  
A rectangular window produces spectral leakage sidelobes that can mask the BPFI/BPFO fault sidebands. For a bearing fault sideband at, say, −35 dB relative to the fundamental, rectangular window leakage from the fundamental itself reaches −13 dB — completely burying the fault. Hanning reduces leakage to < −31.5 dB.

**Why 4,096 and not 1,024 or 8,192:**  
- 1,024 at 12 kHz = 85 ms → only ~4 cycles of 50 Hz; frequency resolution = 11.7 Hz/bin → cannot resolve 47 Hz and 53 Hz slip sidebands (6 Hz separation)
- 4,096 → resolution = 2.93 Hz/bin → resolves sidebands cleanly (2× margin)
- 8,192 → 683 ms → approaches 1 second; too slow for adaptive 5 s polling mode; doubles memory per window with marginal resolution gain above 1 Hz/bin

### 4.2 FFT Configuration

| Parameter | Value |
|-----------|-------|
| FFT size | 4,096 points (same as window, no zero-padding needed) |
| Frequency resolution | 12,000 / 4,096 = **2.93 Hz/bin** |
| Useful bins | 0 to N/2 = 2,048 bins (DC to 6,000 Hz) |
| Amplitude scaling | Single-sided → multiply by 2/N for bins 1..N/2-1; by 1/N for DC and Nyquist |
| Output | Magnitude spectrum |X(k)|, Power spectral density |X(k)|² / N |

---

## 5. Stage 3 — Signal Normalization & Detrending

### 5.1 Linear Detrending

Remove a linear trend from each window before FFT. A slow thermal or mechanical drift creates a non-stationary component that smears across the spectrum. Linear detrending subtracts the least-squares linear fit from the window.

### 5.2 Per-Window Z-score Normalization

After detrending, normalize each window:

```
x_norm[n] = (x[n] - mean(x)) / std(x)
```

**Purpose:** Removes amplitude variation due to motor load changes, sensor gain drift, and cross-motor rating differences. After normalization, features are scale-invariant — a 5 kW and a 50 kW motor look similar when healthy, but diverge predictably when faulted.

**Important exception:** Features that explicitly encode absolute amplitude (RMS, peak, crest factor denominator) are computed **before** normalization. Record the pre-normalization `std(x)` as a feature — it encodes the raw amplitude level needed by the Overcurrent detector.

---

## 6. Stage 4 — Spectral Decomposition (FFT)

### 6.1 Key Frequency Bands

For a 4-pole induction motor on a 50 Hz supply at rated slip ≈ 3%:

| Frequency | Meaning | VoltGuard Fault Class |
|-----------|---------|----------------------|
| 50 Hz | Fundamental (f₀) | Reference for all ratios |
| 47 Hz, 53 Hz | Slip sidebands (1 ± 2s)f₀ | Phase Imbalance, Overcurrent |
| 100 Hz, 150 Hz, 200 Hz... | Even harmonics | High THD (winding faults) |
| 100 Hz, 250 Hz, 350 Hz | Odd harmonics (3rd, 5th, 7th) | High THD (rectifier loads, VFD) |
| f₀ ± BPFI | Bearing inner-race sidebands | Bearing Wear |
| f₀ ± BPFO | Bearing outer-race sidebands | Bearing Wear |
| f₀ ± BSF | Ball spin frequency sidebands | Bearing Wear |
| BPFI = n_b/2 × (1 + b_d/p_d × cos θ) × f_rot | Inner race defect | Bearing Wear |
| BPFO = n_b/2 × (1 − b_d/p_d × cos θ) × f_rot | Outer race defect | Bearing Wear |

Where: n_b = number of balls, b_d = ball diameter, p_d = pitch diameter, θ = contact angle, f_rot = shaft rotation frequency (= f₀ × (1−s) / pole_pairs ≈ 24.25 Hz for 4-pole 50 Hz 3% slip motor).

### 6.2 Typical BPFI/BPFO for Common Bearings

For a standard 6205 deep-groove ball bearing (common in small-to-medium induction motors):
- n_b = 9 balls, b_d/p_d = 0.382, contact angle ≈ 0°
- f_rot ≈ 24.25 Hz (50 Hz, 4-pole, 3% slip)
- **BPFO ≈ 83 Hz** (outer race)
- **BPFI ≈ 135 Hz** (inner race)
- **BSF ≈ 55 Hz** (ball spin)
- **FTF ≈ 9.3 Hz** (cage)

These are referenced against the 50 Hz fundamental as sidebands:
- BPFO sideband: 50 ± 83 Hz → 33 Hz and **133 Hz** (within FFT range at 2.93 Hz/bin → clearly resolved)

---

## 7. Stage 5 — Feature Extraction

### 5A: Time-Domain Statistical Features

Computed on the **raw (pre-normalization) windowed signal** for the current channel (I) and vibration channel (V) separately.

#### Current Channel (I) — 9 features

| # | Feature | Formula | VoltGuard Relevance |
|---|---------|---------|---------------------|
| 1 | **I_rms** | √(1/N × Σ x²[n]) | Direct proxy for `current_amps`; primary discriminator for Overcurrent (> 25 A) and Phase Imbalance (< 8 A) |
| 2 | **I_peak** | max(|x[n]|) | Captures transient overcurrent spikes missed by RMS; important for relay-trip events |
| 3 | **I_crest_factor** | I_peak / I_rms | Elevated crest factor in bearing fault conditions as impulses modulate current envelope |
| 4 | **I_kurtosis** | E[(x−μ)⁴] / σ⁴ | Highly sensitive to impulsive content (bearing defect impulses). Healthy: ≈ 3 (Gaussian). Bearing fault: 4–10. Critical bearing: > 10 |
| 5 | **I_skewness** | E[(x−μ)³] / σ³ | Non-zero skew indicates asymmetric current envelope (phase imbalance signature). Healthy: ≈ 0. Phase Imbalance: |skew| > 0.5 |
| 6 | **I_std** | σ = std(x) | Raw amplitude scale; preserves the absolute current level for Overcurrent/Phase Imbalance detection |
| 7 | **I_p2p** | max(x) − min(x) | Peak-to-peak; captures gross amplitude swings in severely distorted current |
| 8 | **I_shape_factor** | I_rms / (1/N × Σ |x[n]|) | Shape factor = ratio of RMS to mean absolute value; deviates from √(π/2) ≈ 1.11 under distortion |
| 9 | **I_impulse_factor** | I_peak / (1/N × Σ |x[n]|) | Higher than shape factor; very sensitive to bearing impulses; Healthy ≈ 1.41 |

#### Vibration Channel (V) — 9 features

| # | Feature | Formula | VoltGuard Relevance |
|---|---------|---------|---------------------|
| 10 | **V_rms** | √(1/N × Σ v²[n]) | Base vibration level; proxy for `noise_db` after conversion: dB = 20 log₁₀(V_rms / 1e-6) |
| 11 | **V_peak** | max(|v[n]|) | Single impulse capture; bearing outer-race fault generates periodic impulses |
| 12 | **V_crest_factor** | V_peak / V_rms | Canonical bearing fault indicator; rises sharply at fault onset before RMS increases |
| 13 | **V_kurtosis** | E[(v−μ)⁴] / σ⁴ | Most widely cited bearing fault indicator. Healthy ≈ 3. Outer race fault: 6–20. Advanced fault: > 20. Insensitive to load variation |
| 14 | **V_skewness** | E[(v−μ)³] / σ³ | Asymmetric vibration distribution indicates one-directional impacts (race fault) |
| 15 | **V_peak2peak** | max(v) − min(v) | Total excursion; important for High Vibration class |
| 16 | **V_variance** | σ²(v) | Global energy measure; rises monotonically with fault severity |
| 17 | **V_waveform_length** | Σ |v[n+1] − v[n]| | Signal activity; captures high-frequency content without FFT; correlated with bearing roughness |
| 18 | **V_zero_crossing_rate** | Count(sign changes) / N | Related to dominant frequency; decreases when low-frequency bearing impulses dominate |

**Why time-domain features matter for tree models (RF/XGB):**  
Kurtosis and crest factor are highly non-linear functions of fault severity — they provide near-perfect threshold splits for early-stage bearing faults even before frequency-domain analysis reveals distinct sidebands. Tree models partition on these naturally. Isolation Forest isolates kurtosis outliers (high kurtosis = rare impulsive event = anomaly).

---

### 5B: Frequency-Domain Features

Computed from the **single-sided magnitude spectrum** of the windowed, Hanning-tapered signal.

#### Current Spectrum — 6 features

| # | Feature | Computation | VoltGuard Relevance |
|---|---------|-------------|---------------------|
| 19 | **I_fundamental_amp** | |X(k)| at k = round(f₀ / Δf) where f₀ = 50 Hz, Δf = 2.93 Hz | Reference amplitude; Overcurrent increases this; Phase Imbalance reduces it |
| 20 | **I_thd** | √(Σₙ₌₂¹⁰ Hₙ²) / H₁ × 100% | **Primary THD feature.** Maps directly to VoltGuard's `thd_pct`. H₁ = fundamental RMS, Hₙ = nth harmonic RMS. Sum up to 10th harmonic (500 Hz) |
| 21 | **I_thd_3_5_7** | √(H₃² + H₅² + H₇²) / H₁ × 100% | Odd-harmonic THD only — characteristic of VFD and rectifier-driven loads. Complements `I_thd` for isolating High THD caused by drive faults vs. winding faults |
| 22 | **I_slip_lsb_amp** | |X(k)| at k = round((f₀ − 2sf₀) / Δf) where s = slip | Lower slip sideband at (1−2s)f₀ ≈ 47 Hz. Eccentricity and Phase Imbalance elevate this sideband |
| 23 | **I_slip_usb_amp** | |X(k)| at k = round((f₀ + 2sf₀) / Δf) | Upper slip sideband at (1+2s)f₀ ≈ 53 Hz. Asymmetric sideband ratio (USB vs. LSB) is a Phase Imbalance indicator |
| 24 | **I_slip_sideband_ratio** | I_slip_usb_amp / (I_slip_lsb_amp + ε) | Healthy: close to 1.0. Phase Imbalance: ratio diverges as one sideband grows preferentially |

#### Vibration Spectrum — 6 features

| # | Feature | Computation | VoltGuard Relevance |
|---|---------|-------------|---------------------|
| 25 | **V_dominant_freq** | argmax(|X(k)|) × Δf for k > 5 (exclude DC) | Dominant vibration frequency; shifts when bearing fault characteristic frequency dominates |
| 26 | **V_spectral_centroid** | Σ(f × |X(f)|) / Σ|X(f)| | Center of mass of spectrum; shifts up in high-vibration conditions as harmonics grow |
| 27 | **V_spectral_bandwidth** | √(Σ(f−centroid)² × |X(f)|² / Σ|X(f)|²) | Spread of energy across frequencies; bearing faults broaden the spectrum |
| 28 | **V_spectral_entropy** | −Σ p(k) × log₂(p(k)) where p(k) = |X(k)|² / Σ|X(k)|² | Healthy spectrum has concentrated energy at harmonics → low entropy. Fault: energy smears across bins → high entropy |
| 29 | **V_high_band_energy** | Σ |X(k)|² for f ∈ [1000, 4000 Hz] / total energy | High-frequency vibration energy fraction; bearing spalling creates broadband high-frequency noise |
| 30 | **V_low_band_energy** | Σ |X(k)|² for f ∈ [10, 500 Hz] / total energy | Low-frequency energy fraction; structural and imbalance faults concentrate here |

---

### 5C: MCSA Harmonic Features (Current Channel)

Motor Current Signature Analysis (MCSA) uses the harmonic structure of the stator current to identify rotor and bearing faults. These features are the defining MCSA signatures.

#### Harmonic Amplitude Features — 8 features

| # | Feature | Frequency | VoltGuard Fault Relevance |
|---|---------|-----------|--------------------------|
| 31 | **H2_amp** | 100 Hz (2nd harmonic) | Even harmonics indicate broken rotor bars or winding asymmetry (partially overlaps High THD) |
| 32 | **H3_amp** | 150 Hz (3rd harmonic) | Primary odd harmonic; elevated in VFD-driven motors (High THD) |
| 33 | **H5_amp** | 250 Hz (5th harmonic) | Major 3-phase rectification harmonic; High THD signature |
| 34 | **H7_amp** | 350 Hz (7th harmonic) | Secondary 3-phase harmonic; pair with H5 for drive-related High THD |
| 35 | **H9_amp** | 450 Hz (9th harmonic) | 3rd triplen harmonic; elevated in single-phase or unbalanced supply → Phase Imbalance |
| 36 | **H3_H5_ratio** | H3 / (H5 + ε) | Ratio distinguishes winding asymmetry (H3-dominant) from rectifier harmonics (H5-dominant) |
| 37 | **H_odd_to_even_ratio** | (H3+H5+H7) / (H2+H4+H6+ε) | Fundamental MCSA discriminant: winding/insulation faults elevate even harmonics; load non-linearity elevates odd harmonics |
| 38 | **I_harmonic_rolloff** | Linear slope of harmonic amplitude vs. order (log-log) | Healthy: rapid rolloff. Degraded winding: flatter spectrum (harmonics don't decay as steeply) |

#### Bearing Fault MCSA Sideband Features — 6 features

These are the MCSA equivalent of vibration BPFI/BPFO, manifested as current sidebands around the fundamental.

| # | Feature | Frequency | VoltGuard Fault Relevance |
|---|---------|-----------|--------------------------|
| 39 | **BPFO_lsb** | |X(f₀ − BPFO)| | Outer-race bearing fault lower sideband in current spectrum. Bearing Wear |
| 40 | **BPFO_usb** | |X(f₀ + BPFO)| | Outer-race upper sideband. Bearing Wear |
| 41 | **BPFI_lsb** | |X(f₀ − BPFI)| | Inner-race bearing fault lower sideband. Bearing Wear |
| 42 | **BPFI_usb** | |X(f₀ + BPFI)| | Inner-race upper sideband. Bearing Wear |
| 43 | **bearing_sideband_sum** | BPFO_lsb + BPFO_usb + BPFI_lsb + BPFI_usb | Aggregate bearing fault energy in current spectrum; zero in healthy motor |
| 44 | **bearing_sideband_to_fundamental** | bearing_sideband_sum / I_fundamental_amp | Normalized bearing indicator; removes amplitude variation due to load changes |

**Note on BPFI/BPFO computation:**  
Exact sideband frequencies depend on bearing geometry and shaft speed. In production, shaft speed is estimated from the slip frequency: f_rot ≈ f₀ × (1 − s) / (p/2), where p = pole count. For a library dataset without explicit bearing specs, use the nearest neighbor search (find the FFT bin with maximum amplitude within ±5 Hz of the expected sideband location).

---

### 5D: Vibration / Acoustic Features

Computed from the vibration channel (accelerometer or acoustic). These directly support VoltGuard's `noise_db` telemetry feature.

#### Envelope Analysis Features — 5 features

Envelope analysis demodulates the vibration signal to extract the low-frequency amplitude modulation caused by periodic bearing impulses.

| # | Feature | Computation | VoltGuard Relevance |
|---|---------|-------------|---------------------|
| 45 | **V_env_rms** | RMS of Hilbert envelope: |H(v[n])| | Bearing impulse energy; rises sharply at outer-race defect onset |
| 46 | **V_env_kurtosis** | Kurtosis of envelope signal | More sensitive than raw kurtosis for detecting early-stage bearing faults in noisy environments |
| 47 | **V_env_bpfo_amp** | FFT of envelope → amplitude at BPFO | Direct detection of periodic outer-race impacts at exactly the expected repetition rate |
| 48 | **V_env_bpfi_amp** | FFT of envelope → amplitude at BPFI | Direct detection of inner-race impacts |
| 49 | **V_env_bsf_amp** | FFT of envelope → amplitude at BSF | Ball spin frequency amplitude — ball/roller defect |

#### dB Level Features — 5 features

| # | Feature | Computation | VoltGuard Relevance |
|---|---------|-------------|---------------------|
| 50 | **V_db_rms** | 20 × log₁₀(V_rms / 1e-6) | Maps directly to VoltGuard's `noise_db`. Warning at 82 dB, emergency at 95 dB |
| 51 | **V_db_peak** | 20 × log₁₀(V_peak / 1e-6) | Peak dB; captures transient spikes not reflected in RMS |
| 52 | **V_db_above_warning** | max(0, V_db_rms − 82) | Feature = dB excess above VoltGuard warning threshold. Zero in healthy motors; positive in High Vibration class |
| 53 | **V_db_above_critical** | max(0, V_db_rms − 95) | Excess above emergency trip threshold; non-zero only in relay-trip events |
| 54 | **V_1_3_octave_energy** | Energy in 1/3-octave bands (80–4000 Hz): 8 sub-bands summarized as max band energy | Captures which frequency range dominates vibration; different bearing faults dominate different octave bands |

---

### 5E: Cross-Channel Relational Features

Features computed from the **relationship between the current and vibration channels**. These capture fault signatures that manifest in one channel but not the other — a pattern that strongly discriminates electrical faults from mechanical faults.

| # | Feature | Computation | VoltGuard Relevance |
|---|---------|-------------|---------------------|
| 55 | **I_V_coherence** | Magnitude-squared coherence at f₀: |Sxy(f₀)|² / (Sxx(f₀)×Syy(f₀)) | Measures how much of the vibration at 50 Hz is linearly driven by the current at 50 Hz. High coherence = electromagnetic forcing. Mechanical imbalance: low coherence. Phase Imbalance: changes coherence pattern |
| 56 | **I_V_thd_to_db_ratio** | I_thd / (V_db_rms + ε) | VoltGuard's anomaly score uses 50% THD weight + 35% dB weight. This ratio quantifies which channel is the dominant anomaly source: high ratio → electrical fault (High THD); low ratio → mechanical fault (High Vibration) |
| 57 | **phase_imbalance_proxy** | std([Ia_rms, Ib_rms, Ic_rms]) / mean([Ia_rms, Ib_rms, Ic_rms]) | For 3-phase installations: coefficient of variation of per-phase RMS. Zero for balanced supply; >> 0.1 for Phase Imbalance (one phase lost → extreme imbalance) |
| 58 | **overcurrent_margin** | max(0, I_rms − 25.0) | Direct current excess above VoltGuard's Overcurrent threshold (25 A). Zero for all other classes; large for Overcurrent |

---

### 5F: VoltGuard Engine-Aligned Composite Features

These features are explicitly computed using the same formulas as VoltGuard's `severity.ts` engine. Their inclusion ensures the ML models' decision boundaries are consistent with the production rule engine — critical for label consistency and for the Isolation Forest to flag the same conditions the rule engine would flag.

| # | Feature | Formula (from `severity.ts`) | VoltGuard Relevance |
|---|---------|------------------------------|---------------------|
| 59 | **vg_thd_score** | min(1, max(0, thd − 5.0) / (20.0 − 5.0)) | THD component of VoltGuard anomaly score [0..1] |
| 60 | **vg_db_score** | min(1, max(0, db − 70.0) / (95.0 − 70.0)) | dB component of VoltGuard anomaly score [0..1] |
| 61 | **vg_current_score** | min(1, ...) current anomaly component (see severity.ts) | Current component [0..1]: rises if current < 8 A or > 25 A |
| 62 | **vg_anomaly_score** | vg_thd_score × 0.50 + vg_db_score × 0.35 + vg_current_score × 0.15 | **Composite VoltGuard anomaly score.** Including this as an input feature anchors all three ML models to VoltGuard's production scoring function |

**Why include the VoltGuard engine score as a feature:**

1. **Consistency:** The training labels are generated by the same rule engine. If the ML model learns to predict something entirely different from the rule engine, predictions will disagree with existing alerts in production — confusing operators.
2. **Dimensionality compression:** `vg_anomaly_score` is a domain-expert-designed compression of three sensors into one scalar. Tree models discover this relationship during training anyway, but providing it pre-computed accelerates convergence and reduces variance.
3. **Isolation Forest calibration:** Isolation Forest should isolate points with `vg_anomaly_score` ≈ 0 as the "normality core." Including it explicitly guides the IF toward VoltGuard's decision surface.

---

## 8. Complete Feature Vector

The final feature vector has **62 features** per analysis window.

```
┌─────────────────────────────────────────────────────────────────────┐
│  GROUP A: Time-Domain Statistical (18 features, indices 0–17)       │
│  ─── Current Channel (9) ──────────────────────────────────────    │
│    0  I_rms                9  I_peak                                │
│    1  I_crest_factor       2  I_kurtosis                            │
│    3  I_skewness           4  I_std                                 │
│    5  I_p2p                6  I_shape_factor                        │
│    7  I_impulse_factor                                              │
│  ─── Vibration Channel (9) ────────────────────────────────────    │
│    9  V_rms               10  V_peak                                │
│   11  V_crest_factor      12  V_kurtosis                            │
│   13  V_skewness          14  V_peak2peak                           │
│   15  V_variance          16  V_waveform_length                     │
│   17  V_zero_crossing_rate                                          │
├─────────────────────────────────────────────────────────────────────┤
│  GROUP B: Frequency-Domain (12 features, indices 18–29)             │
│  ─── Current Spectrum (6) ─────────────────────────────────────    │
│   18  I_fundamental_amp   19  I_thd                                 │
│   20  I_thd_3_5_7         21  I_slip_lsb_amp                       │
│   22  I_slip_usb_amp      23  I_slip_sideband_ratio                 │
│  ─── Vibration Spectrum (6) ───────────────────────────────────    │
│   24  V_dominant_freq     25  V_spectral_centroid                   │
│   26  V_spectral_bandwidth 27  V_spectral_entropy                   │
│   28  V_high_band_energy  29  V_low_band_energy                     │
├─────────────────────────────────────────────────────────────────────┤
│  GROUP C: MCSA Harmonic — Current (14 features, indices 30–43)      │
│  ─── Harmonic Amplitudes (8) ──────────────────────────────────    │
│   30  H2_amp              31  H3_amp                                │
│   32  H5_amp              33  H7_amp                                │
│   34  H9_amp              35  H3_H5_ratio                           │
│   36  H_odd_to_even_ratio 37  I_harmonic_rolloff                    │
│  ─── Bearing MCSA Sidebands (6) ───────────────────────────────    │
│   38  BPFO_lsb            39  BPFO_usb                              │
│   40  BPFI_lsb            41  BPFI_usb                              │
│   42  bearing_sideband_sum 43  bearing_sideband_to_fundamental      │
├─────────────────────────────────────────────────────────────────────┤
│  GROUP D: Vibration/Acoustic (10 features, indices 44–53)           │
│  ─── Envelope Analysis (5) ────────────────────────────────────    │
│   44  V_env_rms           45  V_env_kurtosis                        │
│   46  V_env_bpfo_amp      47  V_env_bpfi_amp                        │
│   48  V_env_bsf_amp                                                 │
│  ─── dB Level Features (5) ────────────────────────────────────    │
│   49  V_db_rms            50  V_db_peak                             │
│   51  V_db_above_warning  52  V_db_above_critical                   │
│   53  V_1_3_octave_energy                                           │
├─────────────────────────────────────────────────────────────────────┤
│  GROUP E: Cross-Channel Relational (4 features, indices 54–57)      │
│   54  I_V_coherence       55  I_V_thd_to_db_ratio                   │
│   56  phase_imbalance_proxy 57  overcurrent_margin                  │
├─────────────────────────────────────────────────────────────────────┤
│  GROUP F: VoltGuard Engine-Aligned Composites (4 features, 58–61)   │
│   58  vg_thd_score        59  vg_db_score                           │
│   60  vg_current_score    61  vg_anomaly_score                      │
└─────────────────────────────────────────────────────────────────────┘

Total: 62 features per window
Label: {0=Normal, 1=Bearing Wear, 2=High THD, 3=High Vibration, 4=Phase Imbalance, 5=Overcurrent}
```

---

## 9. Normalization Strategy

Different normalization methods are applied at different pipeline stages.

### 9.1 Per-Window Normalization (Stage 3 — before FFT)

Applied **online** during real-time inference and during feature extraction from datasets:
- Z-score (zero mean, unit variance) per window
- Purpose: remove amplitude differences between motors of different ratings

### 9.2 Dataset-Level Feature Scaling (Training preprocessing — before model fit)

Applied **offline** once, after all windows from all datasets are extracted:

| Feature Group | Scaling Method | Rationale |
|---------------|---------------|-----------|
| Group A (statistical) | **RobustScaler** (median, IQR) | Kurtosis, crest factor have heavy tails and outliers; StandardScaler would compress the high-fault range |
| Group B (frequency-domain) | **MinMaxScaler** [0..1] | Spectral features are non-negative and bounded; min-max preserves relative magnitudes |
| Group C (MCSA harmonics) | **RobustScaler** | Harmonic amplitudes have extreme values during faults |
| Group D (vibration/acoustic) | **RobustScaler** for kurtosis/envelope; **MinMaxScaler** for dB features | dB features already have physically meaningful scale (aligned to VoltGuard thresholds) |
| Group E (cross-channel) | **StandardScaler** | Ratios and coherence values are better-behaved than raw amplitudes |
| Group F (VoltGuard composites) | **None** | Already [0..1] by construction. Do not rescale — preserves alignment with VoltGuard rule engine thresholds |

**Scaler fit rule:** Fit scalers on **training data only**. Apply identical transforms to validation and test splits, and to runtime inference data.

---

## 10. Model-Specific Feature Justifications

### 10.1 Random Forest (RF)

Random Forest partitions feature space by recursive axis-aligned splits. Its performance depends on features that provide clean threshold separability. The following feature groups are most critical:

**High-value features for RF:**
- `I_rms` — creates a single binary split between Overcurrent (> 25A RMS) and Phase Imbalance (< 8A RMS). Likely the first split in almost every tree.
- `I_kurtosis`, `V_kurtosis` — natural splits for Bearing Wear vs. Normal. Kurtosis ≈ 3 = Normal; kurtosis > 4 = Bearing Wear.
- `I_thd` — splits Normal (< 10%), Bearing Wear (10–15%), High THD (> 15%).
- `V_db_rms` — splits Normal (< 82 dB) from High Vibration (> 82 dB).
- `bearing_sideband_sum` — zero in all non-bearing classes; non-zero in Bearing Wear (strong discriminant).
- `vg_anomaly_score` — compressed multi-sensor score gives RF a low-depth early split on the combined fault dimension.

**Why class weights matter for RF:** Bearing Wear samples from CWRU + Paderborn will outnumber Phase Imbalance / Overcurrent samples from the Kaggle dataset by 5–10×. Use `class_weight='balanced'` or explicit inverse-frequency weights so the forest does not overfit to Bearing Wear at the expense of rare classes.

**Feature interaction note:** RF discovers the joint condition `I_thd > 10% AND V_db_rms > 82 dB = High Vibration` automatically through tree depth ≥ 2, but it must see both features explicitly in the vector to find this interaction.

### 10.2 XGBoost (XGB)

XGBoost fits additive corrections to residual errors, making it sensitive to gradients — features with smooth, monotone relationships to fault labels are most exploitable.

**High-value features for XGB:**
- All Group F features (`vg_thd_score`, `vg_db_score`, `vg_current_score`, `vg_anomaly_score`) — These are smooth [0..1] scalars derived from the same rule logic as the labels. XGBoost gradient descent on these features converges quickly and produces well-calibrated leaf values.
- `overcurrent_margin` — linearly grows with overcurrent severity; XGBoost's boosting stages converge on this monotone signal efficiently. Apply `monotone_constraints: {'overcurrent_margin': 1}` to enforce that higher margin → higher Overcurrent probability.
- `H_odd_to_even_ratio` — smooth discriminant between VFD-driven High THD (odd-dominant) and winding fault High THD (even-dominant).
- `I_V_thd_to_db_ratio` — smooth gradient between pure electrical fault (High THD) and pure mechanical fault (High Vibration).
- `V_spectral_entropy` — monotone with fault severity across all vibration-related classes.

**XGBoost-specific configuration notes:**
- `objective='multi:softprob'` with `num_class=6` for 6-class output.
- Use `eval_metric='mlogloss'` during training.
- Apply `scale_pos_weight` per class if SMOTE is not used.
- Candidate monotone constraints: `overcurrent_margin ↑, V_db_above_warning ↑, I_thd ↑` — all monotonically increase fault probability.

**Interaction features useful for XGBoost:**
- `I_thd × V_db_rms` — product captures the VoltGuard rule `thd > 10% AND db > 82 dB = High Vibration`. Include as an explicit feature (feature index 62 if added).
- `I_rms × I_kurtosis` — product amplifies the Bearing Wear signature (impulsive current at moderate RMS).

### 10.3 Isolation Forest (IF)

Isolation Forest works by recursively splitting the feature space at random cut points. Anomalous observations are isolated quickly (short path length = low average depth). Key principle: **IF is trained on Normal samples only.**

**High-value features for IF:**
- `I_rms` — Phase Imbalance (< 8 A) and Overcurrent (> 25 A) sit far from the Normal range (8–25 A). Both will be isolated in very few splits.
- `V_kurtosis` — Normal vibration kurtosis ≈ 3 (Gaussian). Any bearing fault raises this to 5–20+. A point with kurtosis = 15 is trivially isolated from the Normal cloud.
- `V_crest_factor` — same argument; healthy ≈ 1.4; faulted: 2–5.
- `vg_anomaly_score` — everything above ≈ 0.2 is a VoltGuard warning. IF trained on normal samples (score ≈ 0) will assign short path lengths to any sample with score > 0.1.
- `bearing_sideband_sum` — zero in every Normal sample; any non-zero value is an immediate anomaly.

**IF configuration:**
- `n_estimators=200` (more trees reduce variance for 62-dimensional input)
- `contamination` parameter should be calibrated against `WARNING_THRESHOLDS.anomalyScore = 0.2` in VoltGuard's severity engine. Approximately 20% of runtime samples may be at or above warning level in a degraded fleet.
- **Do NOT include label-derived features** as IF inputs: `fault_label`, `relay_tripped`, or derived diagnostic strings.

**IF as pre-filter:** The recommended production deployment is:
1. IF scores every incoming telemetry window → outputs anomaly score [0..1]
2. If IF score > threshold → route to RF/XGB for fault class identification
3. IF score maps inversely to VoltGuard's `health_score` and can serve as an independent confidence check on the rule engine

---

## 11. Fault Class — Feature Discriminability Map

Which features are most discriminating for each fault class:

| Fault Class | Top Discriminating Features | Key Pattern |
|-------------|----------------------------|-------------|
| **Normal** | `vg_anomaly_score`, `V_kurtosis`, `bearing_sideband_sum`, `I_rms` | All features near baseline values |
| **Bearing Wear** | `V_kurtosis`, `V_env_kurtosis`, `V_crest_factor`, `bearing_sideband_sum`, `BPFO_usb`, `BPFI_lsb`, `I_kurtosis` | Impulsive vibration + current bearing sidebands; no electrical distortion |
| **High THD** | `I_thd`, `I_thd_3_5_7`, `H5_amp`, `H7_amp`, `vg_thd_score`, `H_odd_to_even_ratio` | Elevated harmonics, normal vibration and current RMS |
| **High Vibration** | `V_db_rms`, `V_kurtosis`, `I_thd` (co-elevated), `I_V_thd_to_db_ratio` | Both dB and THD elevated; joint threshold crossing |
| **Phase Imbalance** | `I_rms` (below 8A), `phase_imbalance_proxy`, `I_skewness`, `H9_amp`, `I_slip_sideband_ratio`, `vg_current_score` | Severely reduced current; asymmetric phase loading; odd triplen harmonics |
| **Overcurrent** | `I_rms` (above 25A), `overcurrent_margin`, `I_peak`, `vg_current_score`, `I_fundamental_amp` | Elevated current; normal vibration and THD initially |

---

## 12. Pipeline Architecture Diagram

```
RAW INPUT
─────────────────────────────────────────────────────────────────
 I(t): current waveform [12 kHz, float32, N samples]
 V(t): vibration waveform [12 kHz, float32, N samples]
 Metadata: motor_id, timestamp, source (CWRU/Paderborn/Kaggle/live)
─────────────────────────────────────────────────────────────────
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Analog Conditioning (hardware or offline)          │
│  I(t): DC block HPF @1Hz → Notch @100Hz,150Hz → LPF @5990Hz │
│  V(t): DC block HPF @1Hz → Notch @50Hz → LPF @5990Hz        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2: Window Segmentation                                │
│  Stride: 2048 samples (50% overlap)                          │
│  Width:  4096 samples (341ms @ 12kHz)                        │
│  Window fn: Hanning taper                                    │
│  Output: [I_win ∈ R^4096, V_win ∈ R^4096] per stride        │
└─────────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
    ┌──────────────────┐   ┌──────────────────────┐
    │  STAGE 3a:       │   │  STAGE 3b:           │
    │  Pre-FFT stats   │   │  Detrend + Z-score   │
    │  (raw amplitude  │   │  per window          │
    │   preserved)     │   │                      │
    │  → Group A feats │   │                      │
    └──────────────────┘   └──────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  STAGE 4: FFT            │
                          │  4096-pt DFT, Hanning    │
                          │  → magnitude spectrum    │
                          │  → PSD                   │
                          │  → envelope (Hilbert)    │
                          └─────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │  Group B         │   │  Group C         │   │  Group D         │
    │  Freq-domain     │   │  MCSA harmonics  │   │  Vibration/      │
    │  (12 features)   │   │  + BPFI/BPFO     │   │  acoustic        │
    │                  │   │  (14 features)   │   │  (10 features)   │
    └──────────────────┘   └──────────────────┘   └──────────────────┘
              │                       │                       │
              └───────────────────────┴───────────────────────┘
                                      │
                          ┌─────────────────────────┐
                          │  Group E: Cross-channel  │
                          │  coherence, ratios       │
                          │  (4 features)            │
                          └─────────────────────────┘
                                      │
                          ┌─────────────────────────┐
                          │  Group F: VoltGuard      │
                          │  engine formulas         │
                          │  (4 features)            │
                          └─────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  FEATURE VECTOR          │
                          │  [62 × float32]          │
                          │  + RobustScaler/         │
                          │    MinMaxScaler          │
                          └─────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │  Random Forest   │   │  XGBoost         │   │  Isolation       │
    │  6-class         │   │  6-class         │   │  Forest          │
    │  supervised      │   │  softprob        │   │  Normal-only     │
    │                  │   │                  │   │  training        │
    └──────────────────┘   └──────────────────┘   └──────────────────┘
              │                       │                       │
              └───────────────────────┴───────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────┐
                    │  Inference Output                │
                    │  RF/XGB: class probabilities [6] │
                    │  IF: anomaly score [0..1]         │
                    │  → fault_label                   │
                    │  → alert_severity                │
                    │  → vg_anomaly_score              │
                    └──────────────────────────────────┘
```

---

## 13. Hyperparameters Summary

All hyperparameters in this section are pipeline-level (not model-level). Model hyperparameters are to be tuned at training time.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Sampling rate | 12,000 Hz | CWRU compatibility; resolves slip sidebands; covers 10 harmonics |
| Window size N | 4,096 samples | 341 ms; ~17 cycles of 50 Hz; 2.93 Hz/bin FFT resolution |
| Window overlap | 50% (2,048 samples) | Doubles effective sample count; prevents event straddling |
| Window function | Hanning | −31.5 dB sidelobe for sideband detection adjacent to strong fundamental |
| FFT size | 4,096 (= N, no padding) | 2.93 Hz/bin → 6 Hz sideband separation resolvable (2× margin) |
| HPF cutoff | 1 Hz | Remove DC bias |
| LPF cutoff | 5,990 Hz | Anti-alias at 0.999 × Nyquist |
| Harmonic orders | 2nd–10th | 100–500 Hz; THD computed to 10th |
| MCSA bearing sidebands | BPFI, BPFO, BSF | Standard bearing characteristic frequencies |
| Bearing frequency search window | ±5 Hz around expected sideband | ±1.7 FFT bins at 2.93 Hz/bin; accommodates slip variation |
| Feature vector dimension | 62 | Balanced: enough for high performance, manageable for tree models |
| Pre-FFT normalization | Z-score per window | Remove amplitude variation across motors |
| Post-extraction scaling | RobustScaler (A,C,D) / MinMaxScaler (B) / None (F) | Group-appropriate scaling preserving physical meaning |
| Minimum windows per training sample | 20 | Statistical stability before feature averaging |

---

*End of Feature Extraction Architecture. No code written. No project files modified.*
