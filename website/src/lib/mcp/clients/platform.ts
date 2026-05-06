import type { HealthClient, ToolDef, ToolResult } from "../types";
import mongoose from "mongoose";
import { Thread } from "@/lib/db/models/Thread";
import { Message } from "@/lib/db/models/Message";
import { Reminder } from "@/lib/db/models/Reminder";
import { Agent } from "@/lib/db/models/Agent";

const TOOLS: ToolDef[] = [
  {
    name: "platform_post_thread_reply",
    description:
      "Post a reply in a thread you've been invited to or have joined. The text may mention other agents with @handle.",
    input_schema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID to reply in." },
        content: { type: "string", description: "Message body. Up to 8000 chars." },
      },
      required: ["thread_id", "content"],
    },
  },
  {
    name: "platform_list_recent_thread_messages",
    description: "Read the last N messages of a thread to understand context before replying.",
    input_schema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        limit: { type: "number", description: "Max messages, default 20." },
      },
      required: ["thread_id"],
    },
  },
  {
    name: "platform_set_reminder",
    description:
      "Schedule a reminder for the user. The platform will surface it on their dashboard at due time.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to remind the user about." },
        in_minutes: {
          type: "number",
          description: "Minutes from now until due. e.g. 60 for 1 hour.",
        },
      },
      required: ["message", "in_minutes"],
    },
  },
];

export class PlatformClient implements HealthClient {
  readonly source = "platform" as unknown as "kinesis"; // satisfy union

  constructor(
    private readonly agentId: mongoose.Types.ObjectId,
    private readonly userId: mongoose.Types.ObjectId
  ) {}

  async listTools(): Promise<ToolDef[]> {
    return TOOLS;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (name === "platform_post_thread_reply") {
        const threadId = String(args.thread_id ?? "");
        const content = String(args.content ?? "");
        if (!threadId || !content) return { ok: false, error: "thread_id and content required" };
        const thread = await Thread.findById(threadId);
        if (!thread) return { ok: false, error: "thread not found" };
        if (thread.status === "closed") return { ok: false, error: "thread closed" };
        const mentions =
          content.match(/@([a-z0-9-]{3,30})/g)?.map((m) => m.slice(1)) ?? [];
        const msg = await Message.create({
          threadId: thread._id,
          authorAgentId: this.agentId,
          content,
          mentionedAgentHandles: Array.from(new Set(mentions)),
        });
        if (
          !thread.participantAgentIds.some(
            (p) => String(p) === String(this.agentId)
          )
        ) {
          thread.participantAgentIds.push(this.agentId);
        }
        thread.messageCount = (thread.messageCount ?? 0) + 1;
        thread.lastMessageAt = new Date();
        await thread.save();
        return { ok: true, data: { messageId: String(msg._id) } };
      }

      if (name === "platform_list_recent_thread_messages") {
        const threadId = String(args.thread_id ?? "");
        const limit = Math.min(Number(args.limit ?? 20), 50);
        if (!threadId) return { ok: false, error: "thread_id required" };
        const items = await Message.find({ threadId: new mongoose.Types.ObjectId(threadId) })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        const authorIds = Array.from(new Set(items.map((m) => String(m.authorAgentId))));
        const authors = await Agent.find({ _id: { $in: authorIds } })
          .select("name handle")
          .lean();
        const byId = new Map(authors.map((a) => [String(a._id), a]));
        return {
          ok: true,
          data: items
            .reverse()
            .map((m) => ({
              author_handle: byId.get(String(m.authorAgentId))?.handle ?? "?",
              content: m.content,
              at: m.createdAt,
            })),
        };
      }

      if (name === "platform_set_reminder") {
        const message = String(args.message ?? "");
        const inMinutes = Number(args.in_minutes ?? 0);
        if (!message || !Number.isFinite(inMinutes) || inMinutes <= 0) {
          return { ok: false, error: "message and positive in_minutes required" };
        }
        const dueAt = new Date(Date.now() + inMinutes * 60_000);
        const r = await Reminder.create({
          userId: this.userId,
          agentId: this.agentId,
          dueAt,
          message,
          status: "pending",
        });
        return { ok: true, data: { reminderId: String(r._id), dueAt } };
      }

      return { ok: false, error: `unknown tool ${name}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
