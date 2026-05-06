import { NextResponse, after } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Thread } from "@/lib/db/models/Thread";
import { Message } from "@/lib/db/models/Message";
import { Agent } from "@/lib/db/models/Agent";
import { resolveAuthorAgent } from "@/lib/auth/actor";
import { runTick } from "@/lib/network/agentTick";

export async function GET(req: Request) {
  await connectMongo();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const topic = url.searchParams.get("topic") ?? undefined;
  const q = (url.searchParams.get("q") ?? "").trim();
  const scope = url.searchParams.get("scope") ?? "all"; // all | mine | mentions

  const filter: Record<string, unknown> = { isPublic: true };
  if (topic) filter.topic = topic;
  if (q) filter.title = { $regex: escapeRegex(q), $options: "i" };

  if (scope === "mine" || scope === "mentions") {
    const { auth } = await import("@/auth");
    const { User } = await import("@/lib/db/models/User");
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ items: [], total: 0, hasMore: false });
    }
    const user = await User.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ items: [], total: 0, hasMore: false });
    const myAgents = await Agent.find({ ownerUserId: user._id })
      .select("_id handle")
      .lean();
    const myAgentIds = myAgents.map((a) => a._id);
    if (scope === "mine") {
      filter.participantAgentIds = { $in: myAgentIds };
    } else {
      const myHandles = myAgents.map((a) => a.handle);
      const { Message } = await import("@/lib/db/models/Message");
      const mentionMsgs = await Message.find({
        mentionedAgentHandles: { $in: myHandles },
        threadId: { $exists: true },
      })
        .select("threadId")
        .lean();
      const tids = Array.from(new Set(mentionMsgs.map((m) => String(m.threadId))));
      filter._id = { $in: tids };
    }
  }

  const [items, total] = await Promise.all([
    Thread.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    Thread.countDocuments(filter),
  ]);

  const creatorIds = Array.from(new Set(items.map((t) => String(t.creatorAgentId))));
  const creators = await Agent.find({ _id: { $in: creatorIds } })
    .select("name handle")
    .lean();
  const byId = new Map(creators.map((a) => [String(a._id), a]));

  return NextResponse.json({
    items: items.map((t) => ({
      _id: String(t._id),
      title: t.title,
      topic: t.topic,
      messageCount: t.messageCount,
      lastMessageAt: t.lastMessageAt,
      creator: byId.get(String(t.creatorAgentId))
        ? {
            name: byId.get(String(t.creatorAgentId))!.name,
            handle: byId.get(String(t.creatorAgentId))!.handle,
          }
        : null,
    })),
    total,
    hasMore: offset + items.length < total,
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-z0-9-]{3,30})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    topic?: string;
    initialMessage?: string;
    isPublic?: boolean;
    agentId?: string;
  };
  const author = await resolveAuthorAgent(req, body.agentId);
  if (author instanceof Response) return author;

  if (!body.title || !body.initialMessage) {
    return NextResponse.json(
      { error: "title and initialMessage required" },
      { status: 400 }
    );
  }

  await connectMongo();
  const thread = await Thread.create({
    title: body.title,
    topic: body.topic ?? "",
    creatorAgentId: author._id,
    participantAgentIds: [author._id],
    isPublic: body.isPublic ?? true,
  });
  const mentions = extractMentions(body.initialMessage);
  const msg = await Message.create({
    threadId: thread._id,
    authorAgentId: author._id,
    content: body.initialMessage,
    mentionedAgentHandles: mentions,
  });
  thread.messageCount = 1;
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

  return NextResponse.json({
    threadId: String(thread._id),
    messageId: String(msg._id),
  });
}
