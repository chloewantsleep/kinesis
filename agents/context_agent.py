"""Glasses context agent — observes the user's environment and provides context.

This is an LLM agent. It reads mock scene/gaze sensors on a loop (2s), writes
to the shared state blackboard, and invokes Claude when:
- The scene changes (desk → meeting → walking)
- Another agent asks a question via the discussion channel

Usage:
    python agents/context_agent.py
    python agents/context_agent.py --server http://localhost:9000/mcp
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

import anthropic
from mcp.client.streamable_http import streamable_http_client
from mcp.client.session import ClientSession

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from schemas import SceneType, SceneContext
from ble.mock_sensors import MockSceneSensor, MockGazeSensor

# Faster timeline for demos (45s desk → 30s meeting → 15s walking → repeat)
DEMO_TIMELINE = [
    (45.0, SceneContext(SceneType.DESK, 0.95, False, 35.0)),
    (30.0, SceneContext(SceneType.MEETING, 0.90, True, 55.0)),
    (15.0, SceneContext(SceneType.WALKING, 0.85, False, 60.0)),
]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_SERVER_URL = "http://localhost:8080/mcp"
SENSOR_INTERVAL_S = 2.0
LLM_COOLDOWN_S = 15.0
MAX_TOOL_ROUNDS = 5

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

DEFAULT_SYSTEM_PROMPT = """\
You are the Glasses context agent — an environment awareness assistant embedded in AI glasses worn by the user.

## Your Role
You observe the user's environment (scene type, social presence, noise, gaze direction) and serve two functions:
1. Proactively update the blackboard when the scene changes so other agents can adapt.
2. Answer questions from the body agent about whether interventions are appropriate.

## When Scene Changes
When you detect a scene transition (e.g., desk → meeting), consider:
- Should the coaching mode change? (meetings → prefer silent, walking → suppress haptics)
- Is someone else present? (social → avoid visible/audible interventions)
- Use display_overlay to briefly inform the user if relevant ("Entering meeting mode")

## When Asked a Question
The body agent may ask you whether it should intervene (e.g., "User has bad posture for 45s. Should I fire a haptic?"). Consider:
- Current scene: desk (full intervention OK), meeting (silent only), walking (suppress)
- Social context: if others present, recommend gentle/silent
- Gaze direction: if user is looking at person (conversation), delay intervention
- Be specific: recommend a pattern and intensity, or say "skip this one"

## Available Tools
- update_state(device_id, key, data, confidence): Write state to blackboard
- display_overlay(message, duration_ms, position): Show text on glasses display
- reply_to_agent(from_agent, message): Reply to a question from another agent
- get_pending_discussion(agent_id): Check if someone asked you a question

## Output
Be concise. When replying to the body agent, give a clear recommendation in 1-2 sentences.
"""

# ---------------------------------------------------------------------------
# Local state
# ---------------------------------------------------------------------------

@dataclass
class _LocalState:
    last_scene: SceneType | None = None
    last_gaze: object | None = None
    last_scene_context: object | None = None
    last_llm_time: float = 0.0
    trigger_reason: str = ""
    llm_trigger: asyncio.Event = field(default_factory=asyncio.Event)


# ---------------------------------------------------------------------------
# MCP ↔ Claude bridge
# ---------------------------------------------------------------------------

async def _mcp_tools_to_claude_tools(session: ClientSession) -> list[dict]:
    result = await session.list_tools()
    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.inputSchema,
        }
        for tool in result.tools
    ]


async def _execute_tool_call(session: ClientSession, name: str, arguments: dict) -> str:
    try:
        result = await session.call_tool(name, arguments)
        texts = [c.text for c in result.content if hasattr(c, "text")]
        return "\n".join(texts) if texts else "{}"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ---------------------------------------------------------------------------
# Context Agent
# ---------------------------------------------------------------------------

class ContextAgent:
    def __init__(self, server_url: str = DEFAULT_SERVER_URL, demo: bool = False) -> None:
        self._server_url = server_url
        self._local = _LocalState()
        self._demo = demo

    async def run(self) -> None:
        while True:
            try:
                logger.info("Connecting to %s", self._server_url)
                async with streamable_http_client(self._server_url) as (r, w, _):
                    async with ClientSession(r, w) as session:
                        await session.initialize()
                        logger.info("Connected to shared state server")
                        await self._run_with_session(session)
            except Exception as e:
                logger.error("Connection lost: %s — reconnecting in 3s", e)
                await asyncio.sleep(3)

    async def _run_with_session(self, session: ClientSession) -> None:
        sensor_task = asyncio.create_task(self._sensor_loop(session))
        llm_task = asyncio.create_task(self._llm_loop(session))
        try:
            await asyncio.gather(sensor_task, llm_task)
        finally:
            sensor_task.cancel()
            llm_task.cancel()

    # -- fast path: sensor loop --

    async def _sensor_loop(self, session: ClientSession) -> None:
        scene_sensor = MockSceneSensor(scripted=DEMO_TIMELINE if self._demo else None)
        gaze_sensor = MockGazeSensor(scene_sensor=scene_sensor)

        while True:
            scene_ctx = await scene_sensor.read()
            gaze = await gaze_sensor.read()

            self._local.last_scene_context = scene_ctx
            self._local.last_gaze = gaze

            # Write to blackboard (serialized to avoid session contention)
            await self._safe_update(session, "context", scene_ctx.to_dict(), scene_ctx.confidence)
            await self._safe_update(session, "gaze", gaze.to_dict(), gaze.confidence)

            # Detect scene change
            if self._local.last_scene != scene_ctx.scene:
                old_scene = self._local.last_scene
                self._local.last_scene = scene_ctx.scene

                if old_scene is not None:
                    cooldown_ok = (time.time() - self._local.last_llm_time) > LLM_COOLDOWN_S
                    if cooldown_ok and not self._local.llm_trigger.is_set():
                        self._local.trigger_reason = f"scene_change_{old_scene.value}_to_{scene_ctx.scene.value}"
                        self._local.llm_trigger.set()

            # Check for pending discussion questions (serialized with sensor writes)
            await self._check_pending_discussion(session)

            await asyncio.sleep(SENSOR_INTERVAL_S)

    async def _safe_update(self, session: ClientSession, key: str, data: dict, confidence: float) -> None:
        try:
            await session.call_tool("update_state", {
                "device_id": "glasses", "key": key,
                "data": data, "confidence": confidence,
            })
        except Exception as e:
            logger.warning("Blackboard write %s failed: %s", key, e)

    async def _check_pending_discussion(self, session: ClientSession) -> None:
        """Check if another agent asked us a question."""
        try:
            result = await session.call_tool("get_pending_discussion", {"agent_id": "glasses"})
            texts = [c.text for c in result.content if hasattr(c, "text")]
            response_text = texts[0] if texts else "{}"
            data = json.loads(response_text)

            if data.get("pending") is not False and "question" in data:
                self._local.trigger_reason = f"discussion_from_{data['from']}"
                if not self._local.llm_trigger.is_set():
                    self._local.llm_trigger.set()
        except Exception:
            pass  # non-critical

    # -- slow path: LLM decision loop --

    async def _llm_loop(self, session: ClientSession) -> None:
        claude = anthropic.AsyncAnthropic()
        claude_tools = await _mcp_tools_to_claude_tools(session)

        while True:
            await self._local.llm_trigger.wait()
            self._local.llm_trigger.clear()

            try:
                self._local.last_llm_time = time.time()
                system_prompt = await self._load_system_prompt(session)
                user_msg = self._build_user_message()

                logger.info("LLM triggered: %s", self._local.trigger_reason)

                messages: list[dict] = [{"role": "user", "content": user_msg}]

                for _ in range(MAX_TOOL_ROUNDS):
                    response = await claude.messages.create(
                        model="claude-sonnet-4-20250514",
                        max_tokens=512,
                        system=system_prompt,
                        tools=claude_tools,
                        messages=messages,
                    )

                    if response.stop_reason != "tool_use":
                        break

                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result_text = await _execute_tool_call(session, block.name, block.input)
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result_text,
                            })

                    messages.append({"role": "assistant", "content": response.content})
                    messages.append({"role": "user", "content": tool_results})

                text_parts = [b.text for b in response.content if hasattr(b, "text")]
                if text_parts:
                    reasoning = " ".join(text_parts)
                    logger.info("LLM decision: %s", reasoning)
                    await self._safe_update(session, "last_decision", {
                        "trigger": self._local.trigger_reason,
                        "reasoning": reasoning,
                        "timestamp": time.time(),
                    }, 1.0)

            except anthropic.APIError as e:
                logger.error("Claude API error: %s", e)
            except Exception as e:
                logger.error("LLM loop error: %s", e)

    # -- helpers --

    async def _load_system_prompt(self, session: ClientSession) -> str:
        try:
            result = await session.read_resource("state://glasses/system_prompt")
            content = result.contents[0]
            data = json.loads(content.text if hasattr(content, "text") else str(content))
            prompt = data.get("data", {}).get("prompt", "")
            if prompt:
                return prompt
        except Exception:
            pass
        return DEFAULT_SYSTEM_PROMPT

    def _build_user_message(self) -> str:
        sc = self._local.last_scene_context
        gz = self._local.last_gaze

        scene_info = "No scene data yet."
        if sc:
            scene_info = (
                f"CURRENT SCENE:\n"
                f"  Type: {sc.scene.value}\n"
                f"  Confidence: {sc.confidence:.2f}\n"
                f"  Social (others present): {sc.social}\n"
                f"  Ambient noise: {sc.ambient_noise_db:.0f} dB\n"
            )

        gaze_info = ""
        if gz:
            gaze_info = f"\nCURRENT GAZE:\n  Target: {gz.target.value}\n  Confidence: {gz.confidence:.2f}\n"

        trigger_info = f"TRIGGER: {self._local.trigger_reason}\n\n"

        # If this is a discussion trigger, include instructions
        discussion_hint = ""
        if "discussion_from" in self._local.trigger_reason:
            discussion_hint = (
                "\nAnother agent has asked you a question. Use get_pending_discussion to read it, "
                "then use reply_to_agent to respond with your recommendation.\n"
            )

        return f"{trigger_info}{scene_info}{gaze_info}{discussion_hint}\nDecide what to do based on the trigger and current context."


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)-20s %(levelname)s %(message)s",
    )

    parser = argparse.ArgumentParser(description="Glasses context agent")
    parser.add_argument("--server", default=DEFAULT_SERVER_URL)
    parser.add_argument("--demo", action="store_true", help="Use faster scene timeline for demos")
    args = parser.parse_args()

    asyncio.run(ContextAgent(server_url=args.server, demo=args.demo).run())
