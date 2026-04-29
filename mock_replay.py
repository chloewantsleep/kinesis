from __future__ import annotations

import json
import time
from bisect import bisect_right
from pathlib import Path
from typing import Any, Optional

from schemas import GazeReading, SceneContext


REPLAY_DATASET_DIR = Path(__file__).resolve().parent / "mock_data"
REPLAY_PROFILE_PATHS = {
    "working": REPLAY_DATASET_DIR / "desk_work_focus_5min.json",
    "meeting": REPLAY_DATASET_DIR / "interview_forward_lean_5min.json",
    "walking": REPLAY_DATASET_DIR / "street_walk_sidebend_5min.json",
}


def resolve_replay_dataset(dataset_ref: str) -> Path:
    candidate = Path(dataset_ref)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    if dataset_ref in REPLAY_PROFILE_PATHS:
        return REPLAY_PROFILE_PATHS[dataset_ref]

    for path in [Path(__file__).resolve().parent / candidate, REPLAY_DATASET_DIR / candidate]:
        if path.exists():
            return path

    available = ", ".join(sorted(REPLAY_PROFILE_PATHS))
    raise FileNotFoundError(f"Replay dataset not found: {dataset_ref}. Available profiles: {available}")


class ReplayDataset:
    def __init__(self, dataset_path: str) -> None:
        self.path = resolve_replay_dataset(dataset_path)
        payload = json.loads(self.path.read_text())

        self.meta = payload.get("meta", {})
        self.duration_s = float(self.meta.get("duration_s", 0.0))
        self.context_samples: list[dict[str, Any]] = payload.get("context_samples", [])

        # Dual-sensor IMU frames — keyed by sensor name for O(1) lookup
        raw_imu: list[dict[str, Any]] = payload.get("imu_frames", [])
        self._imu_by_sensor: dict[str, list[dict[str, Any]]] = {}
        for frame in raw_imu:
            sensor = frame.get("sensor", "upper_back")
            self._imu_by_sensor.setdefault(sensor, []).append(frame)
        for sensor, frames in self._imu_by_sensor.items():
            frames.sort(key=lambda f: float(f["offset_s"]))
        self._imu_offsets_by_sensor: dict[str, list[float]] = {
            s: [float(f["offset_s"]) for f in frames]
            for s, frames in self._imu_by_sensor.items()
        }

        # EMG frames (optional — old datasets without emg_frames still work)
        self.emg_frames: list[dict[str, Any]] = sorted(
            payload.get("emg_frames", []), key=lambda f: float(f["offset_s"])
        )
        self._emg_offsets: list[float] = [float(f["offset_s"]) for f in self.emg_frames]

        if self.duration_s <= 0.0:
            raise ValueError(f"Invalid replay duration in {self.path}")
        if not self.context_samples:
            raise ValueError(f"Replay dataset {self.path} has no context_samples")
        if not self._imu_by_sensor:
            raise ValueError(f"Replay dataset {self.path} has no imu_frames")

        self.context_samples.sort(key=lambda item: float(item["offset_s"]))
        self._context_offsets = [float(item["offset_s"]) for item in self.context_samples]
        self._start_time = time.time()

    def reset(self) -> None:
        self._start_time = time.time()

    def _current_offset(self) -> float:
        return (time.time() - self._start_time) % self.duration_s

    def _window_frames(
        self,
        frames: list[dict[str, Any]],
        offsets: list[float],
        window_ms: int,
    ) -> list[dict[str, Any]]:
        current_offset = self._current_offset()
        window_s = window_ms / 1000.0
        start_offset = current_offset - window_s

        selected: list[dict[str, Any]] = []
        for frame in frames:
            fo = float(frame["offset_s"])
            if start_offset >= 0.0:
                in_window = start_offset <= fo <= current_offset
            else:
                in_window = fo >= (self.duration_s + start_offset) or fo <= current_offset
            if in_window:
                frame_copy = dict(frame)
                frame_copy["host_time"] = time.time() - (current_offset - fo)
                selected.append(frame_copy)
        return selected

    def get_window_frames(self, sensor: str = "upper_back", window_ms: int = 1000) -> list[dict[str, Any]]:
        frames = self._imu_by_sensor.get(sensor, [])
        offsets = self._imu_offsets_by_sensor.get(sensor, [])
        return self._window_frames(frames, offsets, window_ms)

    def get_window_emg(self, window_ms: int = 2000) -> list[dict[str, Any]]:
        return self._window_frames(self.emg_frames, self._emg_offsets, window_ms)

    def get_current_context_sample(self) -> dict[str, Any]:
        offset_s = self._current_offset()
        idx = bisect_right(self._context_offsets, offset_s) - 1
        if idx < 0:
            idx = len(self.context_samples) - 1
        return self.context_samples[idx]


class ReplayContextSource:
    def __init__(self, dataset_path: str) -> None:
        self._dataset = ReplayDataset(dataset_path)
        self.dataset_ref = dataset_path

    def reset(self) -> None:
        self._dataset.reset()

    def set_dataset(self, dataset_ref: str) -> bool:
        resolved = resolve_replay_dataset(dataset_ref)
        if resolved == self._dataset.path:
            self.reset()
            self.dataset_ref = dataset_ref
            return False
        self._dataset = ReplayDataset(str(resolved))
        self.dataset_ref = dataset_ref
        return True

    def read(self) -> tuple[SceneContext, GazeReading | None, dict[str, Any]]:
        sample = self._dataset.get_current_context_sample()
        now = time.time()

        scene_payload = dict(sample["scene_context"])
        scene_payload["timestamp"] = now
        scene = SceneContext.from_dict(scene_payload)

        gaze = None
        if sample.get("gaze"):
            gaze_payload = dict(sample["gaze"])
            gaze_payload["timestamp"] = now
            gaze = GazeReading.from_dict(gaze_payload)

        sensor_log = dict(sample.get("sensor_log", {}))
        sensor_log["timestamp"] = now
        sensor_log["replay_source"] = str(self._dataset.path)
        return scene, gaze, sensor_log


class ReplayIMUBridge:
    """
    Replay equivalent of ESP32Bridge.
    Exposes the same interface so body_agent.py needs no branching.
    """

    def __init__(self, dataset_path: str) -> None:
        self._dataset = ReplayDataset(dataset_path)
        self.dataset_ref = dataset_path
        self._running = False

    def start_streaming(self, reset: bool = True) -> None:
        if reset:
            self._dataset.reset()
        self._running = True

    def stop(self) -> None:
        self._running = False

    def set_dataset(self, dataset_ref: str, reset: bool = True) -> bool:
        resolved = resolve_replay_dataset(dataset_ref)
        if resolved == self._dataset.path:
            if reset:
                self._dataset.reset()
            self.dataset_ref = dataset_ref
            return False
        self._dataset = ReplayDataset(str(resolved))
        self.dataset_ref = dataset_ref
        self._running = True
        if reset:
            self._dataset.reset()
        return True

    # ------------------------------------------------------------------
    # Data accessors — match ESP32Bridge interface exactly
    # ------------------------------------------------------------------

    def get_recent_frames(self, sensor: str = "upper_back", window_ms: int = 1000) -> list[dict[str, Any]]:
        if not self._running:
            self.start_streaming(reset=False)
        return self._dataset.get_window_frames(sensor=sensor, window_ms=window_ms)

    def get_recent_emg(self, window_ms: int = 2000) -> list[dict[str, Any]]:
        if not self._running:
            self.start_streaming(reset=False)
        return self._dataset.get_window_emg(window_ms=window_ms)

    # ------------------------------------------------------------------
    # Commands — no-op with log (match ESP32Bridge interface)
    # ------------------------------------------------------------------

    def send_vibration_command(
        self,
        motor: Optional[str] = None,
        intensity: float = 0.5,
        duration_ms: int = 300,
        pattern: str = "single_pulse",
    ) -> None:
        target = motor or "all"
        print(f"[REPLAY VIBRATION] motor={target} intensity={intensity:.2f} duration={duration_ms}ms pattern={pattern}")

    def stop_vibration(self, motor: Optional[str] = None) -> None:
        target = motor or "all"
        print(f"[REPLAY VIBRATION] stop motor={target}")

    def request_emg_window(self, duration_ms: int = 5000) -> None:
        print(f"[REPLAY EMG] high-rate window {duration_ms} ms (no-op in replay mode)")
