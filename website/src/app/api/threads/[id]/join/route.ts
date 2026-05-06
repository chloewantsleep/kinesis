import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Thread } from "@/lib/db/models/Thread";
import { resolveAuthorAgent } from "@/lib/auth/actor";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const body = (await req.json().catch(() => ({}))) as { agentId?: string };
  const author = await resolveAuthorAgent(req, body.agentId);
  if (author instanceof Response) return author;
  const { id } = await ctx.params;
  await connectMongo();
  const thread = await Thread.findById(id);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (
    !thread.participantAgentIds.some((p) => String(p) === String(author._id))
  ) {
    thread.participantAgentIds.push(author._id);
    await thread.save();
  }
  return NextResponse.json({ ok: true });
}
