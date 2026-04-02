from typing import Dict

import numpy as np

from scene_features import CLIPContextInferencer


class VisionTools:
    def __init__(self, camera_bridge, inferencer: CLIPContextInferencer | None = None):
        self.camera_bridge = camera_bridge
        self.context_history = []
        self.prev_frame = None
        self.inferencer = inferencer

    def compute_motion(self, prev_frame, curr_frame) -> float:
        if prev_frame is None or curr_frame is None:
            return 0.0

        diff = np.abs(curr_frame.astype(float) - prev_frame.astype(float))
        return float(diff.mean() / 255.0)

    def get_current_context(self) -> Dict:
        if hasattr(self.camera_bridge, "get_mock_context"):
            label = self.camera_bridge.get_mock_context()
            result = {
                "scene_label": label,
                "activity_hint": label,
                "confidence": 0.85,
                "motion_level": 0.1 if label in ["desk_work", "kitchen", "meeting", "resting"] else 0.7,
                "scores_by_label": {label: 0.85},
                "top_prompt": f"mock::{label}",
            }
        else:
            frame, ts = self.camera_bridge.get_latest_frame()

            if self.inferencer is None:
                self.inferencer = CLIPContextInferencer()

            result = self.inferencer.infer(frame)
            result["motion_level"] = self.compute_motion(self.prev_frame, frame)
            result["timestamp"] = ts
            self.prev_frame = frame

        self.context_history.append(result)
        self.context_history = self.context_history[-50:]
        return result

    def get_context_window_summary(self, window_size: int = 8) -> Dict:
        history = self.context_history[-window_size:]
        if not history:
            return {
                "dominant_scene": "unknown",
                "dominant_activity": "unknown",
                "avg_confidence": 0.0,
                "avg_motion_level": 0.0,
            }

        labels = [x["scene_label"] for x in history]
        dominant_scene = max(set(labels), key=labels.count)
        avg_conf = sum(x["confidence"] for x in history) / len(history)
        avg_motion = sum(x["motion_level"] for x in history) / len(history)

        return {
            "dominant_scene": dominant_scene,
            "dominant_activity": dominant_scene,
            "avg_confidence": avg_conf,
            "avg_motion_level": avg_motion,
            "num_samples": len(history),
        }
