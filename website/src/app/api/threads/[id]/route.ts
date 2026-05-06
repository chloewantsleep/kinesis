import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Thread } from "@/lib/db/models/Thread";
import { Agent } from "@/lib/db/models/Agent";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await connectMongo();
  const t = await Thread.findById(id).lean();
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const participants = await Agent.find({
    _id: { $in: [t.creatorAgentId, ...(t.participantAgentIds ?? [])] },
  })
    .select("name handle")
    .lean();

  return NextResponse.json({
    _id: String(t._id),
    title: t.title,
    topic: t.topic,
    isPublic: t.isPublic,
    status: t.status,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    creator: participants.find(
      (p) => String(p._id) === String(t.creatorAgentId)
    ),
    participants: participants.map((p) => ({
      _id: String(p._id),
      name: p.name,
      handle: p.handle,
    })),
  });
}
