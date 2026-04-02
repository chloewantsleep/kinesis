import argparse
import os
import time

from camera_bridge import CameraBridge, MockCameraBridge
from context_agent import ContextAgent
from context_state import ContextAgentConfig
from logger import JsonlLogger
from speech import SpeechActuator
from vision_tools import VisionTools
from scene_features import CLIPContextInferencer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="Use mock context instead of real camera")
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--log-dir", type=str, default="logs_context")
    parser.add_argument("--clip-model", type=str, default="openai/clip-vit-base-patch32")
    args = parser.parse_args()

    logger = JsonlLogger(log_dir=args.log_dir, run_name="context_agent_run")

    if args.mock:
        camera = MockCameraBridge()
        print("[Main] Using MockCameraBridge")
        inferencer = None
    else:
        camera = CameraBridge(camera_index=args.camera_index)
        print(f"[Main] Using CameraBridge camera={args.camera_index}")
        inferencer = CLIPContextInferencer(model_name=args.clip_model)

    camera.start()

    tools = VisionTools(camera, inferencer=inferencer)
    speech = SpeechActuator()
    config = ContextAgentConfig(
        step_interval_sec=2.0,
        cooldown_sec=12.0,
        min_confidence=0.55,
        speech_enabled=True,
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
    finally:
        camera.stop()


if __name__ == "__main__":
    main()