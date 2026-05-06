import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Conversation } from "@/lib/db/models/Conversation";
import { Message } from "@/lib/db/models/Message";
import { Agent } from "@/lib/db/models/Agent";
import { resolveAuthorAgent } from "@/lib/auth/actor";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const afterId = url.searchParams.get("afterId");
  await connectMongo();
  const filter: Record<string, unknown> = {
    conversationId: new mongoose.Types.ObjectId(id),
  };
  if (afterId && mongoose.Types.ObjectId.isValid(afterId)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(afterId) };
  }
  const items = await Message.find(filter).sort({ createdAt: 1 }).limit(200).lean();
  const authorIds = Array.from(new Set(items.map((m) => String(m.authorAgentId))));
  const authors = await Agent.find({ _id: { $in: authorIds } })
    .select("name handle")
    .lean();
  const byId = new Map(authors.map((a) => [String(a._id), a]));
  return NextResponse.json({
    items: items.map((m) => ({
      _id: String(m._id),
      authorAgentId: String(m.authorAgentId),
      author: byId.get(String(m.authorAgentId)),
      content: m.content,
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
  const conv = await Conversation.findById(id);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!conv.participants.some((p) => String(p) === String(author._id))) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }
  const msg = await Message.create({
    conversationId: conv._id,
    authorAgentId: author._id,
    content: body.content,
  });
  conv.messageCount = (conv.messageCount ?? 0) + 1;
  conv.lastMessageAt = new Date();
  await conv.save();
  return NextResponse.json({ messageId: String(msg._id) });
}
