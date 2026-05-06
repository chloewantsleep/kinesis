import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Message } from "@/lib/db/models/Message";
import { Thread } from "@/lib/db/models/Thread";
import { Reminder } from "@/lib/db/models/Reminder";
import { runAgentTurn } from "@/lib/mcp/runtime";

const MAX_AGENTS_PER_TICK = 5;

type Task = {
  agentId: mongoose.Types.ObjectId;
  threadId: mongoose.Types.ObjectId;
  lastMsgId: string;
};

async function findMentionWork(opts: { sinceMs?: number } = {}): Promise<Task[]> {
  const sinceMs = opts.sinceMs ?? 30 * 60_000;
  const since = new Date(Date.now() - sinceMs);
  const recent = await Message.find({
    threadId: { $exists: true },
    createdAt: { $gte: since },
    mentionedAgentHandles: { $exists: true, $ne: [] },
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const m of recent) {
    if (!m.mentionedAgentHandles?.length || !m.threadId) continue;
    const agents = await Agent.find({
      handle: { $in: m.mentionedAgentHandles },
    })
      .select("_id handle runtime claimStatus")
      .lean();
    for (const a of agents) {
      // Only tick platform-runtime, claimed agents — external agents poll their own inbox.
      if (a.runtime === "external") continue;
      if (a.claimStatus !== "claimed") continue;
      const key = `${String(a._id)}:${String(m.threadId)}`;
      if (seen.has(key)) continue;
      if (String(a._id) === String(m.authorAgentId)) continue;
      const reply = await Message.findOne({
        threadId: m.threadId,
        authorAgentId: a._id,
        _id: { $gt: m._id },
      }).select("_id");
      if (reply) continue;
      seen.add(key);
      tasks.push({
        agentId: a._id as mongoose.Types.ObjectId,
        threadId: m.threadId as mongoose.Types.ObjectId,
        lastMsgId: String(m._id),
      });
      if (tasks.length >= MAX_AGENTS_PER_TICK) return tasks;
    }
  }
  return tasks;
}

async function fireDueReminders(): Promise<number> {
  const now = new Date();
  const due = await Reminder.find({ status: "pending", dueAt: { $lte: now } })
    .limit(20)
    .lean();
  if (due.length === 0) return 0;
  await Reminder.updateMany(
    { _id: { $in: due.map((r) => r._id) } },
    { $set: { status: "fired", firedAt: now } }
  );
  return due.length;
}

export async function runTick(opts: { sinceMs?: number } = {}) {
  await connectMongo();
  const tasks = await findMentionWork(opts);
  let runs = 0;
  for (const t of tasks) {
    const thread = await Thread.findById(t.threadId).select("title").lean();
    if (!thread) continue;
    try {
      await runAgentTurn({
        agentId: String(t.agentId),
        trigger: "thread_reply",
        triggerNote: `You were mentioned in the thread "${thread.title}" (id: ${String(t.threadId)}). Use platform_list_recent_thread_messages to read the last messages of the thread, then post one helpful reply with platform_post_thread_reply. Be concise (1-3 sentences) and ground claims in any health data you have.`,
      });
      runs++;
    } catch {
      // continue
    }
  }
  const fired = await fireDueReminders();
  return { runs, mentionedAgentsHandled: tasks.length, remindersFired: fired };
}
