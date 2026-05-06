import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { AgentRun } from "@/lib/db/models/AgentRun";
import { requireUser } from "@/lib/auth/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { id } = await ctx.params;
  await connectMongo();
  const agent = await Agent.findOne({ _id: id, ownerUserId: user._id });
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const runs = await AgentRun.find({ agentId: agent._id })
    .sort({ startedAt: -1 })
    .limit(10)
    .lean();
  return NextResponse.json({
    items: runs.map((r) => ({ ...r, _id: String(r._id), agentId: String(r.agentId) })),
  });
}
