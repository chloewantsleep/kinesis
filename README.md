# Kinesis 🦞

AI-powered posture monitoring system using ESP32 wearable sensors and a multi-agent Claude backend.

## Overview

Kinesis is a wearable posture correction system that continuously monitors your body position and environment, then delivers gentle haptic or EMS feedback to guide you back into alignment — without interrupting your focus.

The system consists of three Claude-powered agents coordinating through a shared state server (MCP blackboard), plus a real-time web dashboard.

```
ESP32 (IMU + vibration/EMS)
        │
        ▼
┌───────────────────────────────────────────┐
│           Shared State Server             │  ← MCP blackboard + dashboard host
│               :8080                       │
└──────┬──────────────┬──────────────┬──────┘
       │              │              │
  Body Agent    Context Agent   Brain Agent
 (posture/EMS)  (scene/camera)  (strategy)
```

## Agents

| Agent | Role | Loop |
|-------|------|------|
| **Body Agent** | Reads IMU sensors, classifies posture, triggers vibration/EMS | 500ms |
| **Context Agent** | Reads camera/glasses, classifies scene (desk/meeting/walking) | 2s |
| **Brain Agent** | Observes patterns across time, adjusts intervention strategy | 30s |

Agents communicate with each other via a discussion channel on the shared state server — e.g. the body agent can ask the context agent "is the user in a meeting?" before deciding whether to intervene.

## Hardware

- **ESP32** — microcontroller streaming IMU data over serial/BLE
- **IMU sensors** — upper back (T3–T6) and lower back (L2–L4)
- **Vibration motors** — 4 zones: left/right shoulder, left/right lumbar
- **EMS channels** — rhomboid L/R, lumbar erector L/R

## Dashboard

Live dashboard served at **http://localhost:8080** — shows posture state, scene context, agent discussions, and intervention history.

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

## Mock Replay (Week 7 datasets)

Run the system against pre-recorded 5-minute sessions without any hardware:

```bash
# Desk work session
python run.py --replay-dataset mock_data/desk_work_focus_5min.json

# Interview forward lean
python run.py --replay-dataset mock_data/interview_forward_lean_5min.json

# Street walk with side bend
python run.py --replay-dataset mock_data/street_walk_sidebend_5min.json
```

Generate new mock datasets:

```bash
python generate_mock_replay.py
```

## Run components separately

```bash
python shared_state_server.py    # Terminal 1 — blackboard + dashboard
python agents/context_agent.py   # Terminal 2 — glasses/scene
python agents/body_agent.py      # Terminal 3 — posture/EMS
python agents/brain_agent.py     # Terminal 4 — planner
```

## Project Structure

```
kinesis/
├── agents/
│   ├── body_agent.py        # Posture + EMS agent
│   ├── context_agent.py     # Scene/glasses agent
│   └── brain_agent.py       # Planner agent
├── body-agent/
│   ├── firmware/            # ESP32 Arduino code
│   └── python/              # IMU feature extraction
├── context-agent/           # Camera + CLIP scene classifier
├── esp32_agent/             # ESP32 firmware (esp32_agent.ino)
├── ble/                     # BLE + mock sensor layer
├── mock_data/               # Pre-recorded 5-min replay datasets
├── shared_state_server.py   # MCP blackboard + dashboard server
├── schemas.py               # Shared data contracts
├── mock_replay.py           # Replay dataset runner
├── generate_mock_replay.py  # Mock data generator
├── dashboard.html           # Web dashboard (served at :8080)
├── run.py                   # Start everything
└── requirements.txt
```

## Requirements

- Python 3.11+
- Anthropic API key
- For real hardware: ESP32 with IMU + vibration/EMS hardware
- For camera mode: webcam + `torch`, `transformers`, `opencv-python`
