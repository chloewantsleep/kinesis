from typing import Dict


def infer_context_from_frame(frame, fallback_label: str = "unknown") -> Dict:
    """
    MVP placeholder.
    Real implementations can swap in CV or VLM-based context inference.
    """
    return {
        "scene_label": fallback_label,
        "activity_hint": fallback_label,
        "confidence": 0.35 if fallback_label == "unknown" else 0.8,
        "motion_level": 0.0,
    }
from typing import Dict


def infer_context_from_frame(frame, fallback_label: str = "unknown") -> Dict:
    """
    MVP placeholder.
    真实项目里这里可以换成:
    - CLIP zero-shot scene classification
    - object detection + rules
    - VLM image caption + label mapping
    """
    return {
        "scene_label": fallback_label,
        "activity_hint": fallback_label,
        "confidence": 0.35 if fallback_label == "unknown" else 0.8,
        "motion_level": 0.0,
    }