import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { AgentRun } from "@/lib/db/models/AgentRun";
import { Reminder } from "@/lib/db/models/Reminder";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { requireUser } from "@/lib/auth/session";

type LogEntry = {
  id: string;
  timestamp: string;
  source: "agent_run" | "reminder" | "connection";
  level: "info" | "warn" | "error" | "success";
  agent?: string;
  message: string;
  detail?: string;
};

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10),
    200
  );

  await connectMongo();

  const userAgents = await Agent.find({ ownerUserId: user._id })
    .select("name handle")
    .lean();
  const agentById = new Map(
    userAgents.map((a) => [String(a._id), { name: a.name, handle: a.handle }])
  );
  const agentIds = userAgents.map((a) => a._id);

  const [runs, reminders, conns] = await Promise.all([
    AgentRun.find({ agentId: { $in: agentIds } })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean(),
    Reminder.find({ userId: user._id })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
    MCPConnection.find({ userId: user._id })
      .sort({ updatedAt: -1 })
      .select("kind status mode lastUsedAt lastError updatedAt createdAt")
      .lean(),
  ]);

  const entries: LogEntry[] = [];

  for (const r of runs) {
    const meta = agentById.get(String(r.agentId));
    const agentLabel = meta ? `@${meta.handle}` : "agent";
    if (r.status === "running") {
      entries.push({
        id: `run-start-${String(r._id)}`,
        timestamp: new Date(r.startedAt).toISOString(),
        source: "agent_run",
        level: "info",
        agent: agentLabel,
        message: `${agentLabel} started a run`,
        detail: r.triggerNote || undefined,
      });
    } else if (r.status === "succeeded") {
      entries.push({
        id: `run-end-${String(r._id)}`,
        timestamp: new Date(r.finishedAt ?? r.startedAt).toISOString(),
        source: "agent_run",
        level: "success",
        agent: agentLabel,
        message: `${agentLabel} finished (${r.toolCalls.length} tool ${
          r.toolCalls.length === 1 ? "call" : "calls"
        })`,
        detail: r.outputSummary?.slice(0, 240) || undefined,
      });
    } else if (r.status === "failed") {
      entries.push({
        id: `run-fail-${String(r._id)}`,
        timestamp: new Date(r.finishedAt ?? r.startedAt).toISOString(),
        source: "agent_run",
        level: "error",
        agent: agentLabel,
        message: `${agentLabel} failed`,
        detail: r.error || undefined,
      });
    }
  }

  for (const rem of reminders) {
    if (rem.status === "fired" && rem.firedAt) {
      entries.push({
        id: `reminder-fired-${String(rem._id)}`,
        timestamp: new Date(rem.firedAt).toISOString(),
        source: "reminder",
        level: "warn",
        message: `Reminder: ${rem.message}`,
      });
    } else if (rem.status === "pending") {
      entries.push({
        id: `reminder-set-${String(rem._id)}`,
        timestamp: new Date(rem.createdAt as Date).toISOString(),
        source: "reminder",
        level: "info",
        message: `Reminder scheduled for ${new Date(
          rem.dueAt
        ).toLocaleString()}`,
        detail: rem.message,
      });
    }
  }

  for (const c of conns) {
    if (c.lastError) {
      entries.push({
        id: `conn-err-${String(c._id)}`,
        timestamp: new Date(c.updatedAt as Date).toISOString(),
        source: "connection",
        level: "error",
        agent: c.kind,
        message: `${c.kind} connection error`,
        detail: c.lastError,
      });
    } else {
      entries.push({
        id: `conn-${String(c._id)}-${String(c.updatedAt)}`,
        timestamp: new Date(c.updatedAt as Date).toISOString(),
        source: "connection",
        level: "info",
        agent: c.kind,
        message: `${c.kind} ${c.mode === "mock" ? "(mock)" : ""} ${c.status}`,
      });
    }
  }

  entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({ entries: entries.slice(0, limit) });
}
