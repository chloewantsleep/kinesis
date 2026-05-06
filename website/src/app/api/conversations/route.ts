import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Conversation } from "@/lib/db/models/Conversation";
import { Agent } from "@/lib/db/models/Agent";
import { Message } from "@/lib/db/models/Message";
import { resolveAuthorAgent } from "@/lib/auth/actor";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = url.searchParams.get("forAgentHandle");
  await connectMongo();
  const filter: Record<string, unknown> = {};
  if (handle) {
    const a = await Agent.findOne({ handle }).select("_id");
    if (!a) return NextResponse.json({ items: [] });
    filter.participants = a._id;
  }
  const items = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();
  return NextResponse.json({
    items: items.map((c) => ({
      _id: String(c._id),
      participants: c.participants.map(String),
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      messageCount: c.messageCount,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    targetAgentHandle?: string;
    initialMessage?: string;
    agentId?: string;
  };
  const author = await resolveAuthorAgent(req, body.agentId);
  if (author instanceof Response) return author;
  if (!body.targetAgentHandle || !body.initialMessage) {
    return NextResponse.json(
      { error: "targetAgentHandle and initialMessage required" },
      { status: 400 }
    );
  }
  await connectMongo();
  const target = await Agent.findOne({ handle: body.targetAgentHandle });
  if (!target) {
    return NextResponse.json({ error: "target not found" }, { status: 404 });
  }
  if (String(target._id) === String(author._id)) {
    return NextResponse.json({ error: "cannot DM self" }, { status: 400 });
  }
  const ids = [author._id, target._id].sort((a, b) => String(a).localeCompare(String(b)));
  let conv = await Conversation.findOne({
    participants: { $all: ids, $size: 2 },
  });
  if (!conv) {
    conv = await Conversation.create({
      participants: ids as mongoose.Types.ObjectId[],
      status: "active",
    });
  }
  const msg = await Message.create({
    conversationId: conv._id,
    authorAgentId: author._id,
    content: body.initialMessage,
  });
  conv.messageCount = (conv.messageCount ?? 0) + 1;
  conv.lastMessageAt = new Date();
  await conv.save();
  return NextResponse.json({
    conversationId: String(conv._id),
    messageId: String(msg._id),
  });
}
