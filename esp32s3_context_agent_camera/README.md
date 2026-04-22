# ESP32S3 Context Agent Camera

Captures JPEG frames from the **Seeed Xiao ESP32S3 Sense** (OV2640 camera) over USB serial, sends them to Claude Vision for scene recognition, and writes structured scene data to the Kinesis blackboard.

## Hardware

- **Board:** Seeed XIAO ESP32S3 Sense
- **Camera:** OV2640 (built-in)
- **Connection:** USB-C to laptop

## Scene Types

Claude Vision classifies each frame into one of these labels:

| Label | Description |
|-------|-------------|
| `desk_work` | Seated, working at a screen |
| `standing_desk` | Standing at a desk/workspace |
| `meeting` | Multi-person meeting room |
| `presenting` | Standing, presenting or lecturing |
| `walking` | On foot, moving through space |
| `commuting` | In transit (subway / bus / car) |
| `exercise` | Gym, sport, or workout |
| `resting` | Sofa, lounge, or lying back |
| `eating` | Meal time |
| `reading` | Reading a book or phone |
| `social_casual` | Informal conversation |
| `social_dining` | Group meal or café |
| `outdoor` | Outside environment |
| `unknown` | Cannot be determined |

Each recognition also outputs:
- **PEOPLE** — whether other people are visible (`yes` / `no`)
- **DESC** — one-sentence natural language description

## Architecture

```
ESP32S3 (OV2640)
    │  USB serial @ 921600 baud
    │  Frame format: FRAME:<bytes>\n + binary JPEG
    ▼
serial_bridge.py
    │  HTTP POST /camera_frame (image/jpeg)
    ▼
shared_state_server.py  →  Claude Haiku Vision
    │  writes glasses/context to blackboard
    ▼
context_agent.py  →  body_agent.py  →  brain_agent.py
```

## Setup

### Arduino IDE

1. Install **esp32 by Espressif Systems** via Boards Manager
2. Select board: `XIAO_ESP32S3 Sense`
3. `Tools → PSRAM → OPI PSRAM` (required for camera)
4. Open `esp32s3_context_agent_camera.ino`
5. Set `#define USE_WIFI 0` for USB mode (default)
6. Upload

### Python

```bash
pip install pyserial requests
```

## Running

```bash
# Terminal 1 — Kinesis server
python run.py

# Terminal 2 — Serial bridge
python esp32s3_context_agent_camera/serial_bridge.py
# or specify port manually:
python esp32s3_context_agent_camera/serial_bridge.py --port /dev/cu.usbmodem1101
```

Scene results appear in Terminal 2 and on the dashboard at `http://localhost:8080`.

## Switching to WiFi

In `esp32s3_context_agent_camera.ino`:

```cpp
#define USE_WIFI 1  // change from 0 to 1
```

Then fill in your credentials:
```cpp
const char* WIFI_SSID     = "your_wifi";
const char* WIFI_PASSWORD = "your_password";
const char* SERVER_IP     = "192.168.x.x";  // laptop/Pi IP running run.py
```

WiFi mode POSTs directly to `/camera_frame` — no need to run `serial_bridge.py`.
