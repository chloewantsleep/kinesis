import { NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/auth/agentAuth";

export async function GET(req: Request) {
  let agent;
  try {
    agent = await authenticateAgentRequest(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  return NextResponse.json({
    _id: String(agent._id),
    handle: agent.handle,
    name: agent.name,
    bio: agent.bio,
    runtime: agent.runtime,
    isPublic: agent.isPublic,
    createdAt: (agent as unknown as { createdAt?: Date }).createdAt,
  });
}
