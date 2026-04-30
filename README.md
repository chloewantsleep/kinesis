# Kinesis

AI-powered posture monitoring system using an ESP32 wearable and a multi-agent Claude backend.

## Overview

Kinesis is a wearable posture correction system that continuously monitors body position through dual IMU sensors, then delivers targeted haptic feedback via vibration motors to guide the user back into alignment — without interrupting their focus. An EMG sensor measures muscle activation as immediate post-intervention feedback.

Three Claude-powered agents coordinate through a shared MCP blackboard and a real-time web dashboard.

```
ESP32 (dual IMU + 4 vibration motors + EMG)
        │  serial 115200
        ▼
┌───────────────────────────────────────────┐
│           Shared State Server             │  ← MCP blackboard + dashboard
│               :8080                       │
└──────┬──────────────┬──────────────┬──────┘
       │              │              │
  Body Agent    Context Agent   Brain Agent
 (posture/EMG)  (scene/camera)  (strategy)
```

## Hardware

### Sensors

| Sensor | Location | Interface |
|--------|----------|-----------|
| MPU6050 IMU | Upper back (T3–T6) | I2C 0x68 (AD0 → GND) |
| MPU6050 IMU | Lower back (L2–L4) | I2C 0x69 (AD0 → 3.3V) |
| EMG sensor | Upper back — rhomboid/trapezius | ADC pin 34 (3 electrode points) |

### Actuators

| Motor | Position | Pin |
|-------|----------|-----|
| `left_shoulder` | Left shoulder / scapular | 18 |
| `right_shoulder` | Right shoulder / scapular | 19 |
| `upper_spine` | Thoracic spine (T3–T6) | 23 |
| `lower_spine` | Lumbar spine (L2–L4) | 5 (D5) |

### ESP32 Pin Map

```
I2C:  SDA → 21   SCL → 22
Motors:  left_shoulder → 18   right_shoulder → 19
         upper_spine   → 23   lower_spine    →  5
EMG:  signal → 34 (ADC, 12-bit, 3.3 V ref)
```

### Haptic Patterns → Motor Routing

| Pattern | Motors fired | Posture trigger |
|---------|-------------|-----------------|
| `right_nudge` | right_shoulder | lateral lean left |
| `left_nudge` | left_shoulder | lateral lean right |
| `bilateral` | left_shoulder + right_shoulder | hunching / slouching |
| `pulse` | upper_spine | thoracic flexion |
| `lumbar_alert` | lower_spine | lumbar issue |
| `spine_alert` | upper_spine + lower_spine | full spinal involvement |

## Agents

| Agent | Role | Loop |
|-------|------|------|
| **Body Agent** | Reads dual-IMU posture, computes flexion/asymmetry metrics, triggers vibration, reads EMG post-intervention | 2 s sensor / threshold-triggered LLM |
| **Context Agent** | Reads camera/glasses, classifies scene (desk / meeting / walking) | 3 s |
| **Brain Agent** | Observes patterns over time, adjusts intervention mode and attention budget | 30 s |

Agents communicate via a discussion channel on the shared state server — the body agent consults the context agent before each intervention ("is the user in a meeting?").

### Posture Metrics (dual IMU)

| Metric | How computed |
|--------|-------------|
| `deviation_deg` | upper-back pitch deviation from calibrated baseline |
| `flexion_deg` | upper pitch − lower pitch (hunching indicator) |
| `lateral_asym_deg` | \|upper roll − lower roll\| (asymmetric lean) |
| `stillness_score` | 0 = moving, 1 = still (inverse of gyro magnitude) |

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/chloewantsleep/kinesis.git
cd kinesis
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-..." > .env

# 3. Run with mock sensors (no hardware needed)
python run.py

# 4. Open dashboard
open http://localhost:8080
```

### Run with real ESP32

```bash
python run.py --esp32 --serial-port /dev/cu.usbserial-XXXX
```

## Mock / Replay Mode

Three pre-recorded 5-minute sessions ship with the repo. Each contains dual-IMU frames (upper + lower back at 25 Hz), EMG frames (10 Hz), and context samples (every 3 s).

```bash
# Desk work — focus + brief meeting + hallway walk
python run.py --replay-dataset mock_data/desk_work_focus_5min.json

# Interview — sustained forward lean, social context
python run.py --replay-dataset mock_data/interview_forward_lean_5min.json

# Street walk — lateral side-bend episodes
python run.py --replay-dataset mock_data/street_walk_sidebend_5min.json
```

Regenerate all datasets after changing sensor parameters:

```bash
python generate_mock_replay.py --all
```

### Mock dataset structure

```json
{
  "meta": {
    "imu_sensors": ["upper_back", "lower_back"],
    "emg_sensors": ["upper_back"],
    "imu_hz": 25,
    "emg_hz": 10
  },
  "imu_frames": [
    { "sensor": "upper_back", "offset_s": 0.0, "ax": ..., "ay": ..., "az": ..., "gx": ..., "gy": ..., "gz": ... },
    { "sensor": "lower_back", "offset_s": 0.0, ... }
  ],
  "emg_frames": [
    { "offset_s": 0.0, "mv": 22.4, "is_active": false }
  ],
  "context_samples": [ ... ]
}
```

EMG values correlate with posture load: ~20 mV at rest, ~70–90 mV during sustained slouching, ~60–100 mV during walking.

## Run Components Separately

```bash
python shared_state_server.py    # Terminal 1 — blackboard + dashboard
python agents/context_agent.py   # Terminal 2 — scene/camera
python agents/body_agent.py      # Terminal 3 — posture/EMG
python agents/brain_agent.py     # Terminal 4 — planner
```

## Project Structure

```
kinesis/
├── agents/
│   ├── body_agent.py           # Posture + vibration + EMG agent (Claude)
│   ├── context_agent.py        # Scene/glasses agent (Claude)
│   └── brain_agent.py          # Planner agent (Claude)
├── body-agent/
│   ├── firmware/
│   │   └── esp32_main/
│   │       └── esp32_main.ino  # ESP32 firmware (dual IMU, 4 motors, EMG ADC)
│   └── python/
│       ├── bridge.py           # Serial I/O — per-sensor IMU buffers, EMG buffer
│       ├── features.py         # Dual-IMU feature extraction (flexion, asymmetry)
│       └── state.py            # Posture state machine
├── ble/                        # Mock sensor layer
├── mock_data/                  # Pre-recorded 5-min replay datasets
├── shared_state_server.py      # MCP blackboard + dashboard server
├── schemas.py                  # Shared data contracts (single source of truth)
├── mock_replay.py              # Replay dataset loader + bridge interface
├── generate_mock_replay.py     # Dual-IMU + EMG mock data generator
├── dashboard.html              # Web dashboard (served at :8080)
├── run.py                      # Orchestrator
└── requirements.txt
```

## Requirements

- Python 3.11+
- Anthropic API key (`ANTHROPIC_API_KEY` in `.env`)
- For real hardware: ESP32 with 2× MPU6050, 4× vibration motors, 1× EMG sensor (3 electrodes)
- For camera/scene mode: webcam + `torch`, `transformers`, `opencv-python`
