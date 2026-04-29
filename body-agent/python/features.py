# 双 IMU 特征提取：分别处理 upper_back / lower_back 帧，
# 并计算差分指标（脊柱弯曲度、左右不对称）。
import math
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Per-frame angle estimators (same as before, gravity-vector approximation)
# ---------------------------------------------------------------------------

def _pitch_deg(ax: float, ay: float, az: float) -> float:
    """Forward/backward tilt from gravity direction. Positive = forward lean."""
    denom = math.sqrt(ay * ay + az * az) + 1e-6
    return math.degrees(math.atan2(ax, denom))


def _roll_deg(ax: float, ay: float, az: float) -> float:
    """Left/right lean from gravity direction. Positive = right lean."""
    denom = math.sqrt(ax * ax + az * az) + 1e-6
    return math.degrees(math.atan2(ay, denom))


def _motion_level(frames: List[Dict]) -> float:
    if len(frames) < 2:
        return 0.0
    total = sum(abs(f.get("gx", 0.0)) + abs(f.get("gy", 0.0)) + abs(f.get("gz", 0.0))
                for f in frames)
    return total / len(frames)


# ---------------------------------------------------------------------------
# Per-IMU summary
# ---------------------------------------------------------------------------

def _summarise_imu(frames: List[Dict]) -> Optional[Dict]:
    """Return mean pitch/roll and motion for one sensor's frame window."""
    if not frames:
        return None
    pitches = [_pitch_deg(f.get("ax", 0), f.get("ay", 0), f.get("az", 0)) for f in frames]
    rolls   = [_roll_deg (f.get("ax", 0), f.get("ay", 0), f.get("az", 0)) for f in frames]
    motion  = _motion_level(frames)
    return {
        "mean_pitch": sum(pitches) / len(pitches),
        "mean_roll":  sum(rolls)   / len(rolls),
        "last_pitch": pitches[-1],
        "last_roll":  rolls[-1],
        "motion":     motion,
        "n_frames":   len(frames),
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compute_features(
    upper_frames: List[Dict],
    lower_frames: List[Dict],
    baseline_upper_pitch: float = 0.0,
    baseline_lower_pitch: float = 0.0,
) -> Dict:
    """
    Compute posture features from dual-IMU frame windows.

    Returns a dict with:
      ok                  — False if no data from either IMU
      upper / lower       — per-IMU summaries (or None)
      deviation_deg       — upper-back forward deviation from baseline
      lateral_dev_deg     — upper-back lateral deviation
      flexion_deg         — upper.pitch - lower.pitch  (hunching indicator)
      lateral_asym_deg    — |upper.roll - lower.roll|  (asymmetric lean)
      stillness_score     — 0 (moving) … 1 (still), averaged across IMUs
      num_frames          — total frames used
    """
    upper = _summarise_imu(upper_frames)
    lower = _summarise_imu(lower_frames)

    if upper is None and lower is None:
        return {
            "ok": False,
            "upper": None, "lower": None,
            "deviation_deg": 0.0, "lateral_dev_deg": 0.0,
            "flexion_deg": 0.0, "lateral_asym_deg": 0.0,
            "stillness_score": 0.0, "num_frames": 0,
        }

    # Prefer upper for primary posture signal; fall back to lower if upper missing
    primary = upper if upper is not None else lower
    secondary = lower if upper is not None else None

    deviation_deg   = primary["mean_pitch"] - baseline_upper_pitch
    lateral_dev_deg = primary["mean_roll"]

    # Differential spinal metrics — only meaningful when both IMUs are present
    if upper is not None and lower is not None:
        flexion_deg     = upper["mean_pitch"] - lower["mean_pitch"]
        lateral_asym_deg = abs(upper["mean_roll"] - lower["mean_roll"])
    else:
        flexion_deg      = 0.0
        lateral_asym_deg = 0.0

    # Stillness: average across available IMUs
    motion_vals = [s["motion"] for s in (upper, lower) if s is not None]
    avg_motion = sum(motion_vals) / len(motion_vals)
    stillness_score = max(0.0, 1.0 - min(1.0, avg_motion * 5.0))

    total_frames = sum(s["n_frames"] for s in (upper, lower) if s is not None)

    return {
        "ok": True,
        "upper": upper,
        "lower": lower,
        "deviation_deg":    deviation_deg,
        "lateral_dev_deg":  lateral_dev_deg,
        "flexion_deg":      flexion_deg,
        "lateral_asym_deg": lateral_asym_deg,
        "stillness_score":  stillness_score,
        "num_frames":       total_frames,
    }
