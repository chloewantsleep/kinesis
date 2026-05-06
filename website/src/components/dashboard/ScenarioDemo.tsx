"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardEvent, ContextBarState, ReplayEvent, AgentId } from "../../lib/types";
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from "../../data/replay-scenarios";

// Display labels for the single-agent + MCPs architecture.
// brain   = Aria (the one LLM agent)
// kinesess/glasses = MCP servers (no on-device LLM)
const DISPLAY_NAME: Record<AgentId, string> = {
  brain: "Chloe's Health Agent",
  kinesess: "Kinesis Agent",
  glasses: "Glasses Agent",
  system: "system",
};

const INITIAL_CTX: ContextBarState = {
  posture: "--",
  deviation: "--",
  scene: "--",
  social: false,
  tension: "--",
  mode: "normal",
  budget: 20,
};

interface AgentCardProps {
  label: string;
  poweredBy: string;
  active: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

function AgentCard({ label, poweredBy, active, onToggle, children }: AgentCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-border/50 h-full">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-normal text-base tracking-wide truncate">{label}</h3>
        <button
          onClick={onToggle}
          type="button"
          className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
            active ? "bg-orange-400" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
              active ? "left-5.5" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-muted mb-4">{poweredBy}</p>
      {children}
    </div>
  );
}

interface McpCardProps {
  title: string;
  poweredBy: string;
  on: boolean;
  onToggle: () => void;
  items: { label: string; value?: string; dot?: string }[];
  sensors: { label: string; color: string }[];
}

function McpCard({ title, poweredBy, on, onToggle, items, sensors }: McpCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-border/50 h-full">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h3 className="font-normal text-base tracking-wide truncate">{title}</h3>
          <p className="text-xs text-muted">{poweredBy}</p>
        </div>
        <button
          onClick={onToggle}
          type="button"
          className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
            on ? "bg-orange-400" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
              on ? "left-5.5" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <ul className={`mt-4 text-sm space-y-1 ${on ? "" : "opacity-40"}`}>
        {items.map((it) => (
          <li
            key={it.label}
            className="flex items-baseline gap-2 leading-snug"
          >
            <span className="shrink-0">&#x2022;</span>
            {it.dot && (
              <span
                className="w-2 h-2 rounded-full self-center"
                style={{ background: it.dot }}
              />
            )}
            <span className="shrink-0">{it.label}</span>
            {it.value !== undefined && (
              <span className="text-muted truncate">{it.value}</span>
            )}
          </li>
        ))}
      </ul>
      <div
        className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 ${
          on ? "" : "opacity-40"
        }`}
      >
        {sensors.map((s) => (
          <StatusDot key={s.label} color={s.color} label={s.label} />
        ))}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted">
        mock · {on ? "connected" : "disconnected"}
      </p>
    </div>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function postureColor(label: string) {
  if (label === "good") return "#98c379";
  if (label === "--") return "#aaa";
  if (label.includes("improving") || label.includes("standing")) return "#f0c040";
  return "#e06c75";
}

export default function ScenarioDemo() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("shoelace");
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [ctx, setCtx] = useState<ContextBarState>(INITIAL_CTX);
  const [brainOn, setBrainOn] = useState(true);
  const [kinesisOn, setKinesisOn] = useState(true);
  const [glassesOn, setGlassesOn] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());
  const eventIndexRef = useRef(0);
  const runIdRef = useRef(0);

  const scenario = SCENARIOS[scenarioId];

  const addEvent = useCallback((ev: DashboardEvent) => {
    setEvents((prev) => {
      const next = [...prev, ev];
      if (next.length > 200) next.splice(0, next.length - 200);
      return next;
    });
  }, []);

  const processReplayEvent = useCallback(
    (re: ReplayEvent) => {
      const p = re.payload as Record<string, unknown>;

      if (re.type === "agent_connected") {
        const agent = p.agent as string;
        addEvent({
          id: `${runIdRef.current}-${re.offset_ms}-conn`,
          agent: agent as DashboardEvent["agent"],
          type: "scene",
          message: `${DISPLAY_NAME[agent as AgentId] ?? agent} connected`,
          timestamp: Date.now(),
        });
        return;
      }

      if (re.type === "log_entry") {
        addEvent({
          id: `${runIdRef.current}-${re.offset_ms}-log`,
          agent: (p.agent as DashboardEvent["agent"]) ?? "system",
          type: "decision",
          message: p.message as string,
          timestamp: Date.now(),
        });
        return;
      }

      if (re.type === "discussion") {
        addEvent({
          id: `${runIdRef.current}-${re.offset_ms}-disc`,
          agent: p.from as DashboardEvent["agent"],
          from: p.from as DashboardEvent["agent"],
          to: p.to as DashboardEvent["agent"],
          type: p.direction === "question" ? "question" : "reply",
          message: p.message as string,
          timestamp: Date.now(),
        });
        return;
      }

      if (re.type === "state_update") {
        const data = p.data as Record<string, unknown>;
        const did = p.device_id as string;
        const key = p.key as string;

        if (did === "kinesess" && key === "posture") {
          const cls = (data.classification as string) ?? "unknown";
          const dev = ((data.deviation_degrees as number) ?? 0).toFixed(1);
          setCtx((c) => ({ ...c, posture: cls.replace(/_/g, " "), deviation: dev + "°" }));
        } else if (did === "glasses" && key === "context") {
          const scene = ((data.scene as string) ?? "unknown").replace(/_/g, " ");
          setCtx((c) => ({ ...c, scene, social: !!data.social }));
        } else if (did === "kinesess" && key === "tension") {
          setCtx((c) => ({
            ...c,
            tension: (((data.level as number) ?? 0) * 100).toFixed(0) + "%",
          }));
        } else if (did === "brain" && key === "mode") {
          const mode = (data.mode as string) ?? "normal";
          setCtx((c) => ({ ...c, mode }));
          if (!data.silent) {
            addEvent({
              id: `${runIdRef.current}-${re.offset_ms}-mode`,
              agent: "brain",
              type: "decision",
              message: `Mode set to ${mode}`,
              timestamp: Date.now(),
            });
          }
        } else if (did === "brain" && key === "attention_budget") {
          setCtx((c) => ({ ...c, budget: (data.remaining as number) ?? c.budget }));
        } else if (did === "kinesess" && key === "last_haptic") {
          addEvent({
            id: `${runIdRef.current}-${re.offset_ms}-haptic`,
            agent: "kinesess",
            type: "haptic",
            message: `Haptic: ${data.pattern} at intensity ${((data.intensity as number) ?? 0).toFixed(1)}`,
            detail: data.reason as string,
            timestamp: Date.now(),
          });
        } else if (did === "glasses" && key === "speech_command") {
          addEvent({
            id: `${runIdRef.current}-${re.offset_ms}-speech`,
            agent: "glasses",
            type: "speech",
            message: `Speaking: "${data.message}"`,
            timestamp: Date.now(),
          });
        } else if (did === "brain" && key === "plan" && data.message) {
          addEvent({
            id: `${runIdRef.current}-${re.offset_ms}-plan`,
            agent: "brain",
            type: "decision",
            message: data.message as string,
            timestamp: Date.now(),
          });
        }
      }
    },
    [addEvent]
  );

  // Replay engine — restarts whenever scenario changes or play is toggled on
  useEffect(() => {
    if (!isPlaying) return;

    runIdRef.current += 1;
    startTimeRef.current = Date.now();
    eventIndexRef.current = 0;
    setEvents([]);
    setCtx(INITIAL_CTX);
    setFinished(false);
    setElapsed(0);

    const data = scenario.events;
    const lastOffset = data.length > 0 ? data[data.length - 1].offset_ms : 0;
    const totalMs = Math.max(scenario.durationMs, lastOffset);

    const interval = setInterval(() => {
      const now = Date.now();
      const el = now - startTimeRef.current;
      setElapsed(el);

      while (
        eventIndexRef.current < data.length &&
        data[eventIndexRef.current].offset_ms <= el
      ) {
        processReplayEvent(data[eventIndexRef.current]);
        eventIndexRef.current++;
      }

      if (el >= totalMs) {
        setFinished(true);
        setIsPlaying(false);
        setElapsed(totalMs);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, scenario, processReplayEvent]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.min(ms, scenario.durationMs));
    return (total / 1000).toFixed(1) + "s";
  };

  const eventTypeColor = (type: DashboardEvent["type"]) => {
    switch (type) {
      case "question":
        return "text-blue-500";
      case "reply":
        return "text-green-600";
      case "haptic":
        return "text-orange-500";
      case "speech":
        return "text-green-600";
      case "decision":
        return "text-yellow-600";
      case "scene":
        return "text-cyan-600";
      case "trigger":
        return "text-orange-500";
      default:
        return "text-muted";
    }
  };

  const restart = () => {
    if (isPlaying) {
      runIdRef.current += 1;
      startTimeRef.current = Date.now();
      eventIndexRef.current = 0;
      setEvents([]);
      setCtx(INITIAL_CTX);
      setFinished(false);
      setElapsed(0);
    } else {
      setIsPlaying(true);
    }
  };

  const progress = Math.min(100, (elapsed / scenario.durationMs) * 100);

  return (
    <div>
      {/* Scenario picker */}
      <div className="mb-4 md:mb-6 bg-white rounded-xl border border-border/50 shadow-sm p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-3 md:mb-4">
          {SCENARIO_ORDER.map((id, idx) => {
            const s = SCENARIOS[id];
            const active = id === scenarioId;
            return (
              <button
                key={id}
                onClick={() => setScenarioId(id)}
                type="button"
                className={`text-left px-3 py-1.5 rounded-md text-xs font-light tracking-wide border transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {idx + 1}. {s.title}
              </button>
            );
          })}
        </div>
        <p className="text-xs md:text-sm text-muted font-light leading-relaxed">
          {scenario.blurb}
        </p>
        <div className="mt-3 md:mt-4 flex items-center gap-3 md:gap-4">
          <div className="flex-1 min-w-0 h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-orange-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] md:text-xs text-muted font-mono shrink-0 tabular-nums">
            {formatTime(elapsed)} / {(scenario.durationMs / 1000).toFixed(0)}s
          </span>
          <button
            onClick={restart}
            type="button"
            className="shrink-0 px-3 py-1 rounded-md border border-border text-xs font-light tracking-wide hover:bg-surface"
          >
            {finished ? "Replay" : isPlaying ? "Restart" : "Play"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        {/* Aria — the single LLM agent */}
        <div className="order-1 lg:col-span-2">
          <AgentCard
            label="Chloe's Health Agent"
            poweredBy="Powered by Kinesis"
            active={brainOn}
            onToggle={() => setBrainOn((v) => !v)}
          >
            <div className={`space-y-1 text-sm ${brainOn ? "" : "opacity-40"}`}>
              <div>
                mode: <StatusDot color="#c678dd" label={ctx.mode} />
              </div>
              <div className="text-muted text-xs">
                attention budget: <span className="text-foreground">{ctx.budget}</span>
              </div>
            </div>
          </AgentCard>
        </div>

        {/* System Log — bottom on mobile, right column spanning 2 rows on lg */}
        <div className="order-6 lg:order-2 lg:row-span-2">
          <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-border/50 h-full flex flex-col">
            <h3 className="font-normal text-base tracking-wide mb-1">System Log</h3>
            <p className="text-xs text-muted mb-3">Live agent activity</p>
            <div
              ref={logRef}
              className="overflow-y-auto text-xs space-y-2 font-mono h-[50vh] md:h-[480px]"
            >
              {events.length === 0 && (
                <p className="text-muted italic font-light">Waiting for events…</p>
              )}
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-col gap-0.5 leading-relaxed border-b border-surface/50 pb-2"
                >
                  <div className="flex gap-2">
                    <span className="text-muted shrink-0">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`font-semibold shrink-0 ${eventTypeColor(ev.type)}`}
                    >
                      [{DISPLAY_NAME[ev.agent] ?? ev.agent}]
                    </span>
                    <span className="text-foreground/80">
                      {ev.from && ev.to && (
                        <span className="text-muted">
                          {DISPLAY_NAME[ev.from]} → {DISPLAY_NAME[ev.to]}:{" "}
                        </span>
                      )}
                      {ev.message}
                    </span>
                  </div>
                  {ev.detail && (
                    <div className="pl-2 text-[10px] text-muted whitespace-pre-wrap break-all">
                      {ev.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MCP pair — square cards side by side */}
        <div className="order-2 lg:order-3 lg:col-span-2 grid grid-cols-2 gap-3 md:gap-4">
          <McpCard
            title="Kinesis Agent"
            poweredBy="Powered by Kinesis"
            on={kinesisOn}
            onToggle={() => setKinesisOn((v) => !v)}
            items={[
              { label: "posture", value: ctx.posture, dot: postureColor(ctx.posture) },
              { label: "deviation", value: ctx.deviation },
              { label: "tension", value: ctx.tension },
            ]}
            sensors={[
              { label: "IMU 01", color: "#f0c040" },
              { label: "IMU 02", color: "#f0c040" },
              { label: "EMG", color: "#f0c040" },
            ]}
          />
          <McpCard
            title="Glasses Agent"
            poweredBy="Powered by Meta AI Glasses"
            on={glassesOn}
            onToggle={() => setGlassesOn((v) => !v)}
            items={[
              { label: "scene", value: ctx.scene, dot: "#56b6c2" },
              { label: "social", value: ctx.social ? "yes" : "no" },
            ]}
            sensors={[
              { label: "camera", color: "#888" },
              { label: "mic", color: "#888" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
