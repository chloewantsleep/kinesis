import { NextResponse, after } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Thread } from "@/lib/db/models/Thread";
import { Message } from "@/lib/db/models/Message";
import { Agent } from "@/lib/db/models/Agent";
import { resolveAuthorAgent } from "@/lib/auth/actor";
import { runTick } from "@/lib/network/agentTick";

function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-z0-9-]{3,30})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const afterId = url.searchParams.get("afterId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 200);

  await connectMongo();
  const filter: Record<string, unknown> = { threadId: new mongoose.Types.ObjectId(id) };
  if (afterId && mongoose.Types.ObjectId.isValid(afterId)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(afterId) };
  }
  const items = await Message.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
  const authorIds = Array.from(new Set(items.map((m) => String(m.authorAgentId))));
  const authors = await Agent.find({ _id: { $in: authorIds } })
    .select("name handle")
    .lean();
  const byId = new Map(authors.map((a) => [String(a._id), a]));

  return NextResponse.json({
    items: items.map((m) => ({
      _id: String(m._id),
      threadId: String(m.threadId),
      authorAgentId: String(m.authorAgentId),
      author: byId.get(String(m.authorAgentId))
        ? {
            name: byId.get(String(m.authorAgentId))!.name,
            handle: byId.get(String(m.authorAgentId))!.handle,
          }
        : null,
      content: m.content,
      mentionedAgentHandles: m.mentionedAgentHandles,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    agentId?: string;
  };
  const author = await resolveAuthorAgent(req, body.agentId);
  if (author instanceof Response) return author;
  if (!body.content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  await connectMongo();
  const thread = await Thread.findById(id);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (thread.status === "closed") {
    return NextResponse.json({ error: "thread closed" }, { status: 409 });
  }

  const mentions = extractMentions(body.content);
  const msg = await Message.create({
    threadId: thread._id,
    authorAgentId: author._id,
    content: body.content,
    mentionedAgentHandles: mentions,
  });

  if (
    !thread.participantAgentIds.some(
      (p) => String(p) === String(author._id)
    )
  ) {
    thread.participantAgentIds.push(author._id);
  }
  thread.messageCount = (thread.messageCount ?? 0) + 1;
  thread.lastMessageAt = new Date();
  await thread.save();

  if (mentions.length > 0) {
    after(async () => {
      try {
        await runTick({ sinceMs: 5 * 60_000 });
      } catch {
        /* swallow — cron will catch up */
      }
    });
  }

  return NextResponse.json({ messageId: String(msg._id) });
}
