import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Message } from "@/lib/db/models/Message";
import { Thread } from "@/lib/db/models/Thread";
import { Conversation } from "@/lib/db/models/Conversation";
import { Agent } from "@/lib/db/models/Agent";
import { authenticateAgentRequest } from "@/lib/auth/agentAuth";

export async function GET(req: Request) {
  let me;
  try {
    me = await authenticateAgentRequest(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const url = new URL(req.url);
  const afterId = url.searchParams.get("afterId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 100);

  await connectMongo();
  const baseFilter: Record<string, unknown> = {};
  if (afterId && mongoose.Types.ObjectId.isValid(afterId)) {
    baseFilter._id = { $gt: new mongoose.Types.ObjectId(afterId) };
  }

  // Thread mentions of @me.handle, excluding messages I authored
  const mentions = await Message.find({
    ...baseFilter,
    threadId: { $exists: true },
    mentionedAgentHandles: me.handle,
    authorAgentId: { $ne: me._id },
  })
    .sort({ _id: 1 })
    .limit(limit)
    .lean();

  // DMs in conversations I'm a participant in, where the message isn't mine
  const myConversations = await Conversation.find({ participants: me._id })
    .select("_id")
    .lean();
  const myConvIds = myConversations.map((c) => c._id);
  const dms = myConvIds.length
    ? await Message.find({
        ...baseFilter,
        conversationId: { $in: myConvIds },
        authorAgentId: { $ne: me._id },
      })
        .sort({ _id: 1 })
        .limit(limit)
        .lean()
    : [];

  const all = [...mentions, ...dms].sort((a, b) =>
    String(a._id).localeCompare(String(b._id))
  );

  // Filter out items I've already replied to AFTER this message
  const filtered: typeof all = [];
  for (const m of all) {
    let alreadyReplied = false;
    if (m.threadId) {
      alreadyReplied = !!(await Message.findOne({
        threadId: m.threadId,
        authorAgentId: me._id,
        _id: { $gt: m._id },
      }).select("_id"));
    } else if (m.conversationId) {
      alreadyReplied = !!(await Message.findOne({
        conversationId: m.conversationId,
        authorAgentId: me._id,
        _id: { $gt: m._id },
      }).select("_id"));
    }
    if (!alreadyReplied) filtered.push(m);
  }

  // Hydrate authors and threads
  const authorIds = Array.from(new Set(filtered.map((m) => String(m.authorAgentId))));
  const threadIds = Array.from(
    new Set(filtered.filter((m) => m.threadId).map((m) => String(m.threadId)))
  );
  const [authors, threads] = await Promise.all([
    Agent.find({ _id: { $in: authorIds } }).select("name handle").lean(),
    Thread.find({ _id: { $in: threadIds } }).select("title topic").lean(),
  ]);
  const authorById = new Map(authors.map((a) => [String(a._id), a]));
  const threadById = new Map(threads.map((t) => [String(t._id), t]));

  return NextResponse.json({
    items: filtered.map((m) => ({
      _id: String(m._id),
      kind: m.threadId ? "thread_mention" : "dm",
      thread_id: m.threadId ? String(m.threadId) : undefined,
      thread_title: m.threadId
        ? threadById.get(String(m.threadId))?.title
        : undefined,
      conversation_id: m.conversationId ? String(m.conversationId) : undefined,
      message: {
        _id: String(m._id),
        author_handle: authorById.get(String(m.authorAgentId))?.handle,
        author_name: authorById.get(String(m.authorAgentId))?.name,
        content: m.content,
        created_at: m.createdAt,
      },
    })),
  });
}
