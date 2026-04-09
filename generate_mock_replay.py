from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path


def _work_tilt_deg(offset_s: float) -> float:
    if offset_s < 45.0:
        return 3.0 + 1.0 * math.sin(offset_s / 9.0)
    if offset_s < 105.0:
        return 9.0 + 3.0 * math.sin(offset_s / 12.0)
    if offset_s < 140.0:
        return 4.0 + 1.5 * math.sin(offset_s / 8.0)
    if offset_s < 220.0:
        return 13.0 + 4.0 * math.sin(offset_s / 10.0)
    if offset_s < 270.0:
        return 18.0 + 3.0 * math.sin(offset_s / 7.0)
    return 5.0 + 1.5 * math.sin(offset_s / 11.0)


def _gaze_for_offset(offset_s: float, rng: random.Random) -> tuple[str, float]:
    cycle = offset_s % 30.0
    if cycle < 20.0:
        return "screen", round(rng.uniform(0.82, 0.97), 3)
    if cycle < 24.0:
        return "phone", round(rng.uniform(0.68, 0.88), 3)
    if cycle < 28.0:
        return "away", round(rng.uniform(0.60, 0.82), 3)
    return "screen", round(rng.uniform(0.78, 0.95), 3)


def build_dataset(duration_s: int = 300, imu_hz: int = 25, context_interval_s: float = 3.0) -> dict:
    rng = random.Random(20260408)

    context_samples = []
    sample_count = int(duration_s / context_interval_s)
    for index in range(sample_count):
        offset_s = round(index * context_interval_s, 3)
        gaze_target, gaze_conf = _gaze_for_offset(offset_s, rng)
        confidence = round(0.9 + 0.05 * math.sin(offset_s / 30.0) + rng.uniform(-0.02, 0.02), 3)
        ambient_noise_db = round(37.0 + 2.5 * math.sin(offset_s / 17.0) + rng.uniform(-1.2, 1.2), 2)
        clip_scores = {
            "desk_work": round(max(0.7, min(0.96, confidence)), 3),
            "meeting": round(rng.uniform(0.01, 0.08), 3),
            "walking": round(rng.uniform(0.01, 0.06), 3),
            "resting": round(rng.uniform(0.01, 0.05), 3),
        }
        total = sum(clip_scores.values())
        clip_scores = {key: round(value / total, 3) for key, value in clip_scores.items()}

        context_samples.append({
            "offset_s": offset_s,
            "scene_context": {
                "scene": "desk",
                "confidence": confidence,
                "social": False,
                "ambient_noise_db": ambient_noise_db,
            },
            "gaze": {
                "target": gaze_target,
                "confidence": gaze_conf,
            },
            "sensor_log": {
                "scene_label": "desk_work",
                "activity_hint": "desk_work",
                "confidence": confidence,
                "motion_level": round(max(0.02, min(0.25, abs(math.sin(offset_s / 14.0)) * 0.18 + rng.uniform(0.0, 0.04))), 3),
                "scores_by_label": clip_scores,
                "top_prompt": "a person working at a desk with a laptop",
                "model": "mock-replay-v1",
            },
        })

    imu_frames = []
    frame_count = duration_s * imu_hz
    for index in range(frame_count):
        offset_s = round(index / imu_hz, 3)
        tilt_deg = _work_tilt_deg(offset_s) + rng.uniform(-0.8, 0.8)
        roll_deg = 1.2 * math.sin(offset_s / 19.0) + rng.uniform(-0.7, 0.7)
        yaw_deg = 0.8 * math.sin(offset_s / 27.0) + rng.uniform(-0.5, 0.5)
        rad_tilt = math.radians(tilt_deg)
        rad_roll = math.radians(roll_deg)

        ax = 9.81 * math.sin(rad_tilt) + rng.uniform(-0.12, 0.12)
        ay = 9.81 * math.sin(rad_roll) + rng.uniform(-0.08, 0.08)
        az = 9.81 * math.cos(rad_tilt) * math.cos(rad_roll) + rng.uniform(-0.12, 0.12)

        motion_scale = 0.012 if tilt_deg < 8 else 0.02 if tilt_deg < 14 else 0.03
        imu_frames.append({
            "offset_s": offset_s,
            "type": "imu",
            "ts": int(offset_s * 1000),
            "ax": round(ax, 4),
            "ay": round(ay, 4),
            "az": round(az, 4),
            "gx": round(rng.uniform(-motion_scale, motion_scale), 4),
            "gy": round(rng.uniform(-motion_scale, motion_scale), 4),
            "gz": round(rng.uniform(-motion_scale, motion_scale), 4),
            "tilt_deg": round(tilt_deg, 3),
            "roll_deg": round(roll_deg, 3),
            "yaw_deg": round(yaw_deg, 3),
        })

    return {
        "meta": {
            "name": "desk_work_focus_5min",
            "duration_s": duration_s,
            "imu_hz": imu_hz,
            "context_interval_s": context_interval_s,
            "loop": True,
            "description": "Five-minute replay of focused desk work with camera and IMU mock data.",
        },
        "context_samples": context_samples,
        "imu_frames": imu_frames,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a local mock replay dataset for camera + IMU")
    parser.add_argument("--output", default="mock_data/desk_work_focus_5min.json")
    parser.add_argument("--duration", type=int, default=300)
    parser.add_argument("--imu-hz", type=int, default=25)
    parser.add_argument("--context-interval", type=float, default=3.0)
    args = parser.parse_args()

    dataset = build_dataset(
        duration_s=args.duration,
        imu_hz=args.imu_hz,
        context_interval_s=args.context_interval,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dataset, indent=2))
    print(f"Wrote replay dataset to {output_path}")


if __name__ == "__main__":
    main()
