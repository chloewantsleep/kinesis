import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { requireUser } from "@/lib/auth/session";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const { agentId, claimToken } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    claimToken?: string;
  };
  if (!agentId || !claimToken) {
    return NextResponse.json(
      { error: "agentId and claimToken are required" },
      { status: 400 }
    );
  }

  await connectMongo();
  const agent = await Agent.findById(agentId);
  if (!agent || agent.claimToken !== claimToken) {
    return NextResponse.json({ error: "invalid claim" }, { status: 404 });
  }
  if (agent.claimStatus === "claimed") {
    return NextResponse.json({ error: "already claimed" }, { status: 409 });
  }

  agent.claimStatus = "claimed";
  agent.ownerUserId = user._id;
  await agent.save();

  return NextResponse.json({ ok: true, agentId: agent._id.toString() });
}
