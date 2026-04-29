# 串口通信、传感器缓冲、振动命令发送。
# ESP32Bridge 分别缓存 upper_back / lower_back IMU 帧和 EMG 帧。
# MockBridge 模拟双 IMU + EMG，无需硬件即可跑通 agent。
import json
import math
import random
import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional

try:
    import serial
except ImportError:
    serial = None

# Valid motor names — must match firmware MotorState.name values
MOTOR_NAMES = {"left_upper", "right_upper", "center_lower"}


class ESP32Bridge:
    def __init__(self, port: str, baudrate: int = 115200, max_buffer_size: int = 5000):
        if serial is None:
            raise ImportError("pyserial is required: pip install pyserial")

        self.port = port
        self.baudrate = baudrate
        self.ser = serial.Serial(port, baudrate, timeout=0.1)

        # Separate buffers per IMU sensor
        self._imu_buffers: Dict[str, Deque[Dict]] = {
            "upper_back": deque(maxlen=max_buffer_size),
            "lower_back": deque(maxlen=max_buffer_size),
        }
        # EMG frames
        self._emg_buffer: Deque[Dict] = deque(maxlen=max_buffer_size)

        self.running = False
        self.thread: Optional[threading.Thread] = None

    def start_streaming(self) -> None:
        self.running = True
        self.thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.ser and self.ser.is_open:
            self.ser.close()

    def _reader_loop(self) -> None:
        while self.running:
            try:
                line = self.ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                msg = json.loads(line)
                msg_type = msg.get("type")

                if msg_type == "imu":
                    sensor = msg.get("sensor", "upper_back")
                    msg["host_time"] = time.time()
                    if sensor in self._imu_buffers:
                        self._imu_buffers[sensor].append(msg)
                    else:
                        # Unknown sensor label — log and drop
                        print(f"[ESP32] unknown IMU sensor: {sensor}")

                elif msg_type == "emg":
                    msg["host_time"] = time.time()
                    self._emg_buffer.append(msg)

                else:
                    print(f"[ESP32] {msg}")

            except Exception as e:
                print(f"[Bridge read error] {e}")
                time.sleep(0.05)

    # ------------------------------------------------------------------
    # Data accessors
    # ------------------------------------------------------------------

    def get_recent_frames(self, sensor: str, window_ms: int = 1000) -> List[Dict]:
        """Return IMU frames from the given sensor within the last window_ms."""
        buf = self._imu_buffers.get(sensor)
        if buf is None:
            return []
        cutoff = time.time() - (window_ms / 1000.0)
        return [f for f in buf if f.get("host_time", 0) >= cutoff]

    def get_recent_emg(self, window_ms: int = 2000) -> List[Dict]:
        """Return EMG frames within the last window_ms."""
        cutoff = time.time() - (window_ms / 1000.0)
        return [f for f in self._emg_buffer if f.get("host_time", 0) >= cutoff]

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    def send_vibration_command(
        self,
        motor: Optional[str] = None,
        intensity: float = 0.5,
        duration_ms: int = 300,
        pattern: str = "single_pulse",
    ) -> None:
        """
        Fire a vibration motor.
        motor: "left_upper" | "right_upper" | "lower_center" | None (= all three)
        """
        if motor is not None and motor not in MOTOR_NAMES:
            print(f"[Bridge] unknown motor '{motor}' — ignoring")
            return
        pwm = max(0, min(255, int(intensity * 255)))
        cmd: Dict = {"cmd": "vibrate", "duration_ms": duration_ms, "pwm": pwm, "pattern": pattern}
        if motor is not None:
            cmd["motor"] = motor
        self._send_json(cmd)

    def stop_vibration(self, motor: Optional[str] = None) -> None:
        cmd: Dict = {"cmd": "stop_vibration"}
        if motor is not None:
            cmd["motor"] = motor
        self._send_json(cmd)

    def request_emg_window(self, duration_ms: int = 5000) -> None:
        """Ask ESP32 to sample EMG at high rate for duration_ms after an intervention."""
        self._send_json({"cmd": "emg_start", "duration_ms": duration_ms})

    def _send_json(self, payload: Dict) -> None:
        try:
            self.ser.write((json.dumps(payload) + "\n").encode("utf-8"))
        except Exception as e:
            print(f"[Bridge write error] {e}")


class MockBridge:
    """
    Simulates dual IMU + EMG without hardware.
    upper_back: stays near-upright for 6 s, then gradually tilts forward.
    lower_back: lags upper by ~2 s and tilts slightly less (realistic spinal pattern).
    EMG: low-level noise, briefly spikes when a vibration command is sent.
    """

    def __init__(self, max_buffer_size: int = 5000):
        self._imu_buffers: Dict[str, Deque[Dict]] = {
            "upper_back": deque(maxlen=max_buffer_size),
            "lower_back": deque(maxlen=max_buffer_size),
        }
        self._emg_buffer: Deque[Dict] = deque(maxlen=max_buffer_size)
        self._emg_spike_until: float = 0.0

        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.start_time = time.time()

    def start_streaming(self) -> None:
        self.running = True
        self.thread = threading.Thread(target=self._simulate_loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)

    def _simulate_loop(self) -> None:
        while self.running:
            now = time.time()
            t = now - self.start_time
            ts = int(t * 1000)

            # Upper back: starts leaning forward after 6 s
            upper_tilt = 2.0 if t < 6 else min(22.0, 2.0 + (t - 6) * 2.5)
            # Lower back: 2 s lag, smaller amplitude
            lower_tilt = 1.0 if t < 8 else min(14.0, 1.0 + (t - 8) * 1.5)

            for sensor, tilt in (("upper_back", upper_tilt), ("lower_back", lower_tilt)):
                rad = math.radians(tilt)
                ax = 9.81 * math.sin(rad) + random.uniform(-0.1, 0.1)
                ay = random.uniform(-0.15, 0.15)
                az = 9.81 * math.cos(rad) + random.uniform(-0.1, 0.1)
                frame = {
                    "type": "imu",
                    "sensor": sensor,
                    "ts": ts,
                    "ax": ax, "ay": ay, "az": az,
                    "gx": random.uniform(-0.03, 0.03),
                    "gy": random.uniform(-0.03, 0.03),
                    "gz": random.uniform(-0.03, 0.03),
                    "host_time": now,
                }
                self._imu_buffers[sensor].append(frame)

            # EMG: quiet noise; briefly spike after a vibration trigger
            if now < self._emg_spike_until:
                mv = random.uniform(200.0, 600.0)   # muscle activation
            else:
                mv = random.uniform(10.0, 40.0)     # resting noise
            self._emg_buffer.append({"type": "emg", "ts": ts, "mv": mv, "host_time": now})

            time.sleep(0.04)  # ~25 Hz

    # ------------------------------------------------------------------
    # Data accessors (same interface as ESP32Bridge)
    # ------------------------------------------------------------------

    def get_recent_frames(self, sensor: str, window_ms: int = 1000) -> List[Dict]:
        buf = self._imu_buffers.get(sensor)
        if buf is None:
            return []
        cutoff = time.time() - (window_ms / 1000.0)
        return [f for f in buf if f.get("host_time", 0) >= cutoff]

    def get_recent_emg(self, window_ms: int = 2000) -> List[Dict]:
        cutoff = time.time() - (window_ms / 1000.0)
        return [f for f in self._emg_buffer if f.get("host_time", 0) >= cutoff]

    # ------------------------------------------------------------------
    # Commands (no-op with log)
    # ------------------------------------------------------------------

    def send_vibration_command(
        self,
        motor: Optional[str] = None,
        intensity: float = 0.5,
        duration_ms: int = 300,
        pattern: str = "single_pulse",
    ) -> None:
        target = motor or "all"
        print(f"[MOCK VIBRATION] motor={target} intensity={intensity:.2f} duration={duration_ms}ms pattern={pattern}")
        # Simulate EMG response to haptic feedback
        self._emg_spike_until = time.time() + (duration_ms / 1000.0) + 2.0

    def stop_vibration(self, motor: Optional[str] = None) -> None:
        target = motor or "all"
        print(f"[MOCK VIBRATION] stop motor={target}")

    def request_emg_window(self, duration_ms: int = 5000) -> None:
        print(f"[MOCK EMG] high-rate window for {duration_ms} ms")
        self._emg_spike_until = time.time() + (duration_ms / 1000.0)
