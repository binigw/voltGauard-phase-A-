# VoltGuard AI — MTR-0025 Hardware Deployment and HIL Runbook

**Audience:** Lead Systems Integration Engineer, controls engineer, commissioning electrician, and test witness  
**Asset:** `MTR-0025` / Flour mill / HANGYU Y2-180M-4  
**Document status:** Release candidate for controlled commissioning  
**Safety boundary:** This document does not replace the motor manufacturer's instructions, the site's electrical safety procedure, lockout/tagout (LOTO), or a qualified-person review.

## 1. Release and commissioning gate

Do not connect this system to an energized motor until every item in the **Go/No-Go gate** has a named owner and a recorded result.

### Go/No-Go gate

- [ ] Approved single-line diagram, motor control schematic, relay/interlock schematic, and sensor wiring diagram are available at the test location.
- [ ] A qualified electrician has verified CT installation, isolation, burden/shorting provisions, phase identification, protective earth, and enclosure ingress protection.
- [ ] The existing hardwired overload, short-circuit, emergency-stop, and contactor protection remains authoritative and independent of VoltGuard.
- [ ] VoltGuard relay output is wired only through the approved safety interface. The dashboard, MQTT, ESP32, and AI explanation layer must not be the sole means of removing power.
- [ ] A written LOTO and emergency-stop procedure has been briefed to everyone in the test area.
- [ ] MTR-0025 nameplate data and the software motor profile agree:
  - Rated current: **35.7 A**
  - Nominal voltage: **380 V delta** as recorded by the project profile
  - Motor ID: **25**
- [ ] The test database and API origin are identified as staging/commissioning or production. Simulation scripts are prohibited against the live plant database.
- [ ] NTP/time synchronization is working on the API host and edge device.
- [ ] The edge device can buffer and resend safely without duplicating unsafe relay commands.
- [ ] The first hardware packet has been reviewed before motor energization.
- [ ] A rollback plan exists: disconnect the edge forwarder, return to the existing hardwired control path, and preserve captured evidence.

### Stop-work conditions

Stop immediately and isolate the motor if any of the following occurs:

- CT secondary is open, overheating, arcing, or lacks the specified burden/shorting protection.
- Phase identity is uncertain or the phase order is inconsistent between wiring and payload.
- A measured value is being substituted with `0`, a nominal constant, or a stale value.
- The API reports a trip, override, invalid packet, model fallback, or unexpected asset ID and the cause is not understood.
- The edge device clock is unsynchronized or packet timestamps move backward.
- The hardwired protection, relay feedback, or emergency stop cannot be independently proven.

## 2. Current software integration boundary

The deployed API currently ingests telemetry over HTTP:

```text
POST /api/telemetry/update
```

The repository does **not** currently contain a native MQTT broker consumer or serial-port consumer. Use one of these supported deployment patterns:

```text
ESP32 + CT/voltage sensors
        ├── serial JSON Lines ──┐
        └── MQTT/TLS JSON ──────┴── edge bridge/forwarder
                                      │ HTTP POST
                                      ▼
                           VoltGuard API :8080
                                      │
              Decision Engine → safety rules → DB/dashboard/notifications
```

The bridge is an adapter, not a second decision engine. It must validate, timestamp, label, and forward measurements without changing fault labels or safety decisions.

## 3. Canonical hardware packet

The bridge must forward a packet that satisfies the existing `UpdateTelemetryBody` contract.

### Required fields

| Field | Type | Hardware rule |
|---|---:|---|
| `motorId` | integer | Must be `25` for MTR-0025. Reject any other value in the MTR-0025 bridge profile. |
| `current` | number | Arithmetic mean of the three validated phase RMS currents, in amperes. Do not use a stale phase or a made-up fallback. |
| `thd` | number | Measured/calculated current THD in percent. The current API requires a numeric value; never send `0` merely because THD was not measured. |

### Optional fields

| Field | Type | Hardware rule |
|---|---:|---|
| `phase_currents_a` | array of 3 numbers | L1/L2/L3 RMS amperes in fixed order. Send only when the motor is commanded to run or the measurement is intentionally being tested. Do not send `[0,0,0]` for a stopped motor; the current safety rules interpret a low phase as phase loss. |
| `phase_voltages_v` | array of 3 numbers | Isolated, measured L1/L2/L3 values in the same order. Omit when voltage transducers are not installed. Never send a guessed nominal voltage. |
| `db` | number or null | Measured acoustic/vibration dB only. Omit or send `null` when unavailable; the backend preserves that it was unavailable. |
| `frequency` | number | Electrical frequency in Hz; default is 50 if omitted. Send the measured value for VFD operation. |
| `timestamp` | RFC3339 string | UTC time from the edge device after NTP synchronization. |
| `is_simulation` | boolean | Must be `false` or omitted for hardware. |
| `telemetry_source` | string | Use `ESP32_MQTT` or `ESP32_SERIAL`; never use `SIMULATION` for hardware. |
| `operating_mode` | enum | Exactly `DOL`, `Soft Starter`, or `VFD`. |
| `raw_waveform` | array | Only for a real sampled waveform. Maximum 20,000 values. Do not generate one from scalar RMS readings. |
| `mcsa_harmonic_frequencies_hz` / `mcsa_harmonic_magnitudes` | arrays | Only when the edge device has a validated waveform/FFT path. Keep paired arrays, finite, non-negative, and within 2–16 entries. |
| `mcsa_bearing_fault_frequency_hz` | number | Only when the bearing characteristic frequency is known from the motor/bearing geometry. |

### Hardware example

This is a shape example, not a reading to copy into production:

```json
{
  "motorId": 25,
  "current": 15.2,
  "phase_currents_a": [15.1, 15.3, 15.2],
  "phase_voltages_v": [229.8, 230.4, 229.9],
  "thd": 4.8,
  "db": null,
  "frequency": 50.0,
  "timestamp": "2026-09-05T12:00:00.000Z",
  "is_simulation": false,
  "telemetry_source": "ESP32_MQTT",
  "operating_mode": "DOL"
}
```

The edge bridge should calculate `current = (I1 + I2 + I3) / 3` only after all three RMS values pass range, freshness, and finite-number checks. If one phase is missing, reject the packet instead of averaging two phases.

## 4. ESP32 and CT sensor configuration

### CT installation and calibration

- [ ] Confirm each CT's primary rating, secondary rating, accuracy class, burden requirement, insulation rating, and frequency range from its datasheet.
- [ ] Install one CT per phase with a documented phase map: `I1=L1`, `I2=L2`, `I3=L3`.
- [ ] Install the manufacturer's burden/shorting terminal. Never open-circuit a CT secondary while primary current flows.
- [ ] Verify CT polarity/orientation with a low-risk calibrated current source or approved commissioning method.
- [ ] Record the ADC conversion: sensor output → ADC counts → amperes RMS.
- [ ] Validate each channel against a calibrated clamp meter or reference instrument at at least three points: near zero, normal load, and a controlled elevated test point.
- [ ] Record offset, gain, RMS window, sample rate, anti-alias filtering, and calibration date.
- [ ] Do not infer THD, dB, voltage, or MCSA from current RMS unless the corresponding measurement algorithm and sensor are actually present.

### Recommended edge acquisition behavior

- Use a synchronized RMS window covering an integer number of 50 Hz cycles where practical.
- Preserve the same window boundaries across I1/I2/I3.
- For a true waveform/FFT path, use a documented sample rate and window length; the existing HIL reference uses 12 kHz and 4096 samples, but that is not a substitute for validating the ESP32 implementation.
- Reject non-finite, negative RMS, stale, out-of-range, or phase-count-not-equal-to-three values.
- Add a monotonic sequence number in the bridge envelope/logs, even though the API packet contract does not require it.
- Keep the API payload timestamp in UTC.
- Start with a commissioning cadence of 60 seconds for nominal operation. On an anomaly band, the backend's adaptive interval contract is 5 seconds; the bridge may poll/publish at that cadence after it observes the returned `nextLogIntervalSeconds`. Do not use an aggressive rate until storage and network behavior are proven.

## 5. Serial transport profile

Serial is an edge input to the bridge; the bridge still forwards HTTP to VoltGuard.

```yaml
transport: serial
serial:
  device: /dev/ttyUSB0        # Verify with udev; never assume enumeration order
  baud: 115200
  data_bits: 8
  parity: none
  stop_bits: 1
  framing: jsonl              # one UTF-8 JSON object per line
  max_frame_bytes: 4096
  read_timeout_ms: 1500
  require_newline: true
  reject_duplicate_sequence: true
```

Example serial line:

```text
{"seq":1842,"motorId":25,"current":15.2,"phase_currents_a":[15.1,15.3,15.2],"thd":4.8,"timestamp":"2026-09-05T12:00:00.000Z","operating_mode":"DOL"}
```

The bridge must add or enforce:

```json
{
  "is_simulation": false,
  "telemetry_source": "ESP32_SERIAL"
}
```

## 6. MQTT transport profile

MQTT is also an edge input to the bridge. The broker should be on the plant/private network or use TLS through an approved gateway.

```yaml
transport: mqtt
mqtt:
  broker_url: mqtts://BROKER_HOSTNAME:8883
  client_id: voltguard-edge-mtr-0025
  topic: voltguard/mtr-0025/telemetry
  qos: 1
  retain: false
  clean_session: false
  keepalive_seconds: 30
  ca_file: /etc/voltguard/certs/mqtt-ca.pem
  client_cert_file: /etc/voltguard/certs/mtr-0025-client.crt
  client_key_file: /etc/voltguard/certs/mtr-0025-client.key
```

- Store broker credentials/certificates in the deployment secret store, not in firmware, this repository, or the dashboard bundle.
- Use a unique client ID per edge device.
- Use QoS 1 with an idempotency key in the bridge log; do not use retained telemetry packets.
- Reject topics for other assets.
- Apply a bounded offline queue. When the queue is full, drop oldest telemetry with an explicit alarm; never replay stale data as current.
- Do not create an MQTT relay-command topic until a separately reviewed, authenticated, fail-safe command protocol exists. Telemetry ingestion must not become an indirect motor-control channel.

## 7. Bridge-to-API forwarding

```yaml
forward:
  api_base_url: http://VOLTGUARD_API_HOST:8080
  endpoint: /api/telemetry/update
  connect_timeout_ms: 1000
  request_timeout_ms: 3000
  max_retries: 2
  retry_backoff_ms: [250, 1000]
  reject_statuses: [400, 401, 403, 404]
  queue_on_statuses: [408, 429, 500, 502, 503, 504]
  max_offline_queue_items: 600
```

The current route has no documented application-token authentication layer. Keep it on a private network or put it behind the site's authenticated reverse proxy before connecting an industrial edge network. Do not expose port 8080 directly to the public internet.

## 8. MTR-0025 protection values to verify before energization

These values are the current software profile and must be compared with the approved protection study:

| Rule | Software value |
|---|---:|
| Rated current | 35.7 A |
| Overcurrent warning boundary | 44.625 A (`1.25 × rated`) |
| Hard current boundary | 48.195 A (`1.35 × rated`) |
| Phase-imbalance low-current boundary | 8.0 A |
| THD warning boundary | 10% |
| THD high-fault boundary | 15% |
| THD emergency boundary | 20% |
| dB warning boundary | 82 dB |
| dB emergency boundary | 95 dB |
| DOL starter mask | 3.0 s, startup envelope 8.0× rated |
| Soft starter mask | 1.5 s, startup envelope 4.0× rated |
| VFD starter mask | 0.5 s, startup envelope 1.8× rated |
| Class 10 at 1.5× rated | approximately 16.46 s; acceptance window 15–18 s |

The software values are not permission to change the motor protection settings. The approved electrical design wins if it requires a more conservative limit.

## 9. Hardware-in-the-loop verification sequence

Run each step in order. Record UTC start/end, firmware version, bridge version, API/model version, motor state, sensor serial numbers, packet sequence range, dashboard screenshot, and witness initials.

### HIL-0 — Software and edge preflight

Run only against a staging/commissioning API and database:

```bash
python3 ml/scripts/verify_tcc_starter_masking.py
python3 ml/scripts/flour_mill_mtr0025_sim.py
python3 ml/scripts/phase11_hardware_pilot_check.py \
  --api-base http://VOLTGUARD_API_HOST:8080 \
  --motor-ids 25 26 27
```

Expected:

- v2 manifest is `v2-retrained`.
- ONNX scaler, Isolation Forest, XGBoost, and Random Forest accept the ordered 35-feature contract.
- Simulation packets are explicitly `is_simulation=true` and `telemetry_source="SIMULATION"`.
- The safety threshold case trips independently of the ML class.
- No simulation packet is sent to the plant database.

### HIL-1 — Sensor and transport loopback, motor de-energized

- [ ] Keep the motor isolated under LOTO.
- [ ] Verify the bridge receives serial/MQTT frames and rejects malformed frames.
- [ ] Verify `motorId=25`, source label, UTC timestamp, sequence monotonicity, and payload schema.
- [ ] Verify the API response has the expected motor ID and persistence status.
- [ ] Do **not** send `phase_currents_a: [0,0,0]` as a stopped-state heartbeat; omit phase arrays while the motor is intentionally stopped to avoid classifying stopped current as phase loss.
- [ ] Verify the dashboard shows the hardware source and no `SIMULATION` label.

### HIL-2 — Cold start and starter masking

Use the actual configured `operating_mode`:

- DOL: confirm a valid inrush within the approved envelope is masked for 3.0 seconds.
- Soft starter: confirm the 1.5-second mask and 4.0× envelope.
- VFD: confirm the 0.5-second mask and 1.8× envelope.
- Confirm instantaneous short-circuit protection is never masked.
- Confirm relay feedback matches the commanded safe state.

Do not create a short circuit or intentional high-current event with the motor. Use an approved secondary injection/relay test set for trip-path testing.

### HIL-3 — Nominal running baseline

- [ ] Run at the approved steady operating point.
- [ ] Capture at least 10 consecutive packets with all three phase currents, measured THD, and timestamp continuity.
- [ ] Confirm no emergency trip, no safety override, `status=running`, and stable phase ordering.
- [ ] Compare each phase RMS current and voltage with the reference instrument.
- [ ] Confirm the dashboard trace IDs and telemetry source match the edge logs.

### HIL-4 — Controlled phase imbalance / phase loss

- [ ] Use a certified test source, controlled simulator, or approved test method; do not loosen live terminals or create an uncontrolled phase fault.
- [ ] Apply a documented imbalance and verify the three values reach the API unchanged.
- [ ] Confirm the final decision is safety-authoritative and the relay path opens when the approved threshold is crossed.
- [ ] Confirm XGBoost/RF labels remain audit fields; they cannot override the safety result.
- [ ] Restore balanced operation and verify reset/restart behavior according to the approved control procedure.

### HIL-5 — THD and vibration/acoustic threshold paths

- [ ] Use calibrated injection or a controlled mechanical/electrical test source.
- [ ] Verify warning behavior at THD ≥10% and dB ≥82.
- [ ] Verify emergency behavior at THD ≥20% or dB ≥95.
- [ ] If dB is unavailable, send `null`/omit it and confirm the dashboard marks it unavailable; do not substitute the backend's missing-sensor baseline as measured dB.

### HIL-6 — Overload and instantaneous trip

- [ ] Exercise the Class 10 behavior with an approved relay test set or controlled load bank.
- [ ] Confirm 1.5× rated current trips within 15–18 seconds under the stateful TCC test.
- [ ] Confirm the instantaneous trip path overrides starter masking.
- [ ] Confirm the relay feedback, API `emergencyTrip`, dashboard alert, and audit trace agree.
- [ ] Never force 8× rated current through the physical motor for a software acceptance test; for MTR-0025 this is approximately 285.6 A and belongs in a certified injection test.

### HIL-7 — Faulted telemetry and network resilience

- [ ] Disconnect one CT input in the bridge test harness; confirm packet rejection or an explicit sensor-quality alarm.
- [ ] Send wrong-length phase arrays, NaN/Infinity, stale timestamps, wrong `motorId`, and duplicate sequence numbers; confirm they do not reach the inference endpoint.
- [ ] Interrupt MQTT/serial input and API connectivity; confirm bounded buffering and recovery without replaying stale data as current.
- [ ] Confirm no network failure can issue a relay command or suppress hardwired protection.

### HIL-8 — Explainability and dashboard evidence

- [ ] Select the latest verified hardware telemetry point.
- [ ] Confirm the dashboard sends the active point plus the exact returned telemetry window to `/api/telemetry/explain`.
- [ ] Confirm explanation output remains evidence-bound and bilingual.
- [ ] Confirm an explanation-provider failure does not affect detection, relay state, alerts, or telemetry persistence.

## 10. Acceptance evidence

The commissioning package is complete only when it contains:

- Signed Go/No-Go gate.
- Sensor calibration sheets and CT phase map.
- ESP32 firmware build/hash and configuration revision.
- Bridge configuration revision and service logs.
- MQTT broker/client certificate evidence without private keys.
- API/model version and manifest hash.
- Raw packet sample before forwarding and API response after forwarding.
- HIL result table for nominal, startup, phase imbalance, THD, dB, overload, instantaneous trip, malformed data, and network outage.
- Relay/contactor feedback evidence.
- Dashboard screenshots showing hardware provenance, decision state, safety override, and audit trace.
- Incident/rollback record for every failed test.

## 11. Rollback and controlled shutdown

1. Stop the bridge forwarder.
2. Place the motor in the approved safe state using the hardwired control system.
3. Isolate the ESP32 and CT interface before changing wiring.
4. Preserve edge logs, API logs, telemetry IDs, and relay feedback.
5. Revert to the last known-good bridge/configuration version.
6. Re-run HIL-0 and HIL-1 before any further energization.
