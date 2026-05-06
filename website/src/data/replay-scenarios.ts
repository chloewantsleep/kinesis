import type { ReplayEvent } from "../lib/types";

export type ScenarioId = "shoelace" | "meeting" | "meeting_ends";

export interface Scenario {
  id: ScenarioId;
  title: string;
  blurb: string;
  durationMs: number;
  events: ReplayEvent[];
}

// Single-agent architecture:
//   "brain" in event data = Aria, the user's personal health agent.
//   "kinesess" / "glasses" / "whoop" device_ids = MCP servers exposing tools.
//   "discussion" events with direction "question" = Aria → MCP tool call,
//                                  direction "reply"    = MCP → Aria tool result.
// MCPs do not reason; they only stream sensor data and respond to tool calls.

const shoelace: ReplayEvent[] = [
  { offset_ms: 0, type: "agent_connected", payload: { agent: "brain" } },
  { offset_ms: 150, type: "agent_connected", payload: { agent: "kinesess" } },
  { offset_ms: 300, type: "agent_connected", payload: { agent: "glasses" } },

  {
    offset_ms: 800,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "outdoor_running", social: false, ambient_noise_db: 44 },
    },
  },
  {
    offset_ms: 1200,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "good", deviation_degrees: 4.2 },
    },
  },
  {
    offset_ms: 1500,
    type: "state_update",
    payload: { device_id: "brain", key: "mode", data: { mode: "normal" } },
  },
  {
    offset_ms: 1700,
    type: "state_update",
    payload: { device_id: "brain", key: "attention_budget", data: { remaining: 20 } },
  },
  {
    offset_ms: 2500,
    type: "log_entry",
    payload: { agent: "brain", message: "Steady gait via Kinesis Agent, cadence ~152 spm. Posture nominal." },
  },

  // Sudden forward bend at ~5s (signal processor on kinesis agent fires)
  {
    offset_ms: 5000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "bent_forward", deviation_degrees: 38.5 },
    },
  },
  {
    offset_ms: 5400,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Kinesis posture event: deviation jumped 4.2° → 38.5°. Sensor alone is ambiguous. Querying scene before deciding.",
    },
  },
  {
    offset_ms: 6800,
    type: "discussion",
    payload: {
      direction: "question",
      from: "brain",
      to: "glasses",
      message: "glasses.classify_scene()",
    },
  },
  {
    offset_ms: 8500,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "tying_shoelace", social: false, ambient_noise_db: 41 },
    },
  },
  {
    offset_ms: 8700,
    type: "discussion",
    payload: {
      direction: "reply",
      from: "glasses",
      to: "brain",
      message: "{ scene: 'tying_shoelace', social: false, foot_raised: true }",
    },
  },
  {
    offset_ms: 10500,
    type: "state_update",
    payload: {
      device_id: "brain",
      key: "plan",
      data: {
        message: "Visual context = shoelace tie, not slouch. False-positive avoided. No haptic fired.",
      },
    },
  },

  // Resume running
  {
    offset_ms: 13000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "standing_up", deviation_degrees: 12.0 },
    },
  },
  {
    offset_ms: 14500,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "good", deviation_degrees: 4.8 },
    },
  },
  {
    offset_ms: 15000,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "outdoor_running", social: false, ambient_noise_db: 45 },
    },
  },
  {
    offset_ms: 16500,
    type: "log_entry",
    payload: { agent: "brain", message: "Running posture resumed. Recovery 3s. No intervention required." },
  },
  {
    offset_ms: 18500,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Session note: 1 ambiguous body event correctly classified via cross-MCP context.",
    },
  },
];

const meeting: ReplayEvent[] = [
  { offset_ms: 0, type: "agent_connected", payload: { agent: "brain" } },
  { offset_ms: 150, type: "agent_connected", payload: { agent: "kinesess" } },
  { offset_ms: 300, type: "agent_connected", payload: { agent: "glasses" } },

  {
    offset_ms: 800,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "meeting", social: true, ambient_noise_db: 52 },
    },
  },
  {
    offset_ms: 1200,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "good", deviation_degrees: 5.5 },
    },
  },
  {
    offset_ms: 1500,
    type: "state_update",
    payload: { device_id: "brain", key: "mode", data: { mode: "normal" } },
  },
  {
    offset_ms: 1800,
    type: "state_update",
    payload: { device_id: "brain", key: "attention_budget", data: { remaining: 18 } },
  },
  {
    offset_ms: 2400,
    type: "log_entry",
    payload: { agent: "brain", message: "Glasses Agent reports meeting scene, 3 faces, social=true. Tracking posture." },
  },

  // Slouch builds up
  {
    offset_ms: 4000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "mild_slouch", deviation_degrees: 14.2 },
    },
  },
  {
    offset_ms: 6500,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "slouching", deviation_degrees: 21.0 },
    },
  },
  {
    offset_ms: 6800,
    type: "state_update",
    payload: { device_id: "kinesess", key: "tension", data: { level: 0.45 } },
  },
  {
    offset_ms: 7100,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Sustained slouch via Kinesis Agent, deviation 21° over 3s. Verifying social context before intervening.",
    },
  },
  {
    offset_ms: 8500,
    type: "discussion",
    payload: {
      direction: "question",
      from: "brain",
      to: "glasses",
      message: "glasses.classify_scene()",
    },
  },
  {
    offset_ms: 10500,
    type: "discussion",
    payload: {
      direction: "reply",
      from: "glasses",
      to: "brain",
      message: "{ scene: 'meeting', social: true, faces: 3, ambient_db: 52 }",
    },
  },
  {
    offset_ms: 12000,
    type: "state_update",
    payload: { device_id: "brain", key: "mode", data: { mode: "gentle" } },
  },
  {
    offset_ms: 12500,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Mode → gentle. Suppressing haptic — meeting in progress, intervention would be disruptive.",
    },
  },
  {
    offset_ms: 14000,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Logging slouch episode for post-meeting follow-up.",
    },
  },
  {
    offset_ms: 16000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "slouching", deviation_degrees: 23.4 },
    },
  },
  {
    offset_ms: 18000,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Deferred slouch tracked. Will re-check via glasses.classify_scene() when context shifts.",
    },
  },
];

const meetingEnds: ReplayEvent[] = [
  // Continuation of scenario 2 — fast-forwarded to the moment the meeting ends.
  // No connection / setup events: state is silently primed from the prior session.
  {
    offset_ms: 0,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "meeting", social: true, ambient_noise_db: 50 },
    },
  },
  {
    offset_ms: 0,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "slouching", deviation_degrees: 22.8 },
    },
  },
  {
    offset_ms: 0,
    type: "state_update",
    payload: { device_id: "brain", key: "mode", data: { mode: "gentle", silent: true } },
  },
  {
    offset_ms: 0,
    type: "state_update",
    payload: { device_id: "brain", key: "attention_budget", data: { remaining: 17 } },
  },
  {
    offset_ms: 1500,
    type: "log_entry",
    payload: { agent: "brain", message: "Slouch persisting from prior session. Holding intervention while social context active." },
  },

  // Glasses Agent fires scene-change event
  {
    offset_ms: 3500,
    type: "state_update",
    payload: {
      device_id: "glasses",
      key: "context",
      data: { scene: "desk_work", social: false, ambient_noise_db: 28 },
    },
  },
  {
    offset_ms: 4500,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Glasses Agent scene change: meeting → desk_work. 0 faces, ambient 28dB. Social context cleared.",
    },
  },
  {
    offset_ms: 5500,
    type: "state_update",
    payload: { device_id: "brain", key: "mode", data: { mode: "normal" } },
  },
  {
    offset_ms: 6000,
    type: "log_entry",
    payload: { agent: "brain", message: "Mode → normal. Re-evaluating deferred slouch." },
  },
  {
    offset_ms: 7500,
    type: "discussion",
    payload: {
      direction: "question",
      from: "brain",
      to: "kinesess",
      message: "kinesis.get_posture()",
    },
  },
  {
    offset_ms: 8000,
    type: "discussion",
    payload: {
      direction: "reply",
      from: "kinesess",
      to: "brain",
      message: "{ classification: 'slouching', deviation: 22.8°, sustained_s: 64 }",
    },
  },
  {
    offset_ms: 10000,
    type: "discussion",
    payload: {
      direction: "question",
      from: "brain",
      to: "kinesess",
      message: "kinesis.fire_haptic({ pattern: 'gentle_pulse', intensity: 0.4 })",
    },
  },
  {
    offset_ms: 11500,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "last_haptic",
      data: {
        pattern: "gentle_pulse",
        intensity: 0.4,
        reason: "deferred slouch correction post-meeting",
      },
    },
  },
  {
    offset_ms: 11800,
    type: "discussion",
    payload: {
      direction: "reply",
      from: "kinesess",
      to: "brain",
      message: "{ fired: true, ack_ms: 38 }",
    },
  },
  {
    offset_ms: 14000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "improving", deviation_degrees: 12.3 },
    },
  },
  {
    offset_ms: 16000,
    type: "state_update",
    payload: {
      device_id: "kinesess",
      key: "posture",
      data: { classification: "good", deviation_degrees: 5.6 },
    },
  },
  {
    offset_ms: 17000,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Posture corrected. Recovery 5s. Strong response to deferred haptic.",
    },
  },
  {
    offset_ms: 18500,
    type: "log_entry",
    payload: {
      agent: "brain",
      message: "Deferred intervention successful. 1 haptic, 1 correction, 0 social disruptions.",
    },
  },
  {
    offset_ms: 19200,
    type: "state_update",
    payload: { device_id: "brain", key: "attention_budget", data: { remaining: 16 } },
  },
];

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  shoelace: {
    id: "shoelace",
    title: "Running → Shoelace tie",
    blurb:
      "Kinesis Agent reports a deep forward bend. Chloe's Health Agent queries the Glasses Agent for scene context, sees shoelace tying, and skips intervention.",
    durationMs: 20000,
    events: shoelace,
  },
  meeting: {
    id: "meeting",
    title: "Slouching in a meeting",
    blurb:
      "Kinesis Agent reports sustained slouch. Chloe's Health Agent checks Glasses Agent, sees a meeting with 3 faces, and switches to gentle mode — haptic suppressed.",
    durationMs: 20000,
    events: meeting,
  },
  meeting_ends: {
    id: "meeting_ends",
    title: "Meeting ends → deferred haptic",
    blurb:
      "Glasses Agent fires a scene-change event. Chloe's Health Agent re-queries Kinesis posture, fires the deferred haptic, and posture corrects.",
    durationMs: 20000,
    events: meetingEnds,
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ["shoelace", "meeting", "meeting_ends"];
