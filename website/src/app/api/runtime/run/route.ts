import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { requireUser } from "@/lib/auth/session";
import { runAgentTurn } from "@/lib/mcp/runtime";

export const maxDuration = 60;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const { agentId, prompt } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    prompt?: string;
  };
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  await connectMongo();
  const agent = await Agent.findOne({ _id: agentId, ownerUserId: user._id });
  if (!agent) {
    return NextResponse.json({ error: "agent not found" }, { status: 404 });
  }

  try {
    const runId = await runAgentTurn({
      agentId,
      trigger: "manual",
      triggerNote: prompt,
    });
    return NextResponse.json({ runId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "run failed" },
      { status: 500 }
    );
  }
}
