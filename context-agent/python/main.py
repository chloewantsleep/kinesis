import argparse
import os
import time

from camera_bridge import CameraBridge, MockCameraBridge
from context_agent import ContextAgent
from context_state import ContextAgentConfig
from logger import JsonlLogger
from speech import SpeechActuator
from vision_tools import VisionTools


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="Use mock context instead of real camera")
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--log-dir", type=str, default="logs_context")
    args = parser.parse_args()

    # Keep logs in a stable location relative to this script when a relative path is passed.
    resolved_log_dir = args.log_dir
    if not os.path.isabs(resolved_log_dir):
        resolved_log_dir = os.path.join(os.path.dirname(__file__), resolved_log_dir)

    logger = JsonlLogger(log_dir=resolved_log_dir, run_name="context_agent_run")
    logger.log_event(
        "run_started",
        {
            "mock": args.mock,
            "camera_index": args.camera_index,
            "log_dir": resolved_log_dir,
        },
    )

    if args.mock:
        camera = MockCameraBridge()
        print("[Main] Using MockCameraBridge")
    else:
        camera = CameraBridge(camera_index=args.camera_index)
        print(f"[Main] Using CameraBridge camera={args.camera_index}")

    camera.start()

    tools = VisionTools(camera)
    speech = SpeechActuator()
    config = ContextAgentConfig(
        step_interval_sec=2.0,
        cooldown_sec=12.0,
        min_confidence=0.55,
        speech_enabled=True,
    )
    logger.log_event(
        "agent_config",
        {
            "step_interval_sec": config.step_interval_sec,
            "cooldown_sec": config.cooldown_sec,
            "min_confidence": config.min_confidence,
            "speech_enabled": config.speech_enabled,
        },
    )

    agent = ContextAgent(
        tools=tools,
        speech_actuator=speech,
        config=config,
        logger=logger,
    )

    try:
        while True:
            agent.step()
            time.sleep(config.step_interval_sec)
    except KeyboardInterrupt:
        print("\n[Main] Stopping context agent...")
        logger.log_event("run_stopped", {"reason": "keyboard_interrupt"})
    finally:
        camera.stop()
        logger.log_event("run_finished", {"status": "camera_stopped"})


if __name__ == "__main__":
    main()