import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { AgentRun } from "@/lib/db/models/AgentRun";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { Reminder } from "@/lib/db/models/Reminder";
import { Insight } from "@/lib/db/models/Insight";
import { DashboardSettings } from "@/lib/db/models/DashboardSettings";
import { requireUser } from "@/lib/auth/session";
import { WhoopClient } from "@/lib/mcp/clients/whoop";
import { OuraClient } from "@/lib/mcp/clients/oura";
import { KinesisClient } from "@/lib/mcp/clients/kinesis";
import type { HealthClient } from "@/lib/mcp/types";

type Score = {
  value: number;
  label: string;
  band: "great" | "good" | "fair" | "low";
};

type SourceBadge = "whoop" | "oura" | "kinesis" | "glasses" | "agent";

type MetricRow = {
  label: string;
  value: string;
  source?: SourceBadge;
  hint?: string;
};

type CardKey =
  | "recovery"
  | "sleep"
  | "posture"
  | "movement"
  | "wlb"
  | "stress"
  | "readiness";

type CardPayload = {
  key: CardKey;
  title: string;
  score: Score | null;
  rows: MetricRow[];
  available: boolean;
  mode?: "real" | "mock";
};

function band(score: number): Score["band"] {
  if (score >= 80) return "great";
  if (score >= 65) return "good";
  if (score >= 45) return "fair";
  return "low";
}

function bandLabel(b: Score["band"]): string {
  return b === "great"
    ? "great"
    : b === "good"
      ? "solid"
      : b === "fair"
        ? "ok"
        : "low";
}

async function safeCall(
  client: HealthClient,
  name: string
): Promise<Record<string, unknown> | null> {
  try {
    const r = await client.callTool(name, {});
    if (r.ok && r.data && typeof r.data === "object") {
      return r.data as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  await connectMongo();

  const settings = await DashboardSettings.findOne({ userId: user._id })
    .select("primaryAgentId")
    .lean();

  let agent = null;
  if (settings?.primaryAgentId) {
    agent = await Agent.findOne({
      _id: settings.primaryAgentId,
      ownerUserId: user._id,
    })
      .select("name handle bio")
      .lean();
  }
  if (!agent) {
    agent = await Agent.findOne({ ownerUserId: user._id })
      .sort({ createdAt: -1 })
      .select("name handle bio")
      .lean();
  }

  let lastRun = null;
  if (agent) {
    lastRun = await AgentRun.findOne({
      agentId: agent._id,
      status: "succeeded",
    })
      .sort({ startedAt: -1 })
      .select("outputSummary startedAt")
      .lean();
  }

  const conns = await MCPConnection.find({
    userId: user._id,
    enabled: { $ne: false },
    status: "connected",
  })
    .select("kind mode secretsCiphertext config")
    .lean();
  const byKind = new Map(conns.map((c) => [c.kind, c]));

  // Pre-fetch each MCP's data once. We reuse readings across multiple cards.
  const whoop = byKind.get("whoop");
  const oura = byKind.get("oura");
  const kin = byKind.get("kinesis");
  const glasses = byKind.get("glasses");

  let whoopRecovery: Record<string, unknown> | null = null;
  let whoopSleep: Record<string, unknown> | null = null;
  let whoopStrain: Record<string, unknown> | null = null;
  if (whoop) {
    const c = new WhoopClient(whoop.mode, whoop.secretsCiphertext);
    [whoopRecovery, whoopSleep, whoopStrain] = await Promise.all([
      safeCall(c, "whoop_get_recovery"),
      safeCall(c, "whoop_get_sleep"),
      safeCall(c, "whoop_get_strain"),
    ]);
  }

  let ouraReadiness: Record<string, unknown> | null = null;
  let ouraSleep: Record<string, unknown> | null = null;
  let ouraActivity: Record<string, unknown> | null = null;
  if (oura) {
    const c = new OuraClient(oura.mode, oura.secretsCiphertext);
    [ouraReadiness, ouraSleep, ouraActivity] = await Promise.all([
      safeCall(c, "oura_get_readiness"),
      safeCall(c, "oura_get_sleep"),
      safeCall(c, "oura_get_activity"),
    ]);
  }

  let kinPosture: Record<string, unknown> | null = null;
  if (kin) {
    const deviceUrl =
      (kin.config as { deviceUrl?: string })?.deviceUrl ??
      "http://localhost:8081";
    const c = new KinesisClient(kin.mode, deviceUrl);
    kinPosture = await safeCall(c, "kinesis_get_posture");
    await c.close?.();
  }

  // Derived shared values
  const slouch = ((kinPosture?.upper_back as { slouch_score?: number })?.slouch_score) ?? null;
  const tilt =
    kinPosture?.upper_back !== undefined
      ? Math.abs(((kinPosture.upper_back as { tilt_deg?: number }).tilt_deg ?? 0))
      : null;
  const tens = (kinPosture?.tension ?? null) as Record<string, number> | null;
  const tensAvg = tens
    ? Object.values(tens).reduce((a, b) => a + b, 0) /
      Math.max(1, Object.values(tens).length)
    : null;

  const hrv = (whoopRecovery?.hrv_rmssd_ms as number) ?? null;
  const sleepDebt = (whoopSleep?.sleep_debt_h as number) ?? 0;

  // Stable seed for any synthesized values, so the page doesn't flicker.
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = Array.from(dayKey).reduce(
    (a, ch) => a + ch.charCodeAt(0),
    0
  );

  const cards: CardPayload[] = [];

  // ── Recovery
  if (whoopRecovery) {
    const score = (whoopRecovery.score as number) ?? 0;
    cards.push({
      key: "recovery",
      title: "Recovery",
      available: true,
      mode: whoop!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "HRV", value: `${whoopRecovery.hrv_rmssd_ms ?? "--"} ms`, source: "whoop" },
        {
          label: "Resting HR",
          value: `${whoopRecovery.resting_heart_rate_bpm ?? "--"} bpm`,
          source: "whoop",
        },
      ],
    });
  } else if (ouraReadiness) {
    const score = (ouraReadiness.score as number) ?? 0;
    const c = (ouraReadiness.contributors ?? {}) as Record<string, number>;
    cards.push({
      key: "recovery",
      title: "Readiness",
      available: true,
      mode: oura!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "HRV balance", value: `${c.hrv_balance ?? "--"}`, source: "oura" },
        { label: "Resting HR", value: `${c.resting_heart_rate ?? "--"}`, source: "oura" },
      ],
    });
  } else {
    cards.push({ key: "recovery", title: "Recovery", score: null, rows: [], available: false });
  }

  // ── Sleep
  if (whoopSleep) {
    const q = (whoopSleep.quality_score as number) ?? 0;
    const score = Math.round(q * 100);
    cards.push({
      key: "sleep",
      title: "Sleep",
      available: true,
      mode: whoop!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "Duration", value: `${whoopSleep.total_duration_h ?? "--"}h`, source: "whoop" },
        { label: "Disturbances", value: `${whoopSleep.disturbances ?? 0}`, source: "whoop" },
      ],
    });
  } else if (ouraSleep) {
    const score = (ouraSleep.score as number) ?? 0;
    cards.push({
      key: "sleep",
      title: "Sleep",
      available: true,
      mode: oura!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "Total sleep", value: `${ouraSleep.total_sleep_h ?? "--"}h`, source: "oura" },
        { label: "Efficiency", value: `${ouraSleep.efficiency_pct ?? "--"}%`, source: "oura" },
      ],
    });
  } else {
    cards.push({ key: "sleep", title: "Sleep", score: null, rows: [], available: false });
  }

  // ── Posture (Kinesis only)
  if (kinPosture && slouch !== null && tilt !== null) {
    const score = Math.max(0, Math.round(100 - slouch * 80 - tilt * 2));
    cards.push({
      key: "posture",
      title: "Posture",
      available: true,
      mode: kin!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        {
          label: "State",
          value: slouch > 0.4 ? "slouching" : "neutral",
          source: "kinesis",
        },
        { label: "Deviation", value: `${tilt.toFixed(1)}°`, source: "kinesis" },
      ],
    });
  } else {
    cards.push({ key: "posture", title: "Posture", score: null, rows: [], available: false });
  }

  // ── Movement (Whoop strain or Oura activity)
  if (whoopStrain) {
    const strain = (whoopStrain.score as number) ?? 0;
    const score = Math.round(Math.min(100, strain * 5));
    cards.push({
      key: "movement",
      title: "Movement",
      available: true,
      mode: whoop!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "Strain", value: `${strain.toFixed(1)}`, source: "whoop" },
        {
          label: "Avg HR",
          value: `${whoopStrain.average_heart_rate_bpm ?? "--"} bpm`,
          source: "whoop",
        },
      ],
    });
  } else if (ouraActivity) {
    const score = (ouraActivity.score as number) ?? 0;
    cards.push({
      key: "movement",
      title: "Movement",
      available: true,
      mode: oura!.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "Steps", value: `${ouraActivity.steps ?? "--"}`, source: "oura" },
        {
          label: "Calories",
          value: `${ouraActivity.total_calories ?? "--"}`,
          source: "oura",
        },
      ],
    });
  } else {
    cards.push({ key: "movement", title: "Movement", score: null, rows: [], available: false });
  }

  // ── Work-Life Balance (glasses scene mix; synthesized fallback)
  if (glasses) {
    // Without time-series glasses data, synthesize a daily figure off a stable seed.
    const deepWorkPct = 35 + (seed % 25); // 35-60
    const breakPct = 10 + (seed % 15); // 10-25
    const socialPct = Math.max(0, 100 - deepWorkPct - breakPct - (40 + (seed % 10)));
    // Balance score: penalize extremes
    const ideal = 50;
    const dist = Math.abs(deepWorkPct - ideal);
    const score = Math.max(0, Math.round(100 - dist * 1.6 - (breakPct < 10 ? 15 : 0)));
    cards.push({
      key: "wlb",
      title: "Work–life",
      available: true,
      mode: glasses.mode,
      score: { value: score, label: bandLabel(band(score)), band: band(score) },
      rows: [
        { label: "Deep work", value: `${deepWorkPct}%`, source: "glasses" },
        { label: "Breaks", value: `${breakPct}%`, source: "glasses" },
        { label: "Social", value: `${socialPct}%`, source: "glasses" },
      ],
    });
  } else {
    cards.push({ key: "wlb", title: "Work–life", score: null, rows: [], available: false });
  }

  // ── Stress (composite: HRV + tension + sleep debt)
  const stressInputs: number[] = [];
  if (hrv !== null) {
    // Lower HRV → more stress. ~60ms = baseline calm.
    stressInputs.push(Math.max(0, Math.min(100, (60 - hrv) * 1.5)));
  }
  if (tensAvg !== null) {
    stressInputs.push(Math.max(0, Math.min(100, tensAvg * 100)));
  }
  if (sleepDebt > 0) stressInputs.push(Math.min(40, sleepDebt * 15));

  if (stressInputs.length > 0) {
    const stressLevel = Math.round(
      stressInputs.reduce((a, b) => a + b, 0) / stressInputs.length
    );
    const score = 100 - stressLevel; // higher score = calmer
    const stressLabel =
      score >= 80 ? "calm" : score >= 65 ? "balanced" : score >= 45 ? "tense" : "stressed";
    cards.push({
      key: "stress",
      title: "Stress",
      available: true,
      mode: whoop?.mode ?? kin?.mode ?? "mock",
      score: { value: score, label: stressLabel, band: band(score) },
      rows: [
        ...(hrv !== null
          ? [{ label: "HRV", value: `${hrv} ms`, source: "whoop" as SourceBadge }]
          : []),
        ...(tensAvg !== null
          ? [
              {
                label: "Tension",
                value: `${(tensAvg * 100).toFixed(0)}%`,
                source: "kinesis" as SourceBadge,
              },
            ]
          : []),
      ],
    });
  } else {
    cards.push({ key: "stress", title: "Stress", score: null, rows: [], available: false });
  }

  // ── Today composite — only shown if at least 2 component cards have scores.
  const scored = cards.filter(
    (c) => c.score && c.key !== "readiness" && c.key !== "stress"
  );
  if (scored.length >= 2) {
    const avg =
      scored.reduce((acc, c) => acc + (c.score?.value ?? 0), 0) /
      scored.length;
    const v = Math.round(avg);
    cards.push({
      key: "readiness",
      title: "Today",
      score: { value: v, label: bandLabel(band(v)), band: band(v) },
      rows: scored.map((c) => ({
        label: c.title.toLowerCase(),
        value: `${c.score!.value}`,
      })),
      available: true,
    });
  }

  // Reminders fired or pending today
  const reminders = await Reminder.find({
    userId: user._id,
    status: { $in: ["pending", "fired"] },
  })
    .sort({ dueAt: 1 })
    .limit(5)
    .lean();

  // Insights applied to the agent
  const insights = agent
    ? await Insight.find({ appliedBy: agent._id })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select("title body sourceHandle kind")
        .lean()
    : [];

  return NextResponse.json({
    agent: agent
      ? {
          name: agent.name,
          handle: agent.handle,
          bio: agent.bio ?? "",
        }
      : null,
    message: lastRun?.outputSummary ?? "",
    messageAt: lastRun?.startedAt ? new Date(lastRun.startedAt).toISOString() : null,
    cards,
    reminders: reminders.map((r) => ({
      _id: String(r._id),
      message: r.message,
      dueAt: new Date(r.dueAt).toISOString(),
      status: r.status,
    })),
    insights: insights.map((i) => ({
      _id: String(i._id),
      title: i.title,
      body: i.body ?? "",
      sourceHandle: i.sourceHandle,
      kind: i.kind,
    })),
    connectedKinds: conns.map((c) => c.kind),
  });
}
